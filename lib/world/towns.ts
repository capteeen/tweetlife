import type { Block } from './geometry';
import type { CountryId } from './countries';
import { LAGOON, RING_ROAD_W, ringRoadRadius, slotAngle, type Pt } from './layout';

// Cities inside a country, besides its capital. Each one is an island across the lagoon, joined to the capital's
// ring road by its own road and bridge, with a central plaza and landmark, an avenue of towers and a headquarters
// you can use (its sheet is in lib/life/venues.ts TOWN_VENUES). They share the country's map and presence room,
// so you can walk, drive or ride there like anywhere else in the capital.
// Solana has two, off the Trenches Quarter: Pump.fun and StonkFun.
// Pure and deterministic from the map's radii, so the scene, the ground, the map and check:world agree.

export type TownId = 'pumpfun' | 'stonkfun';

export type Town = {
  id: TownId;
  /** "Pump.fun" */
  name: string;
  country: CountryId;
  /** where the town's road leaves the ring road: a half slot, between two venues (lib/world/layout.ts) */
  slot: number;
  /** under the name on the arch and the map */
  tagline: string;
  /** its headquarters (lib/life/venues.ts TOWN_VENUES) */
  venue: string;
  /** the look: round pill towers (Pump.fun) or glass skyscrapers (StonkFun) */
  style: 'pill' | 'glass';
  colors: { primary: string; secondary: string; accent: string; ground: string; ink: string };
};

export const TOWNS: Town[] = [
  {
    id: 'pumpfun',
    name: 'Pump.fun',
    country: 'solana',
    slot: 11.5,
    tagline: 'Launch it. Pump it. Graduate.',
    venue: 'pumphq',
    style: 'pill',
    colors: { primary: '#53D769', secondary: '#FFFFFF', accent: '#B6FFC7', ground: '#5FBF7A', ink: '#0E1A12' },
  },
  {
    id: 'stonkfun',
    name: 'StonkFun',
    country: 'solana',
    slot: 13.5,
    tagline: 'Coins backed by stonks.',
    venue: 'stonkhq',
    style: 'glass',
    colors: { primary: '#00C46A', secondary: '#0B1E3F', accent: '#7CFFB2', ground: '#4C7F8F', ink: '#081428' },
  },
];

export const townById = (id: string) => TOWNS.find((t) => t.id === id) ?? null;
/** The towns of a country, besides its capital (none for most). */
export const townsOf = (country: string | null | undefined) => TOWNS.filter((t) => t.country === country);

// ---- which map has towns
// Only a shared country map has its towns (not the single-handle view behind the title screen), so the client marks
// a country map's blocks when it loads one (components/world/countryClient.ts) and everything that reads the ground
// from those blocks (lib/world/ground.ts terrainOf) finds the towns there.
const attached = new WeakMap<Block[], TownId[]>();
export function attachTowns(blocks: Block[], ids: TownId[]) {
  attached.set(blocks, ids);
}
export const townIdsOf = (blocks: Block[]): TownId[] => attached.get(blocks) ?? [];

// ---- layout

/** A straight strip (road, bridge, avenue) centred on (x, z), `len` long along angle `a`, `w` wide. */
export type Strip = { x: number; z: number; len: number; w: number; a: number };
/** Is (x, z) on the strip, grown by `pad` on every side? */
export function onStrip(s: Strip, x: number, z: number, pad = 0) {
  const dx = x - s.x, dz = z - s.z;
  const c = Math.cos(s.a), n = Math.sin(s.a);
  return Math.abs(dx * c + dz * n) <= s.len / 2 + pad && Math.abs(-dx * n + dz * c) <= s.w / 2 + pad;
}

/** `rot` turns the building like a three.js rotation.y: its local +z (front) faces the plaza or the avenue. */
export type TownBuilding = { x: number; z: number; w: number; d: number; h: number; rot: number; tone: number };

