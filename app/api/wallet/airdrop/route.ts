import { NextResponse } from 'next/server';
import { friendlySolanaError } from '@/lib/solana/errors';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { airdrop, explorerUrl } from '@/lib/solana/wallet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// devnet faucet: 1 SOL of test money.
export async function POST() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  try {
    const sig = await airdrop(r.player.id);
    await db.walletTx.create({ data: { playerId: r.player.id, kind: 'airdrop', lamports: BigInt(1e9), signature: sig, note: 'devnet faucet' } });
    return NextResponse.json({ ok: true, signature: sig, url: explorerUrl(sig) });
  } catch (e) {
    return bad(friendlySolanaError(e), 503);
  }
}
