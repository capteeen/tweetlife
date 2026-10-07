'use client';
import { useEffect } from 'react';
import { useWorld, type LifeData } from '@/components/world/store';
import { ITEMS, type Item } from '@/lib/life/market';

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

export const lifeActions = {
  async trade(side: 'buy' | 'sell', chain: string, address: string, amount: number) {
    const r = await j<{ ok: true; symbol: string; qty?: number; bags?: number; pnl?: number }>('/api/life/trade', { method: 'POST', body: JSON.stringify({ side, chain, address, amount }) });
    await refreshLife();
    useWorld.getState().pushToast(side === 'buy' ? `Aped $${r.symbol} 🦍` : `Sold $${r.symbol} for ${r.bags} bags (${(r.pnl ?? 0) >= 0 ? '+' : ''}${r.pnl})`, 'trade');
    return r;
  },
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
  async claim(questId: string) {
    const r = await j<{ ok: true; reward: number }>('/api/life/quests', { method: 'POST', body: JSON.stringify({ questId }) });
    await refreshLife();
    useWorld.getState().pushToast(`+${r.reward} bags 💰`, 'quest');
    return r;
  },
};
