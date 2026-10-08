import { NextResponse } from 'next/server';
import { friendlySolanaError } from '@/lib/solana/errors';
import { db } from '@/lib/db';
import { requirePlayer } from '@/lib/life/auth';
import { balances, cluster, ensureWallet, explorerUrl } from '@/lib/solana/wallet';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// The player's real Solana wallet: address, live balances (SOL + tokens, priced), recent activity.
export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const w = await ensureWallet(r.player.id);
  let bal: Awaited<ReturnType<typeof balances>> | null = null;
  let error: string | null = null;
  try {
    bal = await balances(w.publicKey);
  } catch (e) {
    error = friendlySolanaError(e, 'Could not read your balance right now. Try again in a bit.');
  }
  const txs = await db.walletTx.findMany({ where: { playerId: r.player.id }, orderBy: { at: 'desc' }, take: 30 });
  return NextResponse.json(
    {
      address: w.publicKey,
      cluster: cluster(),
      explorer: explorerUrl(w.publicKey, 'address'),
      exportedAt: w.exportedAt?.toISOString() ?? null,
      balances: bal,
      error,
      txs: txs.map((t) => ({ id: t.id, kind: t.kind, sol: Number(t.lamports) / 1e9, mint: t.mint, signature: t.signature, url: t.signature ? explorerUrl(t.signature) : null, note: t.note, at: t.at.toISOString() })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
