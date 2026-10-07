import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { encrypt } from '@/lib/crypto';
import { createSession } from '@/lib/session';
import { consumeLoginState, exchangeCode } from '@/lib/x/oauth';
import { getMe } from '@/lib/x/api';
import { enqueueIngest } from '@/lib/queue/queues';
import { XApiError } from '@/lib/x/types';
import { ensurePlayer } from '@/lib/life/player';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// OAuth callback. On first sign-in this creates the user's world and queues its first build, then sends a new
// player to the avatar creator.
// We use the signer's own token to read the signer's own timeline.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const base = env().NEXT_PUBLIC_APP_URL;
  const fail = (msg: string) => NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(msg)}`);

  if (q.get('error')) return fail(q.get('error_description') ?? q.get('error') ?? 'denied');
  const code = q.get('code');
  const state = q.get('state');
  if (!code || !state) return fail('missing code');

  const login = await consumeLoginState(state);
  if (!login) return fail('login expired — try again');

  try {
    const tokens = await exchangeCode(code, login.verifier);
    const me = await getMe({ accessToken: tokens.access_token, userId: null, maxWaitMs: 15_000 });

    const user = await db.user.upsert({
      where: { id: me.id },
      create: {
        id: me.id,
        handle: me.username,
        name: me.name,
        avatarUrl: me.profile_image_url ?? null,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope,
      },
      update: {
        handle: me.username,
        name: me.name,
        avatarUrl: me.profile_image_url ?? null,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope,
        revokedAt: null,
      },
    });

    const existing = await db.world.findUnique({ where: { xUserId: user.id } });
    if (!existing) {
      if (!me.created_at) return fail('X did not return the account creation date; cannot build a world');
      const world = await db.world.create({
        data: {
          handle: me.username,
          xUserId: user.id,
          accountCreatedAt: new Date(me.created_at),
          followersCount: me.public_metrics?.followers_count ?? 0,
          followingCount: me.public_metrics?.following_count ?? 0,
          postCount: me.public_metrics?.tweet_count ?? 0,
          ingestState: 'queued',
          access: login.access ?? 'followers',
        },
      });
      await enqueueIngest(world.id, 'first_build');
    } else if (existing.ingestState === 'failed') {
      // A re-sign-in after a failed build (e.g. expired token) retries the build.
      await db.world.update({ where: { id: existing.id }, data: { ingestState: 'queued', ingestError: null } });
      await enqueueIngest(existing.id, existing.newestPostId ? 'incremental' : 'first_build');
    }

    await createSession({ id: user.id, handle: user.handle, name: user.name, avatarUrl: user.avatarUrl });
    // Sign-up step: a new player picks their look before going on to where they were headed.
    const player = await ensurePlayer(user.id);
    if (player.lookPending) return NextResponse.redirect(`${base}/create?next=${encodeURIComponent(login.returnTo)}`);
    return NextResponse.redirect(`${base}${login.returnTo}`);
  } catch (e) {
    const msg = e instanceof XApiError ? `X error: ${e.message}` : (e as Error).message;
    console.error('[auth callback]', msg);
    return fail(msg);
  }
}
