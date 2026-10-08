'use client';
import { useWorld, type BoardingPass } from '@/components/world/store';
import { airportLayout, pathLength, type Airport, type Pt } from '@/lib/world/layout';
import { terminalLayout } from '@/lib/world/terminal';
import { tripSeconds } from '@/lib/life/transport';
import { FLIGHT, cabinById, type CabinId } from '@/lib/life/flights';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { refreshLife } from './useLife';

// Client side of flying. You book at a check-in desk (the server charges the fare and signs a boarding
// pass), go through security, and board at the gate (the server checks the pass and moves you). Then the
// flight plays out: out through the boarding door to the plane on its stand, taxi and take-off, a few
// seconds above the clouds while the destination's city loads underneath, the landing there, and the walk
// into the arrivals hall to passport control. Your own plane skips the desks: walk up to it and go.

/** The stand on the apron, south of the gates: where the plane you board (or your own jet) waits. */
export const standOf = (ap: Airport): Pt => ({ x: ap.apron.x + 2, z: -34 });
/** Where arriving planes stop, north of the gates. */
export const arrivalStandOf = (ap: Airport): Pt => ({ x: ap.apron.x + 2, z: 40 });

/** Out of the stand, along the taxiway to the north end, down the runway and up over the water. */
export function takeoffPath(ap: Airport): Pt[] {
  const s = standOf(ap), rw = ap.runway, tw = ap.taxiway;
  const top = -rw.d / 2 + 8;
  return [s, { x: tw.x, z: s.z }, { x: tw.x, z: top }, { x: rw.x, z: top }, { x: rw.x, z: rw.d / 2 }, { x: rw.x, z: rw.d / 2 + 160 }];
}

/** In from the north over the water, touch down at the threshold halfway through, roll out and taxi to the arrival stand. */
export function landingPath(ap: Airport): Pt[] {
  const rw = ap.runway, tw = ap.taxiway, a = arrivalStandOf(ap);
  return [{ x: rw.x, z: -rw.d / 2 - 116 }, { x: rw.x, z: a.z }, { x: tw.x, z: a.z }, a];
}

