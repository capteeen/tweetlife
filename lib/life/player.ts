import type { Player } from '@prisma/client';
import { db } from '../db';
import { applyDrift, moodOf, type Stats } from './stats';
import { ensureWallet } from '../solana/wallet';
import { parseLook } from './look';

// Player profiles for the life layer. Everyone who signs in gets one with a welcome of 10,000 bags —
// in-world points, never money. A new player picks their look in the avatar creator before walking in.

export async function ensurePlayer(userId: string): Promise<Player> {
  const existing = await db.player.findUnique({ where: { id: userId } });
  if (existing) return tick(existing);
  const p = await db.player.create({ data: { id: userId, lookPending: true, txs: { create: { kind: 'welcome', amount: 10000, note: 'Welcome to the trenches' } } } });
  // the real Solana wallet is created alongside (keys encrypted at rest)
  await ensureWallet(userId).catch((e) => console.error('[wallet] create failed', (e as Error).message));
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

export function profileView(p: Player, handle: string, name: string, avatarUrl: string | null) {
  const stats: Stats = { vibes: p.vibes, clout: p.clout, gas: p.gas };
  const m = moodOf(stats);
  return { id: p.id, handle, name, avatarUrl, bags: p.bags, status: p.status, ...stats, mood: m.mood, moodEmoji: m.emoji, look: parseLook(p.look), lookPending: p.lookPending };
}

/** Rich list: bank balance + assets, in bags. (Real SOL is private and never ranked.) */
export async function richList(limit = 20) {
  const players = await db.player.findMany({ include: { user: { select: { handle: true, name: true, avatarUrl: true } }, assets: true }, take: 200 });
  return players
    .map((p) => {
      const held = p.assets.reduce((acc, a) => acc + a.paid, 0);
      return { handle: p.user.handle, name: p.user.name, avatarUrl: p.user.avatarUrl, bags: p.bags, held, netWorth: p.bags + held, mood: moodOf(p).mood };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .slice(0, limit);
}
