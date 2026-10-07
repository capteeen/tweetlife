import { NextResponse } from 'next/server';
import { getUser } from '../session';
import { ensurePlayer } from './player';

/** Signed-in user + their player row, or a 401 response. */
export async function requirePlayer() {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in with X to play.' }, { status: 401 }) } as const;
  const player = await ensurePlayer(user.id);
  return { user, player } as const;
}

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
