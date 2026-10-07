import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';
import { resolveEntry } from '@/lib/world/entry';

export const dynamic = 'force-dynamic';

// A 5-minute signed ticket that lets an admitted visitor join the world's presence room.
// Presence is optional: without PartyKit configured the world still works, just without live visitors.
export async function GET(_: Request, { params }: { params: { handle: string } }) {
  const e = env();
  if (!e.NEXT_PUBLIC_PARTYKIT_HOST || !e.PRESENCE_SECRET) return NextResponse.json({ ticket: null, host: null });
  const { world, visitor, decision } = await resolveEntry(params.handle);
  if (!world || !decision?.admit) return NextResponse.json({ error: 'not admitted' }, { status: 403 });
  const room = `world:${world.handle.toLowerCase()}`;
  const payload = Buffer.from(
    JSON.stringify({ id: visitor?.id ?? `anon-${Date.now()}`, handle: visitor?.handle ?? 'visitor', room, exp: Math.floor(Date.now() / 1000) + 300 }),
  ).toString('base64url');
  const sig = createHmac('sha256', e.PRESENCE_SECRET).update(payload).digest('base64url');
  return NextResponse.json({ ticket: `${payload}.${sig}`, host: e.NEXT_PUBLIC_PARTYKIT_HOST, room });
}
