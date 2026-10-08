import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { bad, requirePlayer } from '@/lib/life/auth';
import { setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { JET_ITEM, cabinById, flightNumber, whereIs } from '@/lib/life/flights';
import { COUNTRIES, COUNTRY_IDS, type CountryId } from '@/lib/world/countries';

export const dynamic = 'force-dynamic';

// Flying between countries, in the steps a traveller takes:
//  - book:  at a check-in desk. The fixed fare is charged and a signed boarding pass comes back.
//  - board: at the gate. The pass is checked and you are now on your way to (and in) the destination.
//  - jet:   from your own plane's stand. Ownership is checked; no fare, no pass.
// Nothing the client says about price, ownership or who holds a pass is trusted.
const Body = z.discriminatedUnion('step', [
  z.object({ step: z.literal('book'), to: z.enum(COUNTRY_IDS), cabin: z.enum(['economy', 'first']) }),
  z.object({ step: z.literal('board'), pass: z.string().min(10).max(600) }),
  z.object({ step: z.literal('jet'), to: z.enum(COUNTRY_IDS) }),
]);

type Pass = { p: string; from: CountryId; to: CountryId; cabin: 'economy' | 'first'; exp: number };
const PASS_HOURS = 6;

function sign(body: string) {
  return createHmac('sha256', env().SESSION_SECRET).update(`boarding-pass:${body}`).digest('base64url');
}
function issue(pass: Pass) {
  const body = Buffer.from(JSON.stringify(pass)).toString('base64url');
  return `${body}.${sign(body)}`;
}
function read(token: string): Pass | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as Pass;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Bad flight request.');
  const b = parsed.data;
  const from = whereIs(r.player);

  if (b.step === 'book') {
    if (b.to === from) return bad(`You are already in ${COUNTRIES[b.to].name}.`);
    const cabin = cabinById(b.cabin)!;
    if (cabin.bags > r.player.bags) return bad(`You need ${cabin.bags - r.player.bags} more bags for ${cabin.name}.`);
    const number = flightNumber(from, b.to);
    await db.$transaction([
      db.player.update({ where: { id: r.user.id }, data: { bags: { decrement: cabin.bags } } }),
      db.bagTx.create({ data: { playerId: r.user.id, kind: 'buy', amount: -cabin.bags, note: `${cabin.emoji} ${number} ${COUNTRIES[from].capital} to ${COUNTRIES[b.to].capital}` } }),
    ]);
    const pass = issue({ p: r.user.id, from, to: b.to, cabin: b.cabin, exp: Math.floor(Date.now() / 1000) + PASS_HOURS * 3600 });
    return NextResponse.json({ ok: true, pass, from, to: b.to, cabin: b.cabin, number, me: { bags: r.player.bags - cabin.bags } });
  }

  let to: CountryId, cabinId: 'economy' | 'first' | 'jet';
  if (b.step === 'board') {
    const pass = read(b.pass);
    if (!pass || pass.p !== r.user.id) return bad('That boarding pass is not yours. Check in at a desk.');
    if (pass.exp < Date.now() / 1000) return bad('Your boarding pass has expired. Check in again.');
    if (pass.from !== from) return bad(`This pass is for a flight from ${COUNTRIES[pass.from].capital}.`);
    to = pass.to;
    cabinId = pass.cabin;
  } else {
    if (b.to === from) return bad(`You are already in ${COUNTRIES[b.to].name}.`);
    const jet = await db.asset.findFirst({ where: { playerId: r.user.id, itemId: JET_ITEM } });
    if (!jet) return bad('You do not own a plane yet. The Airport sells them.');
    to = b.to;
    cabinId = 'jet';
  }
  const cabin = cabinById(cabinId)!;
  const mine = applyDelta(r.player, cabin.me);
  await db.player.update({ where: { id: r.user.id }, data: { location: to } });
  await setStats(r.user.id, mine);
  return NextResponse.json({ ok: true, from, to, cabin: cabin.id, number: flightNumber(from, to), me: { ...mine, mood: moodOf(mine).mood, bags: r.player.bags, location: to } });
}
