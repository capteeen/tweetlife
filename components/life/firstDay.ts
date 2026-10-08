'use client';
import { useWorld } from '@/components/world/store';
import { airportLayout, pathLength, type Pt } from '@/lib/world/layout';
import { BLOCK_D, BLOCK_W, SIDEWALK } from '@/lib/world/geometry';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { tripSeconds } from '@/lib/life/transport';
import { firstDayStep, type FirstDayStepId, type FirstDayView } from '@/lib/life/firstDaySteps';
import { plannedRoute } from './travel';
import { refreshLife } from './useLife';

// Client side of the guided first day: talk to /api/life/firstday, and the places the guide sends you.

async function post(body: object): Promise<{ ok: true; paid: number; steps?: FirstDayStepId[]; firstDay: FirstDayView }> {
  const res = await fetch('/api/life/firstday', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function apply(view: FirstDayView) {
  const s = useWorld.getState();
  if (s.life) s.setLife({ ...s.life, firstDay: view });
}

function paidToast(step: FirstDayStepId, paid: number) {
  const d = firstDayStep(step);
  if (paid > 0 && d) useWorld.getState().pushToast(`${d.emoji} ${d.title} · +${paid} bags`, 'firstday');
}

export const firstDayActions = {
  /** a moment the client saw (landing, the ride, the end) */
  async complete(step: FirstDayStepId) {
    const r = await post({ op: 'complete', step });
    apply(r.firstDay);
    paidToast(step, r.paid);
    await refreshLife();
    return r;
  },
  /** tick whatever the player's records already prove (a buy, a shift, a coin) */
  async check() {
    const r = await post({ op: 'check' });
    for (const st of r.steps ?? []) paidToast(st, firstDayStep(st)?.reward ?? 0);
    if (r.paid) await refreshLife();
    else apply(r.firstDay);
    return r;
  },
  async skip() {
    const r = await post({ op: 'skip' });
    apply(r.firstDay);
    useWorld.getState().setGuide(null);
    return r;
  },
  async start() {
    const r = await post({ op: 'start' });
    apply(r.firstDay);
    useWorld.getState().closePhone();
    return r;
  },
};

/** Where you land: the airport kerb, outside the terminal (lib/world/layout.ts). */
export function arrivalSpot(): Pt | null {
  const g = useWorld.getState().model?.geometry;
  if (!g) return null;
  return airportLayout(g.contentRadius, g.boundaryRadius).kerb;
}

/**
 * Where "home" is in the city: the street outside your own block. Today every player's city is their own,
 * so that is the corner you spawn on. With shared country rooms it becomes your plot's front step:
 * `const m = useWorld.getState().mine; return m ? plotEntrance(m.slot).front : null` (lib/world/country-map.ts).
 */
export function homeSpot(): Pt {
  // the default spawn corner (DEFAULT_SPAWN in components/world/Player.tsx), on the pavement of the first block
  return { x: BLOCK_W / 2 + SIDEWALK / 2, z: -(BLOCK_D / 2 + SIDEWALK / 2) };
}

export function venueSpot(id: string): PlacedVenue | null {
  const g = useWorld.getState().model?.geometry;
  if (!g) return null;
  return placeVenues(g.contentRadius, g.boundaryRadius).find((v) => v.id === id) ?? null;
}

/** The pavement in front of a venue's door (venues face the city centre: +z in the venue frame). */
export function doorOf(v: PlacedVenue, out = 3): Pt {
  const c = Math.cos(v.rot), sn = Math.sin(v.rot);
  const lz = v.d / 2 + out;
  return { x: v.x + lz * sn, z: v.z + lz * c };
}

/**
 * A free first-day lift: the trip runs like a paid ride (the player controller drives it) but costs nothing,
 * so nothing is sent to the travel endpoint. Resolves when you arrive.
 */
export function freeLift(mode: 'taxi' | 'scooter', emoji: string, label: string, to: Pt): Promise<void> {
  const s = useWorld.getState();
  const path = plannedRoute(to);
  const duration = tripSeconds(pathLength(path), mode === 'taxi' ? 4 : 3.2);
  s.selectVenue(null);
  s.setMapOpen(false);
  s.closePhone();
  s.setTrip({ mode, emoji, label, path, startedAt: performance.now(), duration, itemId: null });
  return new Promise((resolve) => {
    const started = performance.now();
    const t = setInterval(() => {
      const now = useWorld.getState().trip;
      // arrived (the controller clears the trip), or the trip was replaced or cancelled
      if (!now || now.label !== label || performance.now() - started > (duration + 5) * 1000) {
        clearInterval(t);
        resolve();
      }
    }, 200);
  });
}
