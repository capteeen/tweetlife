'use client';
import { create } from 'zustand';
import type { WorldModel, MarkModel } from '@/lib/world/load';
import type { Placed } from '@/lib/world/geometry';

export type Peer = { id: string; handle: string; x: number; z: number; yaw: number; at: number };
export type ChatLine = { id: string; from: string; text: string; at: number; x: number; z: number };

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
  setModel: (model, skyline, me) => set({ model, skyline, me }),
  select: (selected) => set({ selected }),
  setLit: (ids) => set({ lit: new Set(ids) }),
  toggleLit: (id, lit, count) =>
    set((s) => {
      const next = new Set(s.lit);
      if (lit) next.add(id);
      else next.delete(id);
      const model = s.model
        ? {
            ...s.model,
            geometry: {
              ...s.model.geometry,
              structures: s.model.geometry.structures.map((p) => (p.id === id ? { ...p, lanternsLit: count } : p)),
            },
          }
        : s.model;
      const selected = s.selected && s.selected.id === id ? { ...s.selected, lanternsLit: count } : s.selected;
      return { lit: next, model, selected };
    }),
  upsertPeer: (p) => set((s) => ({ peers: { ...s.peers, [p.id]: p } })),
  dropPeer: (id) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[id];
      return { peers };
    }),
  pushChat: (c) => set((s) => ({ chat: [...s.chat.slice(-60), c] })),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setSpawn: (spawnAt) => set({ spawnAt }),
  addMark: (m) =>
    set((s) => (s.model ? { model: { ...s.model, marks: [m, ...s.model.marks.filter((x) => x.byHandle !== m.byHandle)] } } : {})),
  clearMarks: (id) =>
    set((s) => (s.model ? { model: { ...s.model, marks: id ? s.model.marks.filter((m) => m.id !== id) : [] } } : {})),
  setGuestbookOpen: (guestbookOpen) => set({ guestbookOpen }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
}));
