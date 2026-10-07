import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { ensurePlayer, setStats } from '@/lib/life/player';
import { INTERACTIONS, applyDelta, moodOf, type InteractionKind } from '@/lib/life/stats';

export const dynamic = 'force-dynamic';

// A social action on another visitor. Both players' stats move; bags move for tips.
const Body = z.object({ kind: z.string(), toHandle: z.string().min(1), worldId: z.string().optional() });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const { user, player } = r;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('kind and toHandle required');
  const kind = parsed.data.kind as InteractionKind;
  const def = INTERACTIONS[kind];
  if (!def) return bad('Unknown interaction');
  const target = await db.user.findFirst({ where: { handle: { equals: parsed.data.toHandle.replace(/^@/, ''), mode: 'insensitive' } } });
  if (!target) return bad('That person has not signed in to TweetLife.', 404);
  if (target.id === user.id) return bad('That is you.');

  const lock = await redis().set(`interact:${user.id}:${target.id}:${kind}`, '1', 'EX', 60, 'NX').catch(() => 'OK');
  if (!lock) return bad('Give it a minute before doing that again.', 429);
  if (def.bags > player.bags) return bad(`You only have ${player.bags} bags.`);

  const them = await ensurePlayer(target.id);
  const mine = applyDelta(player, def.me);
  const theirs = applyDelta(them, def.them);
  await db.$transaction(async (tx) => {
    await tx.interaction.create({ data: { worldId: parsed.data.worldId, fromUserId: user.id, toUserId: target.id, kind } });
    if (def.bags > 0) {
      await tx.player.update({ where: { id: user.id }, data: { bags: { decrement: def.bags } } });
      await tx.player.update({ where: { id: target.id }, data: { bags: { increment: def.bags } } });
      await tx.bagTx.create({ data: { playerId: user.id, kind: 'tip_out', amount: -def.bags, note: `Sent to @${target.handle}` } });
      await tx.bagTx.create({ data: { playerId: target.id, kind: 'tip_in', amount: def.bags, note: `From @${user.handle}` } });
    }
  });
  await Promise.all([setStats(user.id, mine), setStats(target.id, theirs)]);
  return NextResponse.json({
    ok: true,
    me: { ...mine, mood: moodOf(mine).mood, bags: player.bags - def.bags },
    toast: { to: target.handle, from: user.handle, kind, text: `@${user.handle} ${def.line}`, delta: def.them },
  });
}
