import { NextResponse, type NextRequest } from 'next/server';
import { friendlySolanaError } from '@/lib/solana/errors';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { quote, swap } from '@/lib/solana/jupiter';
import { balloonKey } from '@/lib/life/balloons';
import { SOL_MINT, balances, ensureWallet, explorerUrl } from '@/lib/solana/wallet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ape (buy with SOL) or sell (a fraction of a token position back to SOL) through Jupiter.
const Body = z.object({
  side: z.enum(['buy', 'sell']),
  mint: z.string().min(32),
  /** buy: SOL to spend. sell: fraction of the position (0..1]. */
  amount: z.number().positive(),
  symbol: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('side, mint, amount required');
  const { side, mint, amount, symbol } = parsed.data;
  const w = await ensureWallet(r.player.id);
  const lock = await redis().set(`wallet:lock:${r.user.id}`, '1', 'EX', 60, 'NX').catch(() => 'OK');
  if (!lock) return bad('A transaction is already in flight.', 429);
  try {
    const bal = await balances(w.publicKey);
    let q;
    let lamports: bigint;
    if (side === 'buy') {
      const spend = Math.round(amount * 1e9);
      if (spend + 5_000_000 > bal.lamports) return bad(`Not enough SOL (keep ~0.005 for fees). You have ${bal.sol.toFixed(4)}.`);
      q = await quote(SOL_MINT, mint, spend);
      lamports = BigInt(-spend);
    } else {
      const t = bal.tokens.find((x) => x.mint === mint);
      if (!t) return bad('You do not hold that token.');
      const base = Math.floor(t.amount * Math.min(1, amount) * 10 ** t.decimals);
      if (base <= 0) return bad('Nothing to sell.');
      q = await quote(mint, SOL_MINT, base);
      lamports = BigInt(q.outAmount);
    }
    const sig = await swap(r.player.id, q);
    await db.walletTx.create({
      data: { playerId: r.player.id, kind: side === 'buy' ? 'swap_buy' : 'swap_sell', lamports, mint, signature: sig, note: side === 'buy' ? `Aped $${symbol ?? mint.slice(0, 6)} with ${amount} SOL` : `Sold ${Math.round(Math.min(1, amount) * 100)}% of $${symbol ?? mint.slice(0, 6)}` },
    });
    await redis().del(balloonKey(r.player.id)).catch(() => {});
    return NextResponse.json({ ok: true, signature: sig, url: explorerUrl(sig), outAmount: q.outAmount, priceImpactPct: q.priceImpactPct });
  } catch (e) {
    return bad(friendlySolanaError(e, 'The swap did not go through. Your SOL is still in your wallet.'), 502);
  } finally {
    await redis().del(`wallet:lock:${r.user.id}`).catch(() => {});
  }
}
