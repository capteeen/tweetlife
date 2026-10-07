import { db } from '../db';
import { redis } from '../redis';
import { balances } from '../solana/wallet';
import { applyDelta, type Stats } from './stats';
import { setStats } from './player';
import { quotes, type Token } from './trenches';
import { BAGS_PER_USD as PAPER_BAGS_PER_USD } from './coinRules';

// Bags on a string: the coins a player holds, drawn as balloons tied to their hand. Built from the real wallet
// (on-chain balances, DexScreener prices) and the player's own swap history for profit and loss. Only the coin,
// its logo and green/red leave the server: never amounts, values or the wallet address.

export type Balloon = {
  mint: string;
  symbol: string;
  icon: string | null;
  /** total return on this coin from the player's swaps (realised + held), %; null when there is no buy on record */
  pnlPct: number | null;
  /** green or red: PnL when known, otherwise the coin's 24h move */
  up: boolean;
  /** rug: down more than half in the last hour, the balloon pops. gold: the player is up 2x or more on it. */
  state: 'normal' | 'rug' | 'gold';
};

const MAX_BALLOONS = 5;
/** below this a holding is dust (or a spam airdrop) and gets no balloon */
const MIN_VALUE_USD = 1;
const TTL = 60;
/** a coin that loses this much in an hour has rugged */
const RUG_1H = -50;
const GOLD_PNL = 100;
/** what a rug and a 2x do to the holder, once per coin */
const EFFECTS: Record<'rug' | 'gold', { delta: Partial<Stats>; ttl: number }> = {
  rug: { delta: { vibes: -15 }, ttl: 86400 },
  gold: { delta: { clout: +10 }, ttl: 7 * 86400 },
};

export const balloonKey = (playerId: string) => `balloons:${playerId}`;

export async function balloonsFor(playerId: string): Promise<Balloon[]> {
  const cached = await redis().get(balloonKey(playerId)).catch(() => null);
  if (cached) return JSON.parse(cached);
  const paper = await paperBalloons(playerId);
  const w = await db.wallet.findUnique({ where: { id: playerId } });
  if (!w) return finish(playerId, paper);
  let bal: Awaited<ReturnType<typeof balances>>;
  try {
    bal = await balances(w.publicKey);
  } catch {
    return paper; // chain unreachable: no wallet balloons rather than wrong ones; not cached so the next poll retries
  }
  const held = bal.tokens
    .filter((t) => t.symbol && (t.valueUsd ?? 0) >= MIN_VALUE_USD)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, MAX_BALLOONS);
  const txs = held.length
    ? await db.walletTx.findMany({ where: { playerId, kind: { in: ['swap_buy', 'swap_sell'] }, mint: { in: held.map((t) => t.mint) } }, select: { kind: true, mint: true, lamports: true } })
    : [];
  const out: Balloon[] = held.map((t) => {
    let spent = 0, received = 0;
    for (const x of txs) {
      if (x.mint !== t.mint) continue;
      const sol = Number(x.lamports) / 1e9;
      if (x.kind === 'swap_buy') spent += -sol;
      else received += sol;
    }
    const valueSol = bal.solUsd && t.valueUsd != null ? t.valueUsd / bal.solUsd : null;
    const pnlPct = spent > 0 && valueSol != null ? ((valueSol + received - spent) / spent) * 100 : null;
    const state: Balloon['state'] = (t.change1h ?? 0) <= RUG_1H ? 'rug' : pnlPct != null && pnlPct >= GOLD_PNL ? 'gold' : 'normal';
    return { mint: t.mint, symbol: t.symbol!, icon: t.icon, pnlPct: pnlPct == null ? null : Math.round(pnlPct), up: pnlPct != null ? pnlPct >= 0 : (t.change24h ?? 0) >= 0, state };
  });
  // on-chain coins first; paper coins from the Coin Shop fill the rest of the hand
  const seen = new Set(out.map((b) => b.mint));
  return finish(playerId, [...out, ...paper.filter((b) => !seen.has(b.mint))].slice(0, MAX_BALLOONS));
}

async function finish(playerId: string, out: Balloon[]) {
  await applyEffects(playerId, out);
  await redis().set(balloonKey(playerId), JSON.stringify(out), 'EX', TTL).catch(() => {});
  return out;
}

/** Coins bought with bags at the Coin Shop, as balloons: PnL against the bags paid in. */
async function paperBalloons(playerId: string): Promise<Balloon[]> {
  const rows = await db.paperCoin.findMany({ where: { playerId }, orderBy: { costBags: 'desc' }, take: MAX_BALLOONS });
  if (!rows.length) return [];
  const q = await quotes(rows.map((r) => ({ chain: r.chain, address: r.mint }))).catch(() => new Map<string, Token>());
  return rows.map((r) => {
    const t = q.get(`${r.chain}:${r.mint.toLowerCase()}`);
    const value = t ? r.units * t.priceUsd * PAPER_BAGS_PER_USD : null;
    const pnlPct = value != null && r.costBags > 0 ? Math.round(((value - r.costBags) / r.costBags) * 100) : null;
    const state: Balloon['state'] = (t?.change1h ?? 0) <= RUG_1H ? 'rug' : pnlPct != null && pnlPct >= GOLD_PNL ? 'gold' : 'normal';
    return { mint: r.mint, symbol: r.symbol, icon: r.icon, pnlPct, up: pnlPct != null ? pnlPct >= 0 : (t?.change24h ?? 0) >= 0, state };
  });
}

/** A rug costs the holder vibes and a 2x earns clout, once per coin (the Redis key is the receipt). */
async function applyEffects(playerId: string, list: Balloon[]) {
  let delta: Partial<Stats> = {};
  for (const b of list) {
    if (b.state === 'normal') continue;
    const fx = EFFECTS[b.state];
    const first = await redis().set(`balloon:${b.state}:${playerId}:${b.mint}`, '1', 'EX', fx.ttl, 'NX').catch(() => null);
    if (!first) continue;
    delta = { vibes: (delta.vibes ?? 0) + (fx.delta.vibes ?? 0), clout: (delta.clout ?? 0) + (fx.delta.clout ?? 0) };
  }
  if (!delta.vibes && !delta.clout) return;
  const p = await db.player.findUnique({ where: { id: playerId } });
  if (p) await setStats(playerId, applyDelta(p, delta));
}
