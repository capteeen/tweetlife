import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { lockedReason } from '@/lib/life/record';
import { setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { ITEMS } from '@/lib/life/market';
import { transportById } from '@/lib/life/transport';

export const dynamic = 'force-dynamic';

// Pay for a ride. The fare is fixed per mode, so the server never needs to trust a distance.
// The client animates the trip; this only settles bags and stats.
const Body = z.object({ mode: z.enum(['walk', 'bus', 'bike', 'scooter', 'rideshare', 'taxi', 'own']), to: z.string().min(1).max(60) });

const CARS = ITEMS.filter((i) => i.kind === 'car').map((i) => i.id);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('mode and to required');
  const t = transportById(parsed.data.mode)!;
  const locked = lockedReason(r.player);
  if (locked) return bad(locked, 403);
  if (t.id === 'own') {
    const car = await db.asset.findFirst({ where: { playerId: r.user.id, itemId: { in: CARS } } });
    if (!car) return bad('You do not own a car yet. The Dealership sells them.');
  }
  if (t.id === 'walk' && r.player.gas < 6) return bad('Too tired to walk. Take a ride.');
  if (t.bags > r.player.bags) return bad(`You need ${t.bags - r.player.bags} more bags for a ${t.name}.`);

  const mine = applyDelta(r.player, t.me);
  if (t.bags > 0) {
    await db.$transaction([
      db.player.update({ where: { id: r.user.id }, data: { bags: { decrement: t.bags } } }),
      db.bagTx.create({ data: { playerId: r.user.id, kind: 'buy', amount: -t.bags, note: `${t.emoji} ${t.name} to ${parsed.data.to}` } }),
    ]);
  }
  await setStats(r.user.id, mine);
  return NextResponse.json({ ok: true, me: { ...mine, mood: moodOf(mine).mood, bags: r.player.bags - t.bags } });
}
