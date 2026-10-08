import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';
import { getUser } from '@/lib/session';
import { isCountryId } from '@/lib/world/countries';
import { roomFor } from '@/lib/world/country-map';

export const dynamic = 'force-dynamic';

// A 5-minute signed ticket for a country's presence room (`country:<id>`, and its shards `country:<id>:N`,
// which the ticket also opens). Everyone in a country is in it together, so anyone may have one; signed-out
// visitors join as guests. Presence is optional: without PartyKit configured the country still works.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isCountryId(params.id)) return NextResponse.json({ error: 'No such country.' }, { status: 404 });
  const e = env();
  if (!e.NEXT_PUBLIC_PARTYKIT_HOST || !e.PRESENCE_SECRET) return NextResponse.json({ ticket: null, host: null });
  const visitor = await getUser();
  const room = roomFor(params.id);
  const payload = Buffer.from(
    JSON.stringify({ id: visitor?.id ?? `anon-${crypto.randomUUID()}`, handle: visitor?.handle ?? 'visitor', room, exp: Math.floor(Date.now() / 1000) + 300 }),
  ).toString('base64url');
  const sig = createHmac('sha256', e.PRESENCE_SECRET).update(payload).digest('base64url');
  return NextResponse.json({ ticket: `${payload}.${sig}`, host: e.NEXT_PUBLIC_PARTYKIT_HOST, room });
}
