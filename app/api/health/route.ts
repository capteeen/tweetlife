import { NextResponse } from 'next/server';
import { env, envProblems } from '@/lib/env';
import { redirectUri } from '@/lib/x/oauth';
import { databaseUrl, redisUrl, storageVariableNames } from '@/lib/db-url';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Deployment health for the operator: what is configured and reachable. Names and booleans only, never values.
export async function GET() {
  const problems = envProblems();
  const out: Record<string, unknown> = {
    ok: false,
    env: { problems, ingestMode: process.env.INGEST_MODE || (process.env.VERCEL ? 'inline (default on Vercel)' : 'worker (default)') },
    database: { urlFound: !!databaseUrl(), scheme: databaseUrl()?.split('://')[0] ?? null, reachable: false, migrated: false, error: null as string | null },
    redis: { urlFound: !!redisUrl(), scheme: redisUrl()?.split('://')[0] ?? null, reachable: false, error: null as string | null },
    storageVariableNames: storageVariableNames(),
    signIn: signInConfig(),
  };
  const dbOut = out.database as { reachable: boolean; migrated: boolean; error: string | null };
  try {
    await db.$queryRaw`SELECT 1`;
    dbOut.reachable = true;
    await db.$queryRaw`SELECT 1 FROM "World" LIMIT 1`;
    dbOut.migrated = true;
  } catch (e) {
    dbOut.error = (e as Error).message.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) ?? 'error';
  }
  const rOut = out.redis as { reachable: boolean; error: string | null };
  if (redisUrl()) {
    try {
      const pong = await Promise.race([redis().ping(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout after 5s')), 5000))]);
      rOut.reachable = pong === 'PONG';
    } catch (e) {
      rOut.error = (e as Error).message.slice(0, 200);
    }
  }
  out.ok = problems.length === 0 && dbOut.migrated && rOut.reachable;
  return NextResponse.json(out, { status: out.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}

// What X sign-in will use. The client id and callback are public (they appear in the authorize URL); the secret
// is reported only as present or not.
function signInConfig() {
  try {
    const e = env();
    return {
      appUrl: e.NEXT_PUBLIC_APP_URL,
      callback: redirectUri(),
      clientIdStart: e.X_CLIENT_ID.slice(0, 8),
      clientSecretSet: e.X_CLIENT_SECRET.length > 0,
    };
  } catch {
    return null; // envProblems already names what is missing
  }
}
