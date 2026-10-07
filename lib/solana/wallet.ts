import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { db } from '../db';
import { env } from '../env';
import { decrypt, encrypt } from '../crypto';
import { quotes } from '../life/trenches';

// Real Solana wallets, one per account. The secret key is AES-256-GCM encrypted at rest and only decrypted
// inside signSol()/swap paths for a transaction the owner asked for, or inside exportSecret() for the owner.

export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export function cluster() {
  return env().SOLANA_CLUSTER;
}

const g = globalThis as unknown as { solConn?: Connection };
export function connection(): Connection {
  if (g.solConn) return g.solConn;
  const url = env().SOLANA_RPC_URL || clusterApiUrl(cluster());
  g.solConn = new Connection(url, { commitment: 'confirmed' });
  return g.solConn;
}

export function explorerUrl(sigOrAddr: string, kind: 'tx' | 'address' = 'tx') {
  const c = cluster();
  return `https://solscan.io/${kind}/${sigOrAddr}${c === 'devnet' ? '?cluster=devnet' : ''}`;
}

/** The player's wallet, created on first use. */
export async function ensureWallet(playerId: string) {
  const existing = await db.wallet.findUnique({ where: { id: playerId } });
  if (existing) return existing;
  const kp = Keypair.generate();
  return db.wallet.create({
    data: { id: playerId, publicKey: kp.publicKey.toBase58(), secretKeyEnc: encrypt(bs58.encode(kp.secretKey)), cluster: cluster() },
  });
}

async function keypairFor(playerId: string): Promise<Keypair> {
  const w = await ensureWallet(playerId);
  return Keypair.fromSecretKey(bs58.decode(decrypt(w.secretKeyEnc)));
}

/** Reveal the secret key to its owner (base58, the format Phantom/Solflare import). Recorded. */
export async function exportSecret(playerId: string) {
  const w = await ensureWallet(playerId);
  await db.wallet.update({ where: { id: playerId }, data: { exportedAt: new Date() } });
  return { publicKey: w.publicKey, secretKey: decrypt(w.secretKeyEnc) };
}

export type TokenBalance = {
  mint: string;
  amount: number; // ui amount
  decimals: number;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
  change24h: number | null;
  change1h: number | null;
  icon: string | null;
  url: string | null;
};

export async function balances(publicKey: string): Promise<{ sol: number; lamports: number; tokens: TokenBalance[]; solUsd: number | null; totalUsd: number | null }> {
  const conn = connection();
  const owner = new PublicKey(publicKey);
  const [lamports, a, b] = await Promise.all([
    conn.getBalance(owner),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM }),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM }).catch(() => ({ value: [] })),
  ]);
  const raw = [...a.value, ...b.value]
    .map((acc) => acc.account.data.parsed?.info)
    .filter((i) => i && i.tokenAmount?.uiAmount > 0)
    .map((i) => ({ mint: i.mint as string, amount: Number(i.tokenAmount.uiAmount), decimals: Number(i.tokenAmount.decimals) }));
  const q = await quotes([{ chain: 'solana', address: SOL_MINT }, ...raw.map((r) => ({ chain: 'solana', address: r.mint }))]);
  const solQ = q.get(`solana:${SOL_MINT.toLowerCase()}`);
  const solUsd = solQ?.priceUsd ?? null;
  const tokens: TokenBalance[] = raw.map((r) => {
    const t = q.get(`solana:${r.mint.toLowerCase()}`);
    const priceUsd = t?.priceUsd ?? null;
    return { ...r, symbol: t?.symbol ?? null, name: t?.name ?? null, priceUsd, valueUsd: priceUsd == null ? null : priceUsd * r.amount, change24h: t?.change24h ?? null, change1h: t?.change1h ?? null, icon: t?.icon ?? null, url: t?.url ?? null };
  });
  const sol = lamports / LAMPORTS_PER_SOL;
  const tokensUsd = tokens.reduce((acc, t) => acc + (t.valueUsd ?? 0), 0);
  return { sol, lamports, tokens, solUsd, totalUsd: solUsd == null ? null : sol * solUsd + tokensUsd };
}

/** Send SOL from the player's wallet. Returns the signature. */
export async function sendSol(playerId: string, to: string, sol: number): Promise<string> {
  const kp = await keypairFor(playerId);
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(to), lamports }));
  return sendAndConfirmTransaction(connection(), tx, [kp], { commitment: 'confirmed' });
}

/** devnet only: ask the faucet for 1 SOL. */
export async function airdrop(playerId: string): Promise<string> {
  if (cluster() !== 'devnet') throw new Error('The faucet only exists on devnet.');
  const w = await ensureWallet(playerId);
  const sig = await connection().requestAirdrop(new PublicKey(w.publicKey), LAMPORTS_PER_SOL);
  await connection().confirmTransaction(sig, 'confirmed');
  return sig;
}

export { keypairFor as _keypairFor };
