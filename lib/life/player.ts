import type { Player } from '@prisma/client';
import { db } from '../db';
import { applyDrift, moodOf, type Stats } from './stats';
import { quotes, type Token } from './trenches';

// Player profiles for the life layer. Everyone who signs in gets one with a welcome of 10,000 bags —
// in-world points, never money.

export async function ensurePlayer(userId: string): Promise<Player> {
  const existing = await db.player.findUnique({ where: { id: userId } });
  if (existing) return tick(existing);
  const p = await db.player.create({ data: { id: userId, txs: { create: { kind: 'welcome', amount: 10000, note: 'Welcome to the trenches' } } } });
  return p;
}

/** Apply time drift to stats and persist, at most once a minute. */
export async function tick(p: Player): Promise<Player> {
  if (Date.now() - p.lastTickAt.getTime() < 60_000) return p;
  const s = applyDrift(p, p.lastTickAt);
  return db.player.update({ where: { id: p.id }, data: { ...s, lastTickAt: new Date() } });
}

export async function setStats(id: string, s: Stats) {
  return db.player.update({ where: { id }, data: { ...s, lastTickAt: new Date() } });
}

export type HoldingView = {
  chain: string;
  address: string;
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  price: number | null;
  value: number | null;
  pnl: number | null;
  change24h: number | null;
  icon: string | null;
  url: string | null;
};

export async function portfolio(playerId: string): Promise<{ holdings: HoldingView[]; value: number; priced: boolean }> {
  const rows = await db.holding.findMany({ where: { playerId, qty: { gt: 0 } }, orderBy: { costBasis: 'desc' } });
  if (rows.length === 0) return { holdings: [], value: 0, priced: true };
  const q = await quotes(rows.map((r) => ({ chain: r.chain, address: r.address })));
  let value = 0;
  let priced = true;
  const holdings = rows.map((r) => {
    const t: Token | undefined = q.get(`${r.chain}:${r.address.toLowerCase()}`);
    const price = t?.priceUsd ?? null;
    const v = price != null ? r.qty * price : null;
    if (v == null) priced = false;
    else value += v;
    return {
      chain: r.chain, address: r.address, symbol: r.symbol, name: r.name, qty: r.qty, costBasis: r.costBasis,
      price, value: v, pnl: v == null ? null : v - r.costBasis, change24h: t?.change24h ?? null, icon: t?.icon ?? null, url: t?.url ?? null,
    };
  });
  return { holdings, value, priced };
}

export function profileView(p: Player, handle: string, name: string, avatarUrl: string | null) {
  const stats: Stats = { vibes: p.vibes, clout: p.clout, gas: p.gas };
  const m = moodOf(stats);
  return { id: p.id, handle, name, avatarUrl, bags: p.bags, status: p.status, ...stats, mood: m.mood, moodEmoji: m.emoji };
}

/** Rich list: bags + current value of holdings. Holdings are priced live, so this costs one quote batch. */
export async function richList(limit = 20) {
  const players = await db.player.findMany({ include: { user: { select: { handle: true, name: true, avatarUrl: true } }, holdings: { where: { qty: { gt: 0 } } } }, take: 200 });
  const all = players.flatMap((p) => p.holdings.map((h) => ({ chain: h.chain, address: h.address })));
  const q = all.length ? await quotes(all) : new Map<string, Token>();
  return players
    .map((p) => {
      const held = p.holdings.reduce((acc, h) => acc + (q.get(`${h.chain}:${h.address.toLowerCase()}`)?.priceUsd ?? 0) * h.qty, 0);
      return { handle: p.user.handle, name: p.user.name, avatarUrl: p.user.avatarUrl, bags: p.bags, held: Math.round(held), netWorth: Math.round(p.bags + held), mood: moodOf(p).mood };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .slice(0, limit);
}
