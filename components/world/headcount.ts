'use client';
import { useEffect, useMemo, useState } from 'react';
import { RESIDENTS } from '@/lib/life/residents';
import type { PlacedVenue } from '@/lib/life/venues';
import { CLUB_IDS } from '@/lib/world/interiors';
import { useWorld } from './store';
import { buildRoutes, poseAt } from './residentPaths';

// How many people are in each club right now, so players can find the busy one: everyone in the room's presence
// (other players), you, and the city's named residents whose routes have them there at this moment.

type Spot = { x: number; z: number };

/**
 * Everyone online in this place. Today that is the presence peers of the room you are in; when countries become
 * shared rooms (one presence room per country, with a light roster of everyone every few seconds), point this at
 * that roster and every headcount follows.
 */
export function livePeople(): Spot[] {
  const s = useWorld.getState();
  return [...Object.values(s.peers), s.playerPos];
}

/** Is a point inside a venue's walls? */
export function insideVenue(v: PlacedVenue, x: number, z: number, pad = 0) {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  const dx = x - v.x, dz = z - v.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < v.w / 2 + pad && Math.abs(lz) < v.d / 2 + pad;
}

export type Headcount = { people: number; residents: number; total: number };

/** Headcount per club id, refreshed every couple of seconds. */
export function useClubHeadcounts(venues: PlacedVenue[] | null, contentRadius: number | null): Record<string, Headcount> {
  const clubs = useMemo(() => (venues ?? []).filter((v) => (CLUB_IDS as readonly string[]).includes(v.id)), [venues]);
  const routes = useMemo(() => (venues && contentRadius != null ? buildRoutes(RESIDENTS, venues, contentRadius) : []), [venues, contentRadius]);
  const [counts, setCounts] = useState<Record<string, Headcount>>({});
  useEffect(() => {
    if (!clubs.length) return;
    const tick = () => {
      const people = livePeople();
      const now = Date.now() / 1000;
      const at = routes.map((r) => (r ? poseAt(r, now) : null));
      const out: Record<string, Headcount> = {};
      for (const v of clubs) {
        const p = people.filter((q) => insideVenue(v, q.x, q.z, 0.5)).length;
        const r = at.filter((q) => q?.venue?.id === v.id).length;
        out[v.id] = { people: p, residents: r, total: p + r };
      }
      setCounts(out);
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [clubs, routes]);
  return counts;
}

/** "Packed", "Busy", "Warming up" or "Quiet", against what the club is built for. */
export function vibeOf(total: number, capacity = 60) {
  const f = total / capacity;
  return f > 0.6 ? { label: 'Packed', emoji: '🔥' } : f > 0.25 ? { label: 'Busy', emoji: '🎉' } : total > 0 ? { label: 'Warming up', emoji: '✨' } : { label: 'Quiet', emoji: '🌙' };
}
