import type { PlacedVenue } from '@/lib/life/venues';
import type { Resident, ResidentDoing, ResidentStop } from '@/lib/life/residents';
import { FLOOR_Y, WALK_IN } from '@/lib/world/interiors';
import { RING_ROAD_W, ringRoadRadius } from '@/lib/world/layout';
import { CABINET_CHAIRS, CABINET_SEAT, DESK_CHAIR, PODIUM } from '@/lib/world/capitol';
import type { FigureAct } from './figureMoves';
import type { HomePose } from './figurePoses';

// Where the named residents go and what they do there. Each resident loops through their route on the wall
// clock, so everyone in the world sees them in the same place: stay at a spot, walk out the door, along the ring
// road to the next venue, in through its door to the next spot. Spots are in the venue's own frame (door at +z).

const WALK_SPEED = 2.2;

type Spot = { x: number; z: number; rot: number; act: FigureAct | HomePose | null; seat?: number; walk?: boolean; via?: [number, number][] };
// `via`: waypoints between the door and the spot, in walking-in order, to step round furniture

const stand = (upper: HomePose['upper']): HomePose => ({ base: 'stand', upper, seat: 0 });
const chair = (upper: HomePose['upper'], seat: number): HomePose => ({ base: 'chair', upper, seat });

// lounge: bar stools (seat 0.87) along the bar facing the back wall; booths (seat 0.6) on either side
const STOOLS = [-2.4, -1.2, 0, 1.2, 2.4];
const BOOTHS: [number, number][] = [[1, 0.7], [-1, 0.7], [1, 2.1], [-1, 2.1]];

const SPOTS: Record<string, Partial<Record<ResidentDoing, Spot[]>>> = {
  club: {
    dance: [
      { x: -2.6, z: 2.4, rot: 0.6, act: 'dance' },
      { x: 2.4, z: -1.4, rot: -2.2, act: 'dance' },
      { x: 1.0, z: 2.8, rot: -0.4, act: 'dance' },
      { x: -0.9, z: 1.0, rot: 2.6, act: 'dance' },
      { x: 2.7, z: 2.0, rot: -1.0, act: 'dance' },
      { x: -2.7, z: -1.5, rot: 1.9, act: 'dance' },
    ],
    selfie: [
      { x: 5.2, z: 2.6, rot: -Math.PI / 2, act: 'selfie' },
      { x: 5.0, z: -1.2, rot: -Math.PI / 2, act: 'selfie' },
    ],
  },
  bar: {
    stool: STOOLS.map((x) => ({ x, z: -2.05, rot: Math.PI, act: chair('drink', 0.87), via: [[x, 0]] as [number, number][] })),
    booth: BOOTHS.map(([s, z]) => ({ x: s * 4.65, z, rot: -s * (Math.PI / 2), act: chair('idle', 0.6), via: [[s * 4.0, 3.2]] as [number, number][] })),
    dance: [
      { x: 1.0, z: 0.6, rot: 0.3, act: 'dance' },
      { x: -1.8, z: 3.0, rot: 2.8, act: 'dance' },
    ],
  },
  gym: {
    treadmill: [-4.2, -2.8].map((x) => ({ x, z: 2.3, rot: Math.PI, act: null, seat: 0.32, walk: true, via: [[x, 4.2]] as [number, number][] })),
    yoga: [
      { x: 1.0, z: 2.6, rot: Math.PI, act: 'stretch' },
      { x: 3.6, z: 2.6, rot: Math.PI, act: 'stretch' },
    ],
    pushups: [
      { x: -1.6, z: 0.6, rot: Math.PI / 2, act: 'pushups' },
      { x: 2.0, z: -0.9, rot: -Math.PI / 2, act: 'pushups' },
    ],
  },
  // government house (lib/world/capitol.ts): down the carpet, then round the benches, desk and cabinet table
  capitol: {
    desk: [{ x: DESK_CHAIR.x, z: DESK_CHAIR.z, rot: 0, act: chair('write', DESK_CHAIR.seat), via: [[0.8, 0.3], [2.2, -3.0], [2.2, -5.2], [0.9, -5.2]] }],
    podium: [{ x: PODIUM.x - 0.2, z: PODIUM.z - 0.8, rot: PODIUM.rot, act: stand('cheer'), via: [[-0.8, 0.3], [-1.3, -1.7], [-3.6, -3.4]] }],
    // the four seats ministers use, in cast order: near side first, then the far side round the end of the table
    cabinet: [CABINET_CHAIRS[0], CABINET_CHAIRS[3], CABINET_CHAIRS[4], CABINET_CHAIRS[1]].map((c, i) => ({
      x: c.x,
      z: c.z,
      rot: -c.side * (Math.PI / 2),
      act: chair((['read', 'write', 'idle', 'phone'] as const)[i], CABINET_SEAT),
      via: (c.side < 0 ? [[0.8, 0.3], [2.9, 0.3], [2.9, c.z]] : [[0.8, 0.3], [6.6, 0.3], [6.6, c.z]]) as [number, number][],
    })),
  },
  exchange: {
    counter: [-1.6, 0.4, 2.2].map((x) => ({ x, z: -1.2, rot: Math.PI, act: stand('phone') })),
    selfie: [
      { x: 2.8, z: 1.4, rot: 0.4, act: 'selfie' },
      { x: -4.0, z: 2.6, rot: -0.5, act: 'selfie' },
    ],
  },
};

