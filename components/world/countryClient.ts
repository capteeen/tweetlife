'use client';
import { useEffect, useRef, useState } from 'react';
import type { WorldModel } from '@/lib/world/load';
import type { CountryModel } from '@/lib/world/country';
import { CAPITAL_SLOT, PLOT_BLOCKS, plotCell, plotEntrance } from '@/lib/world/country-map';
import { PITCH_X, PITCH_Z } from '@/lib/world/geometry';
import { airportLayout } from '@/lib/world/layout';
import { COUNTRIES, isCountryId, type CountryId } from '@/lib/world/countries';
import { focusBlock, useWorld } from './store';

// Client side of the shared country maps. Resolves where you arrive (a /w/<handle> link: that player's block
// in their country; /c/<country>: Capital Square; otherwise your own block at home), loads the country's map
// whenever useWorld.country changes (a flight calls setCountry), keeps useWorld.block on the block you are
// standing in, and fetches each block's post text the first time you come near it.

type BlockReply = {
  handle: string;
  country: CountryId;
  slot: number;
  admitted: boolean;
  reason: string;
  message?: string;
  posts: Record<string, { text: string; mediaUrl: string | null }>;
  lit: string[];
  me: { id: string; handle: string; isOwner: boolean } | null;
};

const fetched = new Map<string, Promise<BlockReply | null>>();
/** blocks whose text is filled into the current map (a new map, after a flight, starts empty) */
const applied = new Set<string>();

/** Fetch a block's posts (once per visit) and fill them into the map (once per map). */
export function loadBlock(handle: string) {
  const key = handle.toLowerCase();
  let p = fetched.get(key);
  if (!p) {
    useWorld.getState().setBlockAccess(handle, { loading: true, admitted: false });
    p = fetch(`/api/world/${encodeURIComponent(handle)}/block`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<BlockReply>) : null))
      .catch(() => null)
      .then((b) => {
        const s = useWorld.getState();
        if (!b) {
          fetched.delete(key);
          s.setBlockAccess(handle, { loading: false, admitted: false, message: 'Could not load this block. Try again shortly.' });
          return null;
        }
        s.setBlockAccess(handle, { loading: false, admitted: b.admitted, reason: b.reason, message: b.message });
        return b;
      });
    fetched.set(key, p);
  }
  if (!applied.has(key)) {
    applied.add(key);
    p.then((b) => {
      if (b?.admitted) useWorld.getState().hydrateBlock(b.handle, b.posts, b.lit);
      else applied.delete(key);
    });
  }
  return p;
}

/** Which block (plot owner's handle) covers (x, z); null in Capital Square, a free plot or out of town. */
export function blockAt(x: number, z: number): string | null {
  const cm = useWorld.getState().countryMap;
  if (!cm) return null;
  const pi = Math.round(x / (PLOT_BLOCKS * PITCH_X)), pj = Math.round(z / (PLOT_BLOCKS * PITCH_Z));
  for (const p of cm.plots) {
    const c = plotCell(p.slot);
    if (c.pi === pi && c.pj === pj) return p.handle;
  }
  return null;
}

/** The front door of a block (or Capital Square), shaped as a Player spawn. */
export function blockEntrance(handle: string | null) {
  const cm = useWorld.getState().countryMap;
  const p = handle && cm ? cm.plots.find((q) => q.handle.toLowerCase() === handle.toLowerCase()) : null;
  const e = plotEntrance(p ? p.slot : CAPITAL_SLOT);
  return { x: e.x, z: e.z, rot: e.rot, depth: e.depth };
}

