import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { ensurePlayer } from '@/lib/life/player';

export const dynamic = 'force-dynamic';

// Send bags to anyone who has signed in, by handle.
const Body = z.object({ toHandle: z.string().min(1), amount: z.number().int().positive(), note: z.string().max(80).optional() });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('toHandle and a whole-number amount required');
  const { amount, note } = parsed.data;
  const target = await db.user.findFirst({ where: { handle: { equals: parsed.data.toHandle.replace(/^@/, ''), mode: 'insensitive' } } });
  if (!target) return bad('That person has not signed in to TweetLife.', 404);
  if (target.id === r.user.id) return bad('That is you.');
  if (amount > r.player.bags) return bad(`You only have ${r.player.bags} bags.`);
  await ensurePlayer(target.id);
  await db.$transaction([
    db.player.update({ where: { id: r.user.id }, data: { bags: { decrement: amount }, clout: { increment: Math.min(10, Math.ceil(amount / 200)) } } }),
    db.player.update({ where: { id: target.id }, data: { bags: { increment: amount }, vibes: { increment: 3 } } }),
    db.bagTx.create({ data: { playerId: r.user.id, kind: 'tip_out', amount: -amount, note: `Sent to @${target.handle}${note ? ` — ${note}` : ''}` } }),
    db.bagTx.create({ data: { playerId: target.id, kind: 'tip_in', amount, note: `From @${r.user.handle}${note ? ` — ${note}` : ''}` } }),
    db.interaction.create({ data: { fromUserId: r.user.id, toUserId: target.id, kind: 'send' } }),
  ]);
  return NextResponse.json({ ok: true, bags: r.player.bags - amount, toast: { to: target.handle, from: r.user.handle, kind: 'send', text: `@${r.user.handle} sent you ${amount} bags${note ? `: ${note}` : ''}` } });
}
