import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSession, getUser } from '@/lib/session';
import { revokeTokens } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';

// Delete the world and revoke the X tokens. Structures, marks, lanterns and runs cascade.
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  await db.world.deleteMany({ where: { xUserId: user.id } });
  try {
    await revokeTokens(user);
  } catch (e) {
    console.error('[delete] revoke failed', (e as Error).message);
    await db.user.update({ where: { id: user.id }, data: { revokedAt: new Date(), accessTokenEnc: '', refreshTokenEnc: null } });
  }
  clearSession();
  return NextResponse.json({ ok: true });
}
