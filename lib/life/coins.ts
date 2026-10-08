import { db } from '../db';
import { redis } from '../redis';
import { quotes, quoteOne } from './trenches';
import { balloonKey } from './balloons';
import { BAGS_PER_USD } from './coinRules';
import { tradeTaxOn } from './government';
import { COUNTRIES, DEFAULT_COUNTRY, type CountryId } from '../world/countries';

export { BAGS_PER_USD, MIN_BUY, MAX_BUY, BUY_PRESETS } from './coinRules';

// The Coin Shop: buy the live memecoins on the Trenches board with bags. Positions are paper (no wallet, no
// chain): units = bags / price at the moment you buy, and selling pays back units x the price at that moment.
// Prices always come from the server's own quote, never from the client.


export type Holding = {
  chain: string;
  mint: string;
  symbol: string;
  icon: string | null;
  units: number;
  costBags: number;
  /** what it is worth right now in bags, null when the feed has no price */
  valueBags: number | null;
  pnlPct: number | null;
  change24h: number | null;
  change1h: number | null;
};

export async function holdingsFor(playerId: string): Promise<Holding[]> {
  const rows = await db.paperCoin.findMany({ where: { playerId }, orderBy: { updatedAt: 'desc' } });
  if (!rows.length) return [];
  const q = await quotes(rows.map((r) => ({ chain: r.chain, address: r.mint })));
  return rows.map((r) => {
    const t = q.get(`${r.chain}:${r.mint.toLowerCase()}`);
    const valueBags = t ? Math.floor(r.units * t.priceUsd * BAGS_PER_USD) : null;
    return {
      chain: r.chain, mint: r.mint, symbol: r.symbol, icon: r.icon, units: r.units, costBags: r.costBags,
      valueBags,
      pnlPct: valueBags != null && r.costBags > 0 ? Math.round(((valueBags - r.costBags) / r.costBags) * 100) : null,
      change24h: t?.change24h ?? null,
      change1h: t?.change1h ?? null,
    };
  });
}

export async function buyCoin(playerId: string, chain: string, mint: string, bags: number) {
  const t = await quoteOne(chain, mint);
  if (!t || !(t.priceUsd > 0)) throw new Error('No live price for that coin right now.');
  const units = bags / BAGS_PER_USD / t.priceUsd;
  const p = await db.player.findUnique({ where: { id: playerId } });
  if (!p || p.bags < bags) throw new Error(`You need ${bags - (p?.bags ?? 0)} more bags.`);
  await db.$transaction([
    db.player.update({ where: { id: playerId }, data: { bags: { decrement: bags } } }),
    db.bagTx.create({ data: { playerId, kind: 'buy', amount: -bags, note: `🪙 Bought $${t.symbol} at the Coin Shop` } }),
    db.paperCoin.upsert({
      where: { playerId_mint: { playerId, mint } },
      create: { playerId, chain, mint, symbol: t.symbol, icon: t.icon, units, costBags: bags },
      update: { units: { increment: units }, costBags: { increment: bags }, icon: t.icon ?? undefined },
    }),
  ]);
  await redis().del(balloonKey(playerId)).catch(() => {});
  return { symbol: t.symbol, units, bags };
}

/** Sell a fraction (0..1] of a position at the live price. The country you sell in keeps its trade tax. */
export async function sellCoin(playerId: string, mint: string, fraction: number, country: CountryId = DEFAULT_COUNTRY) {
  const row = await db.paperCoin.findUnique({ where: { playerId_mint: { playerId, mint } } });
  if (!row) throw new Error('You do not hold that coin.');
  const t = await quoteOne(row.chain, row.mint);
  if (!t || !(t.priceUsd > 0)) throw new Error('No live price for that coin right now. Try again in a minute.');
  const f = Math.max(0.01, Math.min(1, fraction));
  const units = f >= 0.999 ? row.units : row.units * f;
  const gross = Math.floor(units * t.priceUsd * BAGS_PER_USD);
  const tax = tradeTaxOn(country, gross);
  const bags = gross - tax;
  const cost = f >= 0.999 ? row.costBags : Math.round(row.costBags * f);
  await db.$transaction([
    db.player.update({ where: { id: playerId }, data: { bags: { increment: bags } } }),
    db.bagTx.create({ data: { playerId, kind: 'sell', amount: bags, note: `🪙 Sold $${row.symbol} at the Coin Shop${tax ? ` (${tax} bags ${COUNTRIES[country].name} tax)` : ''}` } }),
    f >= 0.999
      ? db.paperCoin.delete({ where: { id: row.id } })
      : db.paperCoin.update({ where: { id: row.id }, data: { units: { decrement: units }, costBags: { decrement: cost } } }),
  ]);
  await redis().del(balloonKey(playerId)).catch(() => {});
  return { symbol: row.symbol, bags, tax, pnl: bags - cost };
}
