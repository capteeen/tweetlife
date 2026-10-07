import { NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/life/auth';
import { exportSecret } from '@/lib/solana/wallet';

export const dynamic = 'force-dynamic';

// Reveal the wallet's secret key to its owner. Base58, importable into Phantom / Solflare. Recorded.
export async function POST() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const { publicKey, secretKey } = await exportSecret(r.player.id);
  return NextResponse.json({ publicKey, secretKey }, { headers: { 'cache-control': 'private, no-store' } });
}