export type TownLayout = {
  town: Town;
  /** the direction out from the capital's centre */
  a: number;
  center: Pt;
  /** island radius */
  r: number;
  /** from the ring road to the shore */
  road: Strip;
  bridge: Strip;
  /** across the island, from the bridge through the plaza to the headquarters */
  avenue: Strip;
  plaza: { x: number; z: number; r: number };
  /** paved apron in front of the headquarters */
  forecourt: Strip;
  buildings: TownBuilding[];
  hq: { x: number; z: number; w: number; d: number; h: number; rot: number };
  arch: { x: number; z: number; rot: number; span: number };
  /** where the road meets the ring road */
  gate: Pt;
  /** where a ride drops you: on the avenue, just short of the plaza */
  stop: Pt;
};

export const TOWN_R = 60;
const PLAZA_R = 16;
const AVENUE_W = 8;
export const TOWN_ROAD_W = 6;
const BRIDGE_W = 8;
const HQ = { u: 42, w: 18, d: 12 };

// Surfaces (lib/world/ground.ts reads these; components/world/Towns.tsx draws them at these heights).
export const TOWN_ROAD_TOP = 0.06;
export const TOWN_BRIDGE_TOP = 0.14;
export const TOWN_ISLAND_TOP = 0.05;
export const TOWN_PAVED_TOP = 0.11;

// Towers: three along each side of the avenue, then six round the plaza (angles from the headquarters' side).
const ROW_U = [-46, -34, -22];
const RING_DEG = [40, 75, 110];
const RING_AT = 33;

export function townLayout(town: Town, contentRadius: number, boundaryRadius: number): TownLayout {
  const a = slotAngle(town.slot);
  const ux = Math.cos(a), uz = Math.sin(a);
  const R = boundaryRadius;
  const dist = R + LAGOON + TOWN_R;
  const center = { x: ux * dist, z: uz * dist };
  // island frame: u runs outwards (away from the capital), v across
  const at = (u: number, v: number) => ({ x: center.x + u * ux - v * uz, z: center.z + u * uz + v * ux });
  const radial = (r0: number, r1: number, w: number): Strip => ({ x: (ux * (r0 + r1)) / 2, z: (uz * (r0 + r1)) / 2, len: r1 - r0, w, a });
  // facing the way (du, dv) in the island frame, as a rotation.y
  const facing = (du: number, dv: number) => Math.atan2(du * ux - dv * uz, du * uz + dv * ux);
  const rr = ringRoadRadius(contentRadius);

  const buildings: TownBuilding[] = [];
  let k = 0;
  for (const u of ROW_U) {
    for (const side of [-1, 1]) {
      const p = at(u, side * 12);
      buildings.push({ ...p, w: 9, d: 9, h: 0, rot: facing(0, -side), tone: k++ });
    }
  }
  for (const deg of RING_DEG) {
    for (const side of [-1, 1]) {
      const t = (deg * Math.PI) / 180;
      const u = Math.cos(t) * RING_AT, v = side * Math.sin(t) * RING_AT;
      buildings.push({ ...at(u, v), w: 10, d: 10, h: 0, rot: facing(-u, -v), tone: k++ });
    }
  }
  // heights: low by the bridge, climbing round to the headquarters (a bonding curve on Pump.fun, a skyline on StonkFun)
  buildings.forEach((b, i) => {
    const f = i / (buildings.length - 1);
    b.h = town.style === 'pill' ? 9 + 26 * f * f : 16 + 26 * f + (i % 2) * 5;
  });

  const avenueU0 = -TOWN_R + 0.5, avenueU1 = HQ.u - HQ.d / 2 - 6;
  const av = at((avenueU0 + avenueU1) / 2, 0);
  const fc = at(HQ.u - HQ.d / 2 - 3, 0);
  const hq = at(HQ.u, 0);
  const arch = at(-TOWN_R + 6, 0);
  return {
    town,
    a,
    center,
    r: TOWN_R,
    road: radial(rr + RING_ROAD_W / 2 - 0.5, R - 3, TOWN_ROAD_W),
    bridge: radial(R - 4, dist - TOWN_R + 3, BRIDGE_W),
    avenue: { ...av, len: avenueU1 - avenueU0, w: AVENUE_W, a },
    plaza: { ...center, r: PLAZA_R },
    forecourt: { ...fc, len: 6, w: HQ.w + 4, a },
    buildings,
    hq: { ...hq, w: HQ.w, d: HQ.d, h: town.style === 'pill' ? 12 : 16, rot: facing(-1, 0) },
    arch: { ...arch, rot: facing(-1, 0), span: AVENUE_W + 4 },
    gate: { x: ux * rr, z: uz * rr },
    stop: at(-PLAZA_R - 4, 0),
  };
}

