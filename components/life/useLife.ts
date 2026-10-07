'use client';
import { useEffect } from 'react';
import { useWorld, type LifeData, type LifeMe, type WalletData } from '@/components/world/store';
import type { Activity, ActivityId } from '@/lib/life/activities';
import { ITEMS, type Item } from '@/lib/life/market';
import type { Furniture, FurnitureAction, PowerState } from '@/lib/life/home';
import type { Holding } from '@/lib/life/coins';
import { refreshBalloons } from '@/components/world/Balloons';

// Client side of the life layer: load the player's data, perform actions, keep the store in sync.

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function refreshLife() {
  const s = useWorld.getState();
  try {
    const data = await j<LifeData>('/api/life/me');
    s.setLife(data);
    const eq = data.assets?.find((a) => a.equipped);
    s.setRiding(eq ? (ITEMS.find((i) => i.id === eq.id) as Item) : null);
  } catch {
    s.setLife({ me: null });
  }
}

export function useLife(enabled: boolean) {
  const life = useWorld((s) => s.life);
  useEffect(() => {
    if (!enabled) return;
    refreshLife();
    const t = setInterval(refreshLife, 60_000);
    return () => clearInterval(t);
  }, [enabled]);
  return life;
}

export type SocialSend = (m: { to?: string; kind: string; text: string; delta?: unknown }) => void;

export async function refreshWallet() {
  const s = useWorld.getState();
  try {
    s.setWallet(await j<WalletData>('/api/wallet'));
  } catch (e) {
    s.setWallet(null);
    throw e;
  }
}

