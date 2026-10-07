'use client';
import { create } from 'zustand';
import type { WorldModel, MarkModel } from '@/lib/world/load';
import type { Placed } from '@/lib/world/geometry';
import type { PlacedVenue } from '@/lib/life/venues';
import type { Item } from '@/lib/life/market';
import type { HomeItem } from '@/lib/life/home';

export type Peer = { id: string; handle: string; x: number; z: number; yaw: number; at: number; ride?: string | null };
export type ChatLine = { id: string; from: string; text: string; at: number; x: number; z: number };
export type Toast = { id: string; text: string; kind: string; at: number };
export type PhoneApp = 'home' | 'trenches' | 'wallet' | 'solana' | 'hustle' | 'market' | 'garage' | 'house' | 'rich' | 'gist' | 'map' | 'guestbook' | 'settings';
export type MarketKind = 'car' | 'boat' | 'plane' | 'home' | null;

export type LifeMe = {
  id: string; handle: string; name: string; avatarUrl: string | null; bags: number; status: string;
  vibes: number; clout: number; gas: number; mood: string; moodEmoji: string;
};
export type WalletData = {
  address: string;
  cluster: 'devnet' | 'mainnet-beta';
  explorer: string;
  exportedAt: string | null;
  balances: { sol: number; lamports: number; solUsd: number | null; totalUsd: number | null; tokens: TokenBalance[] } | null;
  error: string | null;
  txs: { id: string; kind: string; sol: number; mint: string | null; signature: string | null; url: string | null; note: string; at: string }[];
};
export type TokenBalance = {
  mint: string; amount: number; decimals: number; symbol: string | null; name: string | null; priceUsd: number | null; valueUsd: number | null;
  change24h: number | null; icon: string | null; url: string | null;
};
export type LifeData = {
  me: LifeMe | null;
  assets?: (Item & { equipped: boolean; paid: number; acquiredAt: string })[];
  furniture?: HomeItem[];
  netWorth?: number;
  quests?: { day: string; quests: { id: string; title: string; emoji: string; target: number; reward: number; progress: number; done: boolean; claimed: boolean }[]; resetsAt: string };
  txs?: { id: string; kind: string; amount: number; note: string; at: string }[];
};
type Me = { id: string; handle: string; isOwner: boolean } | null;

export type WorldState = {
  model: WorldModel | null;
  skyline: boolean; // true = outside view (no walking)
  me: Me;
  selected: Placed | null;
  lit: Set<string>;
  peers: Record<string, Peer>;
  chat: ChatLine[];
  playerPos: { x: number; z: number; yaw: number };
  spawnAt: { x: number; z: number; rot: number; depth: number } | null;
  guestbookOpen: boolean;
  chatOpen: boolean;
  // life layer
  life: LifeData | null;
  wallet: WalletData | null;
  phone: { open: boolean; app: PhoneApp; marketKind: MarketKind; to: string | null };
  selectedPeer: Peer | null;
  selectedVenue: PlacedVenue | null;
  nearVenue: string | null;
  riding: Item | null;
  teleport: { x: number; z: number } | null;
  toasts: Toast[];

  setModel: (m: WorldModel, skyline: boolean, me: Me) => void;
  select: (p: Placed | null) => void;
  setLit: (ids: string[]) => void;
  toggleLit: (id: string, lit: boolean, count: number) => void;
  upsertPeer: (p: Peer) => void;
  dropPeer: (id: string) => void;
  pushChat: (c: ChatLine) => void;
  setPlayerPos: (p: { x: number; z: number; yaw: number }) => void;
  setSpawn: (p: { x: number; z: number; rot: number; depth: number } | null) => void;
  addMark: (m: MarkModel) => void;
  clearMarks: (id?: string) => void;
  setGuestbookOpen: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  setLife: (l: LifeData | null) => void;
  setWallet: (w: WalletData | null) => void;
  patchMe: (p: Partial<LifeMe>) => void;
  openPhone: (app?: PhoneApp, marketKind?: MarketKind, to?: string | null) => void;
  closePhone: () => void;
  selectPeer: (p: Peer | null) => void;
  selectVenue: (v: PlacedVenue | null) => void;
  setNearVenue: (id: string | null) => void;
  setRiding: (i: Item | null) => void;
  setTeleport: (t: { x: number; z: number } | null) => void;
  pushToast: (text: string, kind?: string) => void;
  dropToast: (id: string) => void;
};