// outside a regular venue: on the plaza in front of the door
const OUTSIDE: Spot[] = [
  { x: -1.3, z: 8.0, rot: 0.9, act: stand('idle') },
  { x: 1.4, z: 8.2, rot: -0.9, act: stand('cool') },
  { x: -4.6, z: 8.4, rot: 0.3, act: stand('phone') },
  { x: 4.6, z: 8.4, rot: -0.3, act: stand('drink') },
];
const SUYA: Spot[] = [
  { x: -2.6, z: 8.2, rot: Math.PI, act: stand('eat') },
  { x: 1.2, z: 9.6, rot: Math.PI, act: stand('eat') },
  { x: 4.6, z: 9.6, rot: Math.PI, act: stand('eat') },
  { x: -0.6, z: 8.8, rot: -2.4, act: stand('idle') },
  { x: 2.9, z: 10.2, rot: -2.8, act: stand('cool') },
  { x: -4.4, z: 9.4, rot: 2.6, act: stand('phone') },
];

const spotsFor = (v: PlacedVenue, s: ResidentStop) => SPOTS[v.id]?.[s.doing] ?? (v.id === 'suya' ? SUYA : OUTSIDE);

type P = { x: number; z: number };
export type Leg =
  | { kind: 'stay'; dur: number; x: number; z: number; y: number | null; rot: number; act: FigureAct | HomePose | null; walk: boolean; stop: ResidentStop; venue: PlacedVenue }
  | { kind: 'walk'; dur: number; pts: P[]; cum: number[] };
export type Route = { legs: Leg[]; total: number; offset: number };

const toWorld = (v: PlacedVenue, x: number, z: number): P => {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.x + x * c + z * s, z: v.z - x * s + z * c };
};

/** Points from inside a venue out to the ring road (reverse it for the way in). */
function wayOut(v: PlacedVenue, sp: Spot): P[] {
  const k = WALK_IN[v.id];
  const pts: P[] = [];
  if (sp.via) for (const p of [...sp.via].reverse()) pts.push(toWorld(v, ...p));
  if (k) {
    pts.push(toWorld(v, 0, k.d / 2 - 1.2), toWorld(v, 0, k.d / 2 + 2.2));
  } else pts.push(toWorld(v, sp.x * 0.5, 10.5));
  return pts;
}

/** Along the ring road from angle a to angle b, the short way round. */
function arc(r: number, a: number, b: number): P[] {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const n = Math.max(1, Math.ceil(Math.abs(d * r) / 4));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a + (d * i) / n;
    return { x: Math.cos(t) * r, z: Math.sin(t) * r };
  });
}

function walkLeg(pts: P[]): Leg {
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.01);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].z - clean[i - 1].z));
  return { kind: 'walk', dur: Math.max(0.5, cum[cum.length - 1] / WALK_SPEED), pts: clean, cum };
}

