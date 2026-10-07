import { db } from '../db';
import { redis } from '../redis';
import { balances } from '../solana/wallet';
import { applyDelta, type Stats } from './stats';
import { setStats } from './player';

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
  const w = await db.wallet.findUnique({ where: { id: playerId } });
  if (!w) return [];
  let bal: Awaited<ReturnType<typeof balances>>;
  try {
    bal = await balances(w.publicKey);
  } catch {
    return []; // chain unreachable: no balloons rather than wrong ones; not cached so the next poll retries
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
  await applyEffects(playerId, out);
  await redis().set(balloonKey(playerId), JSON.stringify(out), 'EX', TTL).catch(() => {});
  return out;
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
