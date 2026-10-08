import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { WALK_REPORT_CAP, activityById, walkCost } from '@/lib/life/activities';

export const dynamic = 'force-dynamic';

// Everyday activities (dance, stretch, rest, push-ups, selfie) and the gas that walking burns.
// Walking only ever costs gas, so the client reports distance and the server caps what one report can take.

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('do'), activityId: z.string() }),
  z.object({ op: z.literal('walk'), walked: z.number().min(0).max(5000), sprinted: z.number().min(0).max(5000) }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('op required');
  const b = parsed.data;
  const pid = r.player.id;

  if (b.op === 'walk') {
    const cost = Math.min(WALK_REPORT_CAP, Math.round(walkCost(b.walked, b.sprinted)));
    if (cost <= 0) return NextResponse.json({ ok: true, me: { gas: r.player.gas }, cost: 0 });
    // atomic, floored at zero: a walk report can land in the middle of any other action
    await db.$executeRaw`UPDATE "Player" SET gas = GREATEST(0, gas - ${cost}) WHERE id = ${pid}`;
    const p = await db.player.findUniqueOrThrow({ where: { id: pid } });
    return NextResponse.json({ ok: true, me: { vibes: p.vibes, clout: p.clout, gas: p.gas, mood: moodOf(p).mood }, cost });
  }

  const a = activityById(b.activityId);
  if (!a) return bad('No such activity');
  // too tired for anything that burns gas
  if ((a.me.gas ?? 0) < 0 && r.player.gas + (a.me.gas ?? 0) < 0) return bad('Too tired for that. Sleep at home, or sit and catch your breath.', 409);
  const key = `act:${pid}:${a.id}`;
  const ttl = await redis().ttl(key).catch(() => -2);
  if (ttl > 0) return bad(`Not yet — ${ttl}s to go.`, 429);

  const next = applyDelta(r.player, a.me);
  await db.player.update({ where: { id: pid }, data: { status: a.line, statusUntil: new Date(Date.now() + a.seconds * 1000) } });
  await setStats(pid, next);
  await redis().set(key, '1', 'EX', a.cooldown).catch(() => {});
  return NextResponse.json({ ok: true, me: { ...next, mood: moodOf(next).mood }, activity: a });
}