/** Every resident's route. Each (venue, activity) hands out its spots in cast order, so no two residents share one. */
export function buildRoutes(cast: Resident[], venues: PlacedVenue[], contentRadius: number): (Route | null)[] {
  const taken = new Map<string, number>();
  return cast.map((r, i) =>
    buildRoute(r, i, venues, contentRadius, (v, s) => {
      const key = `${v.id}/${s.doing}`;
      const n = taken.get(key) ?? 0;
      taken.set(key, n + 1);
      const list = spotsFor(v, s);
      return list[n % list.length];
    }),
  );
}

function buildRoute(r: Resident, index: number, venues: PlacedVenue[], contentRadius: number, pick: (v: PlacedVenue, s: ResidentStop) => Spot): Route | null {
  // the sidewalk just outside the ring road's curb
  const ring = ringRoadRadius(contentRadius) + RING_ROAD_W / 2 + 1.2;
  const stops = r.route
    .map((s) => ({ s, v: venues.find((v) => v.id === s.venue) }))
    .filter((x): x is { s: ResidentStop; v: PlacedVenue } => !!x.v);
  if (stops.length === 0) return null;
  const spots = stops.map(({ s, v }) => pick(v, s));
  const legs: Leg[] = [];
  stops.forEach(({ s, v }, i) => {
    const sp = spots[i];
    const at = toWorld(v, sp.x, sp.z);
    const inside = !!WALK_IN[v.id];
    legs.push({ kind: 'stay', dur: s.seconds, x: at.x, z: at.z, y: inside && sp.walk ? FLOOR_Y + (sp.seat ?? 0) : null, rot: v.rot + sp.rot, act: sp.act, walk: !!sp.walk, stop: s, venue: v });
    const j = (i + 1) % stops.length;
    const nv = stops[j].v, nsp = spots[j];
    const to = toWorld(nv, nsp.x, nsp.z);
    if (nv.id === v.id) {
      const pts: P[] = [at];
      if (sp.via) for (const p of [...sp.via].reverse()) pts.push(toWorld(v, ...p));
      if (nsp.via) for (const p of nsp.via) pts.push(toWorld(nv, ...p));
      pts.push(to);
      legs.push(walkLeg(pts));
      return;
    }
    const out = wayOut(v, sp);
    const back = wayOut(nv, nsp).reverse();
    const a = Math.atan2(out[out.length - 1].z, out[out.length - 1].x);
    const b = Math.atan2(back[0].z, back[0].x);
    legs.push(walkLeg([at, ...out, ...arc(ring, a, b), ...back, to]));
  });
  const total = legs.reduce((t, l) => t + l.dur, 0);
  return { legs, total, offset: index * 41.7 };
}

export type ResidentPose = {
  x: number;
  z: number;
  /** a fixed height (on a treadmill belt) or null to stand on the ground under x, z (lib/world/ground.ts) */
  y: number | null;
  rot: number;
  moving: boolean;
  act: FigureAct | HomePose | null;
  stop: ResidentStop | null;
  venue: PlacedVenue | null;
};

/** Where a resident is at wall-clock time `nowSec`. */
export function poseAt(route: Route, nowSec: number): ResidentPose {
  let t = (((nowSec + route.offset) % route.total) + route.total) % route.total;
  for (const l of route.legs) {
    if (t > l.dur) {
      t -= l.dur;
      continue;
    }
    if (l.kind === 'stay') return { x: l.x, z: l.z, y: l.y, rot: l.rot, moving: l.walk, act: l.act, stop: l.stop, venue: l.venue };
    const d = (t / l.dur) * l.cum[l.cum.length - 1];
    let i = 1;
    while (i < l.cum.length - 1 && l.cum[i] < d) i++;
    const a = l.pts[i - 1], b = l.pts[i] ?? a;
    const seg = l.cum[i] - l.cum[i - 1] || 1;
    const k = Math.min(1, Math.max(0, (d - l.cum[i - 1]) / seg));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: null, rot: Math.atan2(b.x - a.x, b.z - a.z), moving: true, act: null, stop: null, venue: null };
  }
  const l = route.legs[0];
  return l.kind === 'stay'
    ? { x: l.x, z: l.z, y: l.y, rot: l.rot, moving: l.walk, act: l.act, stop: l.stop, venue: l.venue }
    : { x: l.pts[0].x, z: l.pts[0].z, y: null, rot: 0, moving: true, act: null, stop: null, venue: null };
}
