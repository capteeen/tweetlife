'use client';
import { useEffect } from 'react';
import PartySocket from 'partysocket';
import { create } from 'zustand';
import { FURNITURE, furnitureById, type Furniture, type FurnitureAction } from '@/lib/life/home';

// Live presence inside a house: the host and their guests see each other walk around, sit, sleep and dance.
// Same PartyKit server as the city (party/world.ts), room `home:<owner handle>`, with a ticket that only the
// owner and people allowed in can get (app/api/life/home/ticket).

export type HousePeer = { id: string; handle: string; x: number; z: number; yaw: number; act: string | null; at: number };

export const useHousePeers = create<{ peers: Record<string, HousePeer>; put: (p: HousePeer) => void; drop: (id: string) => void; clear: () => void }>((set) => ({
  peers: {},
  put: (p) => set((s) => ({ peers: { ...s.peers, [p.id]: p } })),
  drop: (id) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[id];
      return { peers };
    }),
  clear: () => set({ peers: {} }),
}));

/** Where my avatar is and what it is doing, written every frame by the room's walker and sent at 10 Hz. */
export const houseMe = { x: 0, z: 0, yaw: 0, act: null as string | null };

/** "f<piece>.<action>": using a piece of furniture, short enough for the presence message. */
export const encodeUse = (item: Furniture, action: FurnitureAction) => `f${FURNITURE.indexOf(item)}.${item.actions.indexOf(action)}`;
export function decodeUse(act: string | null): { item: Furniture; action: FurnitureAction } | null {
  const m = act?.match(/^f(\d+)\.(\d+)$/);
  if (!m) return null;
  const item = FURNITURE[Number(m[1])];
  const action = item?.actions[Number(m[2])];
  return item && action && furnitureById(item.id) ? { item, action } : null;
}

export function useHousePresence(ownerHandle: string | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ownerHandle) return;
    let sock: PartySocket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const { put, drop, clear } = useHousePeers.getState();
    (async () => {
      const res = await fetch(`/api/life/home/ticket?handle=${encodeURIComponent(ownerHandle)}`).then((r) => r.json()).catch(() => null);
      if (cancelled || !res?.ticket || !res.host) return;
      sock = new PartySocket({ host: res.host, party: 'world', room: res.room, query: { ticket: res.ticket } });
      const handles = new Map<string, string>();
      sock.addEventListener('message', (ev) => {
        let m: { t: string; [k: string]: unknown };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.t === 'hello') {
          for (const p of m.peers as HousePeer[]) {
            handles.set(p.id, p.handle);
            put({ ...p, act: p.act ?? null, at: Date.now() });
          }
        } else if (m.t === 'join') {
          const p = m.peer as HousePeer;
          handles.set(p.id, p.handle);
          put({ ...p, act: null, at: Date.now() });
        } else if (m.t === 'pos') {
          const h = handles.get(m.id as string);
          if (h) put({ id: m.id as string, handle: h, x: m.x as number, z: m.z as number, yaw: m.yaw as number, act: (m.act as string | null) ?? null, at: Date.now() });
        } else if (m.t === 'leave') {
          handles.delete(m.id as string);
          drop(m.id as string);
        }
      });
      timer = setInterval(() => {
        if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'pos', x: houseMe.x, z: houseMe.z, yaw: houseMe.yaw, ride: null, act: houseMe.act }));
      }, 100);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sock?.close();
      clear();
    };
  }, [ownerHandle, enabled]);
}
