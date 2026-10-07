import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { quoteOne } from '@/lib/life/trenches';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Paper trades at live prices: 1 bag = $1 for sizing. Buying spends bags; selling returns bags.
const Body = z.object({
  side: z.enum(['buy', 'sell']),
  chain: z.string().min(1),
  address: z.string().min(1),
  /** buy: bags to spend. sell: fraction of the position (0..1]. */
  amount: z.number().positive(),
});

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const { player } = r;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('side, chain, address, amount required');
  const { side, chain, address, amount } = parsed.data;
  const t = await quoteOne(chain, address);
  if (!t || !(t.priceUsd > 0)) return bad('No live price for that token right now.', 503);

  if (side === 'buy') {
    const bags = Math.floor(amount);
    if (bags < 10) return bad('Minimum ape is 10 bags.');
    if (bags > player.bags) return bad(`You only have ${player.bags} bags.`);
    const qty = bags / t.priceUsd;
    await db.$transaction([
      db.player.update({ where: { id: player.id }, data: { bags: { decrement: bags } } }),
      db.holding.upsert({
        where: { playerId_chain_address: { playerId: player.id, chain, address } },
        create: { playerId: player.id, chain, address, symbol: t.symbol, name: t.name, qty, costBasis: bags },
        update: { qty: { increment: qty }, costBasis: { increment: bags }, symbol: t.symbol, name: t.name },
      }),
      db.bagTx.create({ data: { playerId: player.id, kind: 'buy', amount: -bags, note: `Aped $${t.symbol} @ $${t.priceUsd}` } }),
    ]);
    return NextResponse.json({ ok: true, qty, price: t.priceUsd, symbol: t.symbol });
  }

  const h = await db.holding.findUnique({ where: { playerId_chain_address: { playerId: player.id, chain, address } } });
  if (!h || h.qty <= 0) return bad('You do not hold that.');
  const frac = Math.min(1, amount);
  const qty = h.qty * frac;
  const bags = Math.floor(qty * t.priceUsd);
  const basisOut = h.costBasis * frac;
  await db.$transaction([
    db.player.update({ where: { id: player.id }, data: { bags: { increment: bags } } }),
    db.holding.update({ where: { id: h.id }, data: { qty: frac >= 1 ? 0 : { decrement: qty }, costBasis: frac >= 1 ? 0 : { decrement: basisOut } } }),
    db.bagTx.create({ data: { playerId: player.id, kind: 'sell', amount: bags, note: `Sold ${Math.round(frac * 100)}% of $${t.symbol} @ $${t.priceUsd} (${bags - basisOut >= 0 ? '+' : ''}${Math.round(bags - basisOut)})` } }),
  ]);
  return NextResponse.json({ ok: true, bags, pnl: Math.round(bags - basisOut), symbol: t.symbol });
}