const layoutCache = new Map<string, TownLayout[]>();
/** Layouts of these towns on a map of these radii (cached). */
export function townLayouts(ids: TownId[], contentRadius: number, boundaryRadius: number): TownLayout[] {
  if (!ids.length) return [];
  const key = `${ids.join(',')}|${contentRadius}|${boundaryRadius}`;
  let out = layoutCache.get(key);
  if (!out) {
    out = ids.map((id) => townLayout(townById(id)!, contentRadius, boundaryRadius));
    layoutCache.set(key, out);
  }
  return out;
}

const onIsland = (t: TownLayout, x: number, z: number, pad = 0) => Math.hypot(x - t.center.x, z - t.center.z) <= t.r + pad;

/** The town whose island (or bridge) you are on, or null. */
export function townAt(towns: TownLayout[], x: number, z: number): TownLayout | null {
  for (const t of towns) if (onIsland(t, x, z) || onStrip(t.bridge, x, z)) return t;
  return null;
}

/** Can someone on foot stand here: on a town's island or its bridge. (The road to the bridge is on the mainland.) */
export function onTownLand(towns: TownLayout[], x: number, z: number) {
  return towns.some((t) => onIsland(t, x, z, -1) || onStrip(t.bridge, x, z, -0.8));
}

/** Height of a town's surfaces at (x, z), or null away from the towns, their bridges and roads. */
export function townGroundAt(towns: TownLayout[], x: number, z: number): number | null {
  for (const t of towns) {
    if (onIsland(t, x, z)) {
      if (onStrip(t.avenue, x, z) || onStrip(t.forecourt, x, z) || Math.hypot(x - t.plaza.x, z - t.plaza.z) <= t.plaza.r) return TOWN_PAVED_TOP;
      return TOWN_ISLAND_TOP;
    }
    if (onStrip(t.bridge, x, z)) return TOWN_BRIDGE_TOP;
    if (onStrip(t.road, x, z)) return TOWN_ROAD_TOP;
  }
  return null;
}

/** What you bump into in a town: towers, the headquarters, the landmark's plinth and the arch's legs (rotated boxes). */
export function townSolids(towns: TownLayout[]): { x: number; z: number; w: number; d: number; rot?: number }[] {
  return towns.flatMap((t) => {
    const legs = [-1, 1].map((s) => ({ x: t.arch.x + Math.cos(t.arch.rot) * (s * t.arch.span) / 2, z: t.arch.z - Math.sin(t.arch.rot) * (s * t.arch.span) / 2, w: 1.2, d: 1.2, rot: t.arch.rot }));
    return [
      ...t.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot })),
      { x: t.hq.x, z: t.hq.z, w: t.hq.w, d: t.hq.d, rot: t.hq.rot },
      { x: t.plaza.x, z: t.plaza.z, w: 9, d: 9, rot: t.hq.rot },
      ...legs,
    ];
  });
}

/**
 * A road route that knows the towns: off an island along its avenue, over the bridge and up its road to the ring
 * road, then on by `base` (lib/world/layout.ts route); and the same in reverse into a town.
 */
export function townRoute(from: Pt, to: Pt, towns: TownLayout[], base: (a: Pt, b: Pt) => Pt[]): Pt[] {
  const tf = townAt(towns, from.x, from.z), tt = townAt(towns, to.x, to.z);
  if (!tf && !tt) return base(from, to);
  if (tf && tt === tf) return [from, tf.stop, to];
  const out = (t: TownLayout, p: Pt): Pt[] => [p, t.stop, { x: t.bridge.x, z: t.bridge.z }, t.gate];
  const a = tf ? out(tf, from) : [from];
  const b = tt ? out(tt, to).reverse() : [to];
  return [...a, ...base(a[a.length - 1], b[0]).slice(1, -1), ...b];
}