/** The country you are in by your profile: where you last flew to, else your nationality. Waits briefly for it. */
async function whereIAm(): Promise<CountryId | null> {
  for (let i = 0; i < 20; i++) {
    const life = useWorld.getState().life;
    if (life) {
      const me = life.me;
      if (!me) return null;
      const at = me.location ?? me.citizen?.country;
      return isCountryId(at) ? at : null;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export function useCountryWorld(opts: { handle?: string; country?: string; spawnPostId?: string; enabled: boolean }) {
  const { handle, spawnPostId, enabled } = opts;
  const [error, setError] = useState<string | null>(null);
  // `square`: a /c/<country> link asks for Capital Square, not your own block
  const [entry, setEntry] = useState<{ focus: string | null; country: CountryId; square?: boolean } | null>(null);
  const country = useWorld((s) => s.country);
  const loads = useRef(0);

  // 1. where you arrive
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const asked = isCountryId(opts.country) ? opts.country : null;
      if (handle) {
        const b = await loadBlock(handle);
        if (cancelled) return;
        if (!b) {
          const res = await fetch(`/api/world/${encodeURIComponent(handle)}/block`).catch(() => null);
          if (!cancelled) setError(res?.status === 404 ? 'No world for that handle.' : 'Could not load this world.');
          return;
        }
        // your own link (/play): you are where you last flew to, if that is not home
        let c = asked ?? b.country;
        if (!asked && b.me?.isOwner) {
          const location = await whereIAm();
          if (cancelled) return;
          if (location) c = location;
        }
        useWorld.getState().setCountry(c);
        setEntry({ focus: c === b.country ? b.handle : null, country: c });
      } else {
        const c = asked ?? (await whereIAm()) ?? useWorld.getState().country;
        if (cancelled) return;
        useWorld.getState().setCountry(c);
        setEntry({ focus: null, country: c, square: !!asked });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, opts.country, enabled]);

  // 2. the country's map, whenever the country changes
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const n = ++loads.current;
    (async () => {
      const res = await fetch(`/api/country/${country}`, { cache: 'no-store' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as (CountryModel & { me: { id: string; handle: string; isOwner: boolean } | null; mine: { country: CountryId; slot: number } | null }) | null;
      if (cancelled || n !== loads.current) return;
      if (!j?.geometry) {
        setError('Could not load this country.');
        return;
      }
      const st = useWorld.getState();
      const first = n === 1;
      const cm = { country, plots: j.plots, marks: j.marks };
      const base: WorldModel = {
        id: '', handle: '', ownerName: '', ownerAvatar: null, xUserId: '', biome: 'meadow', access: 'public', followersCount: 0, postCount: 0,
        structureCount: 0, hiddenCount: 0, lastSyncAt: null, ingestState: 'live', ingestError: null, accountCreatedAt: new Date().toISOString(),
        showMetrics: true, chatEnabled: true, paths: [], geometry: j.geometry, marks: [], building: null,
      };
      // arrive: a deep link's block on first load; off a plane, the airport kerb; else your own block at home, or the square
      const mineHere = j.mine && j.mine.country === country ? j.plots.find((p) => p.slot === j.mine!.slot) ?? null : null;
      let focus: string | null = null;
      let spawn: { x: number; z: number; rot: number; depth: number } | null = null;
      if (first && entry.focus && entry.country === country) focus = entry.focus;
      // off a plane (components/life/flight.ts): the airport, where the landing is planned
      else if (st.flight) {
        const ap = airportLayout(j.geometry.contentRadius, j.geometry.boundaryRadius);
        spawn = { x: ap.kerb.x, z: ap.kerb.z, rot: Math.PI / 2, depth: 0 };
      } else if (mineHere && !(first && entry.square)) focus = mineHere.handle;
      applied.clear();
      st.setCountryMap(cm, j.mine);
      st.setModel(focusBlock(base, cm, focus), false, j.me);
      st.setBlock(focus);
      st.setLit([]);
      if (!spawn) {
        const target = spawnPostId && first ? j.geometry.structures.find((s) => s.postId === spawnPostId) : null;
        spawn = target ? { x: target.x, z: target.z, rot: target.rot, depth: target.depth } : blockEntrance(focus);
        if (target) st.select(target);
      }
      st.setSpawn(spawn);
      if (focus) loadBlock(focus);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, country]);

  // 3. keep track of whose block you are in, and read each block's posts as you get near
  useEffect(() => {
    if (!entry) return;
    const t = setInterval(() => {
      const s = useWorld.getState();
      if (!s.countryMap) return;
      const { x, z } = s.playerPos;
      const h = blockAt(x, z);
      if (h !== s.block) s.setBlock(h);
      // the blocks next door too, so a tap from across the street already has its text
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = blockAt(x + dx * 60, z + dz * 50);
        if (n) loadBlock(n);
      }
    }, 600);
    return () => clearInterval(t);
  }, [entry]);

  return { error, countryName: COUNTRIES[country].name };
}
