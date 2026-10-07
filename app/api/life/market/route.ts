import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { ITEMS, itemById } from '@/lib/life/market';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ items: ITEMS });
}

/** Buy an item. */
export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = z.object({ itemId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('itemId required');
  const item = itemById(parsed.data.itemId);
  if (!item) return bad('No such item');
  const owned = await db.asset.findUnique({ where: { playerId_itemId: { playerId: r.player.id, itemId: item.id } } });
  if (owned) return bad('You already own that.');
  if (item.price > r.player.bags) return bad(`You need ${item.price - r.player.bags} more bags.`);
  await db.$transaction([
    db.player.update({ where: { id: r.player.id }, data: { bags: { decrement: item.price }, clout: { increment: 5 } } }),
    db.asset.updateMany({ where: { playerId: r.player.id }, data: { equipped: false } }),
    db.asset.create({ data: { playerId: r.player.id, itemId: item.id, paid: item.price, equipped: true } }),
    db.bagTx.create({ data: { playerId: r.player.id, kind: 'buy', amount: -item.price, note: `Bought ${item.name}` } }),
  ]);
  return NextResponse.json({ ok: true, item });
}

/** Equip (ride) an owned item, or walk (itemId: null). */
export async function PATCH(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = z.object({ itemId: z.string().nullable() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('itemId required');
  await db.asset.updateMany({ where: { playerId: r.player.id }, data: { equipped: false } });
  if (parsed.data.itemId) {
    const res = await db.asset.updateMany({ where: { playerId: r.player.id, itemId: parsed.data.itemId }, data: { equipped: true } });
    if (res.count === 0) return bad('You do not own that.');
  }
  return NextResponse.json({ ok: true, riding: parsed.data.itemId });
}