type Resp = { ok: true; from: CountryId; to: CountryId; cabin: CabinId; number: string; pass?: string; me: { bags: number; location?: CountryId } };
async function post(body: unknown) {
  const res = await fetch('/api/life/fly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as Resp;
}

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const ap = () => {
  const g = useWorld.getState().model!.geometry;
  return airportLayout(g.contentRadius, g.boundaryRadius);
};

/** Walk a path on foot and resolve when you get there. */
function walk(path: Pt[], label: string) {
  return new Promise<void>((done) => {
    useWorld.getState().setTrip({ mode: 'walk', emoji: '🚶', label, path, startedAt: performance.now(), duration: tripSeconds(pathLength(path), 1.3), itemId: null, onDone: done });
  });
}

/** At a check-in desk: pay the fare, get a boarding pass. */
export async function checkIn(to: CountryId, cabin: 'economy' | 'first') {
  const r = await post({ step: 'book', to, cabin });
  const s = useWorld.getState();
  const pass: BoardingPass = { token: r.pass!, from: r.from, to: r.to, cabin: r.cabin, number: r.number };
  s.patchMe({ bags: r.me.bags });
  s.patchAirport({ pass, cleared: false });
  s.pushToast(`🧾 Checked in on ${r.number} to ${COUNTRIES[to].capital}. Security is behind the desks.`, 'travel');
  refreshLife().catch(() => {});
  return pass;
}

/** At the gate with a pass, through security: board, walk out to the plane and fly. */
export async function boardAtGate() {
  const s = useWorld.getState();
  const pass = s.airport.pass;
  if (!pass || s.flight || s.trip) return;
  const r = await post({ step: 'board', pass: pass.token });
  s.patchAirport({ pass: null, cleared: false, sheet: null });
  const a = ap(), t = terminalLayout(a), d = t.doors.boarding, door = (d[0] + d[1]) / 2, st = standOf(a);
  const out: Pt[] = [{ x: s.playerPos.x, z: s.playerPos.z }, { x: t.east - 1.5, z: door }, { x: t.east + 2, z: door }, { x: st.x - 6, z: st.z + 4 }];
  await fly(r, out);
}

/** From your own plane's stand: no desks, no fare. */
export async function flyMyPlane(to: CountryId) {
  const s = useWorld.getState();
  if (s.flight || s.trip) return;
  const r = await post({ step: 'jet', to });
  s.patchAirport({ sheet: null });
  const st = standOf(ap());
  await fly(r, [{ x: s.playerPos.x, z: s.playerPos.z }, { x: st.x - 4, z: st.z + 2 }]);
}

async function fly(r: Resp, toPlane: Pt[]) {
  const s = useWorld.getState();
  const cabin = cabinById(r.cabin)!;
  const dest = COUNTRIES[r.to];
  const a = ap();
  const mode = cabin.id === 'jet' ? 'jet' : 'airliner';
  const flight = { from: r.from, to: r.to, cabin: cabin.id, number: r.number };
  const plane = { mode, tint: dest.theme.primary, country: r.to } as const;
  s.patchMe({ location: r.to });
  s.selectVenue(null);
  s.setMapOpen(false);
  s.closePhone();
  // boarding: pass and ID card scanned, then out through the door to the plane
  s.setFlight({ ...flight, phase: 'boarding', at: performance.now() });
  await Promise.all([walk(toPlane, cabin.id === 'jet' ? 'your plane' : `${r.number} to ${dest.capital}`), wait(FLIGHT.boarding)]);

  await new Promise<void>((done) => {
    useWorld.getState().setFlight({ ...flight, phase: 'takeoff', at: performance.now() });
    useWorld.getState().setTrip({ ...plane, emoji: cabin.emoji, label: dest.capital, path: takeoffPath(a), startedAt: performance.now(), duration: FLIGHT.takeoff, itemId: null, fly: 'up', onDone: done });
  });

  // above the clouds: the destination's city takes over underneath
  useWorld.getState().setFlight({ ...flight, phase: 'cruise', at: performance.now() });
  useWorld.getState().setCountry(r.to);
  refreshLife().catch(() => {});
  await wait(FLIGHT.cruise);

  // the destination's map may be a different size: plan the landing on the airport that is there now
  const there = ap();
  await new Promise<void>((done) => {
    useWorld.getState().setFlight({ ...flight, phase: 'landing', at: performance.now() });
    useWorld.getState().setTrip({ ...plane, emoji: cabin.emoji, label: dest.capital, path: landingPath(there), startedAt: performance.now(), duration: FLIGHT.landing, itemId: null, fly: 'down', onDone: done });
  });
  await arrive(r.to, { from: r.from, number: r.number, cabin: cabin.id });
}

/**
 * Arrivals on their own: off a plane at the arrival stand, in through the arrivals door to passport control,
 * the ID card stamped and the welcome. A flight ends with this; a brand-new player's first landing in their
 * home country can call it with no flight before it.
 */
export async function arrive(to: CountryId, opts: { from?: CountryId; number?: string; cabin?: CabinId } = {}) {
  const dest = COUNTRIES[to];
  const flight = { from: opts.from ?? to, to, cabin: opts.cabin ?? 'economy', number: opts.number ?? '' };
  const a = ap(), t = terminalLayout(a), d = t.doors.arrivalsIn, door = (d[0] + d[1]) / 2, st = arrivalStandOf(a);
  useWorld.getState().setFlight({ ...flight, phase: 'arriving', at: performance.now() });
  await walk([{ x: st.x - 3, z: st.z - 2 }, { x: t.east + 4, z: door + 8 }, { x: t.east + 2, z: door }, { x: t.east - 1.5, z: door }, t.booth], 'Passport control');
  useWorld.getState().setFlight({ ...flight, phase: 'arrived', at: performance.now() });
  useWorld.getState().pushToast(`${dest.flag} Welcome to ${dest.capital}. The exit to the city is behind you.`, 'travel');
  await wait(FLIGHT.welcome);
  if (useWorld.getState().flight?.phase === 'arrived') useWorld.getState().setFlight(null);
}
