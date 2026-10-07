import { VersionedTransaction } from '@solana/web3.js';
import { env } from '../env';
import { _keypairFor, cluster, connection } from './wallet';

// Swaps through Jupiter (mainnet only — devnet has no liquidity). The quote is fetched, the swap
// transaction built by Jupiter, signed with the player's key and sent. The signature is the receipt.

export type Quote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan?: unknown[];
};

export async function quote(inputMint: string, outputMint: string, amount: number, slippageBps = 300): Promise<Quote> {
  if (cluster() !== 'mainnet-beta') throw new Error('Swaps only exist on mainnet. This deployment is on devnet (SOLANA_CLUSTER).');
  const u = new URL(`${env().JUPITER_API_URL}/quote`);
  u.searchParams.set('inputMint', inputMint);
  u.searchParams.set('outputMint', outputMint);
  u.searchParams.set('amount', String(Math.floor(amount)));
  u.searchParams.set('slippageBps', String(slippageBps));
  const res = await fetch(u, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Jupiter quote failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  return (await res.json()) as Quote;
}

export async function swap(playerId: string, q: Quote): Promise<string> {
  const kp = await _keypairFor(playerId);
  const res = await fetch(`${env().JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 'auto' }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Jupiter swap failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const { swapTransaction } = (await res.json()) as { swapTransaction: string };
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([kp]);
  const conn = connection();
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const latest = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}
