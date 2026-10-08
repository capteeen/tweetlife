import { NextResponse, type NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getUser } from '@/lib/session';
import { houseAccess } from '@/lib/life/loveServer';

export const dynamic = 'force-dynamic';

// A 5-minute ticket into a house's presence room (party/world.ts, room `home:<handle>`), so the host and their
// guests see each other walk, sit and sleep. Only the owner and people with a pass or dating them get one.
export async function GET(req: NextRequest) {
  const e = env();
  if (!e.NEXT_PUBLIC_PARTYKIT_HOST || !e.PRESENCE_SECRET) return NextResponse.json({ ticket: null, host: null });
  const me = await getUser();
  if (!me) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  const handle = (req.nextUrl.searchParams.get('handle') ?? me.handle).replace(/^@/, '');
  const owner = await db.user.findFirst({ where: { handle: { equals: handle, mode: 'insensitive' } }, select: { id: true, handle: true } });
  if (!owner) return NextResponse.json({ error: 'no such house' }, { status: 404 });
  if (!(await houseAccess(me.id, { player: owner.id })).ok) return NextResponse.json({ error: 'not invited' }, { status: 403 });
  const room = `home:${owner.handle.toLowerCase()}`;
  const payload = Buffer.from(JSON.stringify({ id: me.id, handle: me.handle, room, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const sig = createHmac('sha256', e.PRESENCE_SECRET).update(payload).digest('base64url');
  return NextResponse.json({ ticket: `${payload}.${sig}`, host: e.NEXT_PUBLIC_PARTYKIT_HOST, room });
}