export const lifeActions = {
  async interact(kind: string, toHandle: string, worldId: string | undefined, sendSocial: SocialSend) {
    const r = await j<{ ok: true; toast: { to: string; from: string; kind: string; text: string; delta: unknown } }>('/api/life/interact', { method: 'POST', body: JSON.stringify({ kind, toHandle, worldId }) });
    sendSocial({ to: r.toast.to, kind, text: r.toast.text, delta: r.toast.delta });
    await refreshLife();
    return r;
  },
  async send(toHandle: string, amount: number, note: string | undefined, sendSocial: SocialSend) {
    const r = await j<{ ok: true; bags: number; toast: { to: string; text: string } }>('/api/life/send', { method: 'POST', body: JSON.stringify({ toHandle, amount, note }) });
    sendSocial({ to: r.toast.to, kind: 'send', text: r.toast.text });
    await refreshLife();
    useWorld.getState().pushToast(`Sent ${amount} bags to @${toHandle.replace(/^@/, '')}`, 'send');
    return r;
  },
  async buy(itemId: string) {
    const r = await j<{ ok: true; item: Item }>('/api/life/market', { method: 'POST', body: JSON.stringify({ itemId }) });
    await refreshLife();
    useWorld.getState().pushToast(`${r.item.emoji} You own a ${r.item.name}. It's equipped.`, 'market');
    return r;
  },
  async equip(itemId: string | null) {
    await j('/api/life/market', { method: 'PATCH', body: JSON.stringify({ itemId }) });
    await refreshLife();
  },
  async venue(venueId: string, actionId: string, nearby: string[], sendSocial: SocialSend) {
    const r = await j<{ ok: true; lifted: number; toast: { text: string; delta: unknown } | null }>('/api/life/venue', { method: 'POST', body: JSON.stringify({ venueId, actionId, nearby }) });
    if (r.toast) sendSocial({ kind: 'venue', text: r.toast.text, delta: r.toast.delta });
    await refreshLife();
    return r;
  },
  async coins() {
    return j<{ holdings: Holding[] }>('/api/life/coins');
  },
  async buyCoin(chain: string, mint: string, bags: number) {
    const r = await j<{ ok: true; symbol: string; bags: number }>('/api/life/coins', { method: 'POST', body: JSON.stringify({ op: 'buy', chain, mint, bags }) });
    await refreshLife();
    useWorld.getState().pushToast(`🪙 Bought ${bags} bags of $${r.symbol}. It's on your hand.`, 'market');
    return r;
  },
  async sellCoin(mint: string, fraction: number) {
    const r = await j<{ ok: true; symbol: string; bags: number; pnl: number }>('/api/life/coins', { method: 'POST', body: JSON.stringify({ op: 'sell', mint, fraction }) });
    await refreshLife();
    useWorld.getState().pushToast(`🪙 Sold $${r.symbol} for ${r.bags} bags (${r.pnl >= 0 ? '+' : ''}${r.pnl})`, 'market');
    return r;
  },
  async travel(mode: string, to: string) {
    const r = await j<{ ok: true }>('/api/life/travel', { method: 'POST', body: JSON.stringify({ mode, to }) });
    await refreshLife();
    return r;
  },
  async buyFurniture(itemId: string) {
    const r = await j<{ ok: true; item: Furniture }>('/api/life/home', { method: 'POST', body: JSON.stringify({ op: 'buy', itemId }) });
    await refreshLife();
    useWorld.getState().pushToast(`${r.item.emoji} ${r.item.name} is in your house.`, 'market');
    return r;
  },
  async placeFurniture(itemId: string) {
    const r = await j<{ ok: true; item: Furniture }>('/api/life/home', { method: 'POST', body: JSON.stringify({ op: 'place', itemId }) });
    await refreshLife();
    return r;
  },
  async sellFurniture(itemId: string) {
    const r = await j<{ ok: true; item: Furniture; bags: number }>('/api/life/home', { method: 'POST', body: JSON.stringify({ op: 'sell', itemId }) });
    await refreshLife();
    useWorld.getState().pushToast(`Sold the ${r.item.name} for ${r.bags} bags`, 'market');
    return r;
  },
  async furnitureAct(itemId: string, actionId: string) {
    const r = await j<{ ok: true; power: PowerState; action: FurnitureAction }>('/api/life/home', { method: 'POST', body: JSON.stringify({ op: 'act', itemId, actionId }) });
    await refreshLife();
    return r;
  },
  /** Start an everyday activity; the avatar plays it while the server applies the stats. */
  async activity(activityId: ActivityId) {
    const r = await j<{ ok: true; me: Pick<LifeMe, 'vibes' | 'clout' | 'gas' | 'mood'>; activity: Activity }>('/api/life/activity', { method: 'POST', body: JSON.stringify({ op: 'do', activityId }) });
    const s = useWorld.getState();
    s.patchMe({ ...r.me, status: r.activity.line });
    s.setDoing({ id: r.activity.id, until: Date.now() + r.activity.seconds * 1000 });
    return r;
  },
  /** Report distance walked on foot; the server takes the gas. */
  async walk(walked: number, sprinted: number) {
    const r = await j<{ ok: true; me: Pick<LifeMe, 'gas'> }>('/api/life/activity', { method: 'POST', body: JSON.stringify({ op: 'walk', walked, sprinted }) });
    useWorld.getState().patchMe({ gas: r.me.gas });
    return r;
  },
  async claim(questId: string) {
    const r = await j<{ ok: true; reward: number }>('/api/life/quests', { method: 'POST', body: JSON.stringify({ questId }) });
    await refreshLife();
    useWorld.getState().pushToast(`+${r.reward} bags 💰`, 'quest');
    return r;
  },
  // ---- real Solana wallet
  async airdrop() {
    const r = await j<{ ok: true; url: string }>('/api/wallet/airdrop', { method: 'POST' });
    await refreshWallet();
    useWorld.getState().pushToast('1 devnet SOL landed 🪂', 'wallet');
    return r;
  },
  async sendSol(to: string, sol: number, note: string | undefined, sendSocial: SocialSend) {
    const r = await j<{ ok: true; signature: string; url: string; toast: { to: string; kind: string; text: string } | null }>('/api/wallet/send', { method: 'POST', body: JSON.stringify({ to, sol, note }) });
    if (r.toast) sendSocial(r.toast);
    await refreshWallet();
    useWorld.getState().pushToast(`Sent ${sol} SOL ✓`, 'wallet');
    return r;
  },
  async swap(side: 'buy' | 'sell', mint: string, amount: number, symbol?: string) {
    const r = await j<{ ok: true; signature: string; url: string; outAmount: string; priceImpactPct: string }>('/api/wallet/swap', { method: 'POST', body: JSON.stringify({ side, mint, amount, symbol }) });
    await refreshWallet();
    await refreshLife();
    refreshBalloons();
    useWorld.getState().pushToast(side === 'buy' ? `Aped $${symbol ?? ''} on-chain 🦍` : `Sold $${symbol ?? ''} ✓`, 'wallet');
    return r;
  },
  async exportKey() {
    return j<{ publicKey: string; secretKey: string }>('/api/wallet/export', { method: 'POST' });
  },
};
