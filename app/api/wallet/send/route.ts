import { NextResponse, type NextRequest } from 'next/server';
import { friendlySolanaError } from '@/lib/solana/errors';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { bad, requirePlayer } from '@/lib/life/auth';
import { ensureWallet, explorerUrl, sendSol } from '@/lib/solana/wallet';
import { ensurePlayer } from '@/lib/life/player';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Send real SOL to another player (by handle) or to any address.
const Body = z.object({ to: z.string().min(1), sol: z.number().positive().max(1000), note: z.string().max(80).optional() });

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('to and sol required');
  const { to, sol, note } = parsed.data;

  let address: string;
  let label: string;
  const asHandle = to.replace(/^@/, '');
  const user = /^[A-Za-z0-9_]{1,15}$/.test(asHandle) ? await db.user.findFirst({ where: { handle: { equals: asHandle, mode: 'insensitive' } } }) : null;
  if (user) {
    if (user.id === r.user.id) return bad('That is you.');
    await ensurePlayer(user.id);
    address = (await ensureWallet(user.id)).publicKey;
    label = `@${user.handle}`;
  } else {
    try {
      address = new PublicKey(to).toBase58();
    } catch {
      return bad('Not a TweetLife handle or a valid Solana address.');
    }
    label = `${address.slice(0, 4)}…${address.slice(-4)}`;
  }
  // one send at a time per player
  const lock = await redis().set(`wallet:lock:${r.user.id}`, '1', 'EX', 30, 'NX').catch(() => 'OK');
  if (!lock) return bad('A transaction is already in flight.', 429);
  try {
    const sig = await sendSol(r.user.id, address, sol);
    await db.walletTx.create({ data: { playerId: r.user.id, kind: 'send', lamports: BigInt(-Math.round(sol * 1e9)), signature: sig, note: `Sent to ${label}${note ? ` — ${note}` : ''}` } });
    if (user) {
      await db.walletTx.create({ data: { playerId: user.id, kind: 'receive', lamports: BigInt(Math.round(sol * 1e9)), note: `From @${r.user.handle}${note ? ` — ${note}` : ''}` } }).catch(() => {});
      await db.interaction.create({ data: { fromUserId: r.user.id, toUserId: user.id, kind: 'send_sol' } });
    }
    return NextResponse.json({ ok: true, signature: sig, url: explorerUrl(sig), toast: user ? { to: user.handle, kind: 'send_sol', text: `@${r.user.handle} sent you ${sol} SOL${note ? `: ${note}` : ''}` } : null });
  } catch (e) {
    return bad(friendlySolanaError(e, 'The send did not go through. Your SOL is still in your wallet.'), 502);
  } finally {
    await redis().del(`wallet:lock:${r.user.id}`).catch(() => {});
  }
}