export const useWorld = create<WorldState>((set) => ({
  model: null,
  skyline: true,
  me: null,
  selected: null,
  lit: new Set(),
  peers: {},
  chat: [],
  playerPos: { x: 0, z: 0, yaw: 0 },
  spawnAt: null,
  guestbookOpen: false,
  chatOpen: false,
  life: null,
  wallet: null,
  phone: { open: false, app: 'home', marketKind: null, to: null },
  selectedPeer: null,
  selectedVenue: null,
  nearVenue: null,
  riding: null,
  teleport: null,
  toasts: [],
  setModel: (model, skyline, me) => set({ model, skyline, me }),
  select: (selected) => set({ selected, ...(selected ? { selectedPeer: null, selectedVenue: null } : {}) }),
  setLit: (ids) => set({ lit: new Set(ids) }),
  toggleLit: (id, lit, count) =>
    set((s) => {
      const next = new Set(s.lit);
      if (lit) next.add(id);
      else next.delete(id);
      const model = s.model
        ? { ...s.model, geometry: { ...s.model.geometry, structures: s.model.geometry.structures.map((p) => (p.id === id ? { ...p, lanternsLit: count } : p)) } }
        : s.model;
      const selected = s.selected && s.selected.id === id ? { ...s.selected, lanternsLit: count } : s.selected;
      return { lit: next, model, selected };
    }),
  upsertPeer: (p) => set((s) => ({ peers: { ...s.peers, [p.id]: { ...s.peers[p.id], ...p } } })),
  dropPeer: (id) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[id];
      return { peers, selectedPeer: s.selectedPeer?.id === id ? null : s.selectedPeer };
    }),
  pushChat: (c) => set((s) => ({ chat: [...s.chat.slice(-60), c] })),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setSpawn: (spawnAt) => set({ spawnAt }),
  addMark: (m) => set((s) => (s.model ? { model: { ...s.model, marks: [m, ...s.model.marks.filter((x) => x.byHandle !== m.byHandle)] } } : {})),
  clearMarks: (id) => set((s) => (s.model ? { model: { ...s.model, marks: id ? s.model.marks.filter((m) => m.id !== id) : [] } } : {})),
  setGuestbookOpen: (guestbookOpen) => set({ guestbookOpen }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setLife: (life) => set({ life }),
  setWallet: (wallet) => set({ wallet }),
  patchMe: (p) => set((s) => (s.life?.me ? { life: { ...s.life, me: { ...s.life.me, ...p } } } : {})),
  openPhone: (app = 'home', marketKind = null, to = null) => set({ phone: { open: true, app, marketKind, to }, selected: null, selectedPeer: null, selectedVenue: null, guestbookOpen: false }),
  closePhone: () => set((s) => ({ phone: { ...s.phone, open: false } })),
  selectPeer: (selectedPeer) => set({ selectedPeer, ...(selectedPeer ? { selected: null, selectedVenue: null } : {}) }),
  selectVenue: (selectedVenue) => set({ selectedVenue, ...(selectedVenue ? { selected: null, selectedPeer: null } : {}) }),
  setNearVenue: (nearVenue) => set({ nearVenue }),
  setRiding: (riding) => set({ riding }),
  setTeleport: (teleport) => set({ teleport }),
  pushToast: (text, kind = 'info') => set((s) => ({ toasts: [...s.toasts.slice(-4), { id: Math.random().toString(36).slice(2), text, kind, at: Date.now() }] })),
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
