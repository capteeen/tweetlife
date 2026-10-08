'use client';
import { useWorld } from '@/components/world/store';
import { airportLayout, pathLength, route, type Pt } from '@/lib/world/layout';
import { terminalLayout } from '@/lib/world/terminal';
import { BLOCK_D, BLOCK_W, SIDEWALK } from '@/lib/world/geometry';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { tripSeconds } from '@/lib/life/transport';
import { firstDayStep, type FirstDayStepId, type FirstDayView } from '@/lib/life/firstDaySteps';
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

/** Where a new player's plane parks: the arrival stand on the apron (components/life/flight.ts walks you in from there). */
export function arrivalSpot(): Pt | null {
  const g = useWorld.getState().model?.geometry;
  if (!g) return null;
  const a = airportLayout(g.contentRadius, g.boundaryRadius);
  return { x: a.apron.x - 1, z: 38 };
}

/** Out of the terminal: through the landside doors to the kerb, where the cabs wait. Empty when you are not inside. */
function outOfTerminal(from: Pt): Pt[] {
  const g = useWorld.getState().model?.geometry;
  if (!g) return [];
  const a = airportLayout(g.contentRadius, g.boundaryRadius);
  const t = terminalLayout(a);
  const inside = from.x > t.west - 0.5 && from.x < t.east + 0.5 && Math.abs(from.z - a.terminal.z) < a.terminal.d / 2;
  return inside ? [{ x: from.x, z: a.terminal.z }, t.entrance, { x: t.west - 1.5, z: a.terminal.z }, a.kerb] : [];
}

function routeFrom(from: Pt, to: Pt): Pt[] {
  const g = useWorld.getState().model?.geometry;
  if (!g) return [from, to];
  const { K, pitchX, pitchZ, road } = g.grid;
  const box = g.blocks.length ? { halfW: ((2 * K + 1) * pitchX + road) / 2, halfD: ((2 * K + 1) * pitchZ + road) / 2, pitchX, pitchZ } : null;
  return route(from, to, g.contentRadius, g.boundaryRadius, box);
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
 * so nothing is sent to the travel endpoint. From inside the terminal it walks you out to the kerb first.
 * Resolves when you arrive.
 */
export function freeLift(mode: 'taxi' | 'scooter', emoji: string, label: string, to: Pt): Promise<void> {
  const s = useWorld.getState();
  const me = { x: s.playerPos.x, z: s.playerPos.z };
  const out = outOfTerminal(me);
  const path = out.length ? [me, ...out.slice(0, -1), ...routeFrom(out[out.length - 1], to)] : routeFrom(me, to);
  const duration = tripSeconds(pathLength(path), mode === 'taxi' ? 4 : 3.2);
  s.selectVenue(null);
  s.setMapOpen(false);
  s.closePhone();
  return new Promise((resolve) => {
    s.setTrip({ mode, emoji, label, path, startedAt: performance.now(), duration, itemId: null, onDone: resolve });
    // a trip replaced or cancelled never calls onDone: give up waiting a little after it should have ended
    setTimeout(resolve, (duration + 6) * 1000);
  });
}
