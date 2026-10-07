import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { setStats } from '@/lib/life/player';
import { applyDelta, moodOf } from '@/lib/life/stats';
import { venueById } from '@/lib/life/venues';

export const dynamic = 'force-dynamic';

// Do something at a venue. `nearby` = handles the client sees within earshot (for rounds and tables).
const Body = z.object({ venueId: z.string(), actionId: z.string(), nearby: z.array(z.string()).max(12).optional() });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('venueId and actionId required');
  const venue = venueById(parsed.data.venueId);
  const action = venue?.actions.find((a) => a.id === parsed.data.actionId);
  if (!venue || !action) return bad('No such action');
  const key = `venue:${r.user.id}:${venue.id}:${action.id}`;
  const ttl = await redis().ttl(key).catch(() => -2);
  if (ttl > 0) return bad(`Not yet — ${Math.ceil(ttl / 60)} min to go.`, 429);
  if (action.bags > r.player.bags) return bad(`You need ${action.bags - r.player.bags} more bags.`);

  const mine = applyDelta(r.player, action.me);
  await db.$transaction([
    db.player.update({ where: { id: r.user.id }, data: { bags: { decrement: action.bags } } }),
    db.bagTx.create({ data: { playerId: r.user.id, kind: action.bags < 0 ? 'quest' : 'buy', amount: -action.bags, note: `${venue.emoji} ${venue.name}: ${action.label}` } }),
  ]);
  await setStats(r.user.id, mine);
  await redis().set(key, '1', 'EX', action.cooldown).catch(() => {});

  // rounds and tables: lift everyone the client reported nearby (cap 12, must be real players)
  let lifted = 0;
  if (action.nearby && parsed.data.nearby?.length) {
    const users = await db.user.findMany({ where: { handle: { in: parsed.data.nearby.map((h) => h.replace(/^@/, '')), mode: 'insensitive' }, NOT: { id: r.user.id } }, select: { id: true } });
    const players = await db.player.findMany({ where: { id: { in: users.map((u) => u.id) } } });
    for (const p of players) await setStats(p.id, applyDelta(p, action.nearby));
    lifted = players.length;
  }
  return NextResponse.json({
    ok: true,
    me: { ...mine, mood: moodOf(mine).mood, bags: r.player.bags - action.bags },
    lifted,
    toast: action.nearby ? { from: r.user.handle, kind: 'venue', text: `@${r.user.handle} ${action.line} at ${venue.name}`, delta: action.nearby } : null,
  });
}
