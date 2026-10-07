'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Look } from '@/lib/life/look';

// Other players' chosen looks, fetched in batches by handle and cached for the session.
// `undefined` = not loaded yet, `null` = no chosen look (the figure is seeded from the handle).

const useLooks = create<{ looks: Record<string, Look | null>; put: (l: Record<string, Look | null>) => void }>((set) => ({
  looks: {},
  put: (l) => set((s) => ({ looks: { ...s.looks, ...l } })),
}));

const queued = new Set<string>();
const fetchedAt = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

function request(handle: string) {
  const h = handle.toLowerCase();
  const at = fetchedAt.get(h);
  // re-check every few minutes so a look changed mid-visit shows up
  if (at && Date.now() - at < 3 * 60_000) return;
  fetchedAt.set(h, Date.now());
  queued.add(h);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...queued].slice(0, 50);
    batch.forEach((b) => queued.delete(b));
    if (queued.size) request([...queued][0]);
    const res = await fetch(`/api/life/look?handles=${encodeURIComponent(batch.join(','))}`).then((r) => r.json()).catch(() => null);
    if (res?.looks) useLooks.getState().put(res.looks);
  }, 60);
}

/** Set a look locally (after the signed-in player saves theirs). */
export function rememberLook(handle: string, look: Look | null) {
  fetchedAt.set(handle.toLowerCase(), Date.now());
  useLooks.getState().put({ [handle.toLowerCase()]: look });
}

export function useLookOf(handle: string | null | undefined): Look | null {
  const h = handle?.toLowerCase() ?? '';
  const look = useLooks((s) => (h ? s.looks[h] : undefined));
  useEffect(() => {
    if (h && h !== 'visitor') request(h);
  }, [h]);
  return look ?? null;
}
