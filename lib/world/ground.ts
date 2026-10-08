import { groundHeightAt, type Block, type CityGrid } from './geometry';
import { WALK_IN, walkInFloorAt } from './interiors';
import { DISTRICTS, RING_ROAD_W, RING_SLOTS, airportLayout, inRect, ringRoadRadius, slotAngle, type Airport, type Rect } from './layout';
import { placeVenues, type PlacedVenue } from '../life/venues';
import { TERMINAL_FLOOR } from './terminal';
import { CELL, CELL_TOP } from '../life/police';

// One answer to "how high is the ground here?" for everyone who stands on it: the player, visitors, residents,
// crowds and cars, indoors and out. It mirrors the surfaces the scene draws, so feet land on what you see:
// City.tsx (road grid, sidewalks, blocks, lots, countryside), CityExtras.tsx (ring road, spurs, district ground,
// airport road, bridge and island), Terminal.tsx (the terminal hall), Venues.tsx (plazas), Interiors.tsx and Clubs.tsx
// (venue floors, the clubs' dance floors, the beach club's boardwalk).
// If one of those surfaces moves, move its number here too; scripts/check-world.ts walks the world and fails on
// a mismatch it can see (walkers below a floor, things floating).

// Tops of the surfaces outside the post grid (the grid's own are in geometry.ts).
export const PLAZA_TOP = 0.2;
export const BOARDWALK_TOP = 0.18;
export const BOARDWALK_W = 3.4;
const DISTRICT_TOP = 0.0;
const COUNTRYSIDE_TOP = -0.05;
const WATER_TOP = 0;
const RING_ASPHALT_TOP = 0.05;
const RING_CURB_TOP = 0.03;
const SPUR_TOP = 0.05;
const AIRPORT_ROAD_TOP = 0.06;
const BRIDGE_TOP = 0.14;
const ISLAND_TOP = 0.05;
const ISLAND_PAVED_TOP = 0.11; // island road, apron, car park
const TAXIWAY_TOP = 0.12;
const RUNWAY_TOP = 0.14;
/** the hangar's concrete floor (Airport.tsx) */
export const HANGAR_FLOOR = 0.12;

/** Everything the ground depends on, derived once per world. */
export type Terrain = {
  blocks: Block[];
  grid: CityGrid;
  boundaryRadius: number;
  contentRadius: number;
  hasCity: boolean;
  venues: PlacedVenue[];
  airport: Airport;
  ringRoad: number;
  spurs: Rect[];
};

/** The content radius buildWorld derives from the grid; every caller already has the grid. */
export const contentRadiusOf = (grid: CityGrid) => Math.hypot((grid.K + 0.5) * grid.pitchX, (grid.K + 0.5) * grid.pitchZ);

/** Spur roads from the post grid's edges out to the ring road (drawn in CityExtras.tsx). */
export function spurRoads(grid: CityGrid, contentRadius: number): Rect[] {
  const { K, pitchX, pitchZ, road } = grid;
  const halfW = ((2 * K + 1) * pitchX + road) / 2, halfD = ((2 * K + 1) * pitchZ + road) / 2;
  const inner = ringRoadRadius(contentRadius) - RING_ROAD_W / 2 + 0.5;
  const xr = 0.5 * pitchX, zr = 0.5 * pitchZ;
  return [
    { x: xr, z: -(halfD + inner) / 2, w: road, d: inner - halfD },
    { x: -xr, z: (halfD + inner) / 2, w: road, d: inner - halfD },
    { x: -(halfW + inner) / 2, z: -zr, w: inner - halfW, d: road },
    { x: (halfW + inner) / 2, z: zr, w: inner - halfW, d: road },
  ].filter((r) => r.w > 0 && r.d > 0);
}

const cache = new WeakMap<Block[], Map<string, Terrain>>();

/** The terrain for a world; cached on the blocks array, so calling it every frame is cheap. */
export function terrainOf(blocks: Block[], grid: CityGrid, boundaryRadius: number): Terrain {
  const key = `${grid.K}|${grid.pitchX}|${grid.pitchZ}|${boundaryRadius}`;
  let byKey = cache.get(blocks);
  if (!byKey) cache.set(blocks, (byKey = new Map()));
  let t = byKey.get(key);
  if (!t) {
    const contentRadius = contentRadiusOf(grid);
    const hasCity = blocks.length > 0;
    t = {
      blocks,
      grid,
      boundaryRadius,
      contentRadius,
      hasCity,
      venues: placeVenues(contentRadius, boundaryRadius),
      airport: airportLayout(contentRadius, boundaryRadius),
      ringRoad: ringRoadRadius(contentRadius),
      spurs: hasCity ? spurRoads(grid, contentRadius) : [],
    };
    byKey.set(key, t);
  }
  return t;
}

/** (x, z) in a venue's own frame: x across the front, z towards the door. */
export function toVenueFrame(v: { x: number; z: number; rot: number }, x: number, z: number) {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  const dx = x - v.x, dz = z - v.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** Floor height inside a walk-in venue or on any venue's plaza, or null when (x, z) is not on one. */
export function venueFloorAt(venues: PlacedVenue[], x: number, z: number): number | null {
  for (const v of venues) {
    if (v.custom) continue;
    const { lx, lz } = toVenueFrame(v, x, z);
    const k = WALK_IN[v.id];
    if (k) {
      if (Math.abs(lx) < k.w / 2 && Math.abs(lz) < k.d / 2) return walkInFloorAt(v.id, lx, lz);
      if (Math.abs(lx) < (k.w + 3) / 2 && lz > -k.d / 2 - 1.5 && lz < k.d / 2 + 4.5) return PLAZA_TOP;
      // the path out to a club on the nightlife row (Interiors.tsx)
      if (v.approach && v.approach > 0.5 && Math.abs(lx) < BOARDWALK_W / 2 && lz >= k.d / 2 + 4.5 && lz < k.d / 2 + 4.6 + v.approach) return BOARDWALK_TOP;
    } else {
      // the police station's holding cell stands on its own slab beside the building
      if (v.id === 'police' && Math.abs(lx - CELL.lx) < CELL.w / 2 + 0.15 && Math.abs(lz - CELL.lz) < CELL.d / 2 + 0.15) return CELL_TOP;
      if (Math.abs(lx) < (v.w + 6) / 2 && Math.abs(lz) < (v.d + 6) / 2) return PLAZA_TOP;
    }
  }
  return null;
}

/** Is (x, z) on a district's tinted ground (the ring outside the ring road, inside a district's slots)? */
function onDistrictGround(t: Terrain, x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r < t.ringRoad + RING_ROAD_W / 2 + 0.6 || r > t.boundaryRadius - 0.6) return false;
  const half = Math.PI / RING_SLOTS;
  const a = Math.atan2(z, x);
  return DISTRICTS.some((d) => {
    const a0 = slotAngle(d.slots[0]) - half, a1 = slotAngle(d.slots[d.slots.length - 1]) + half;
    let da = a - a0;
    while (da < 0) da += Math.PI * 2;
    while (da >= Math.PI * 2) da -= Math.PI * 2;
    return da <= a1 - a0;
  });
}

/** The two links from the taxiway to the runway ends. */
export const taxiLinks = (ap: Airport): Rect[] =>
  [-1, 1].map((e) => ({ x: (ap.taxiway.x + ap.runway.x) / 2, z: e * (ap.runway.d / 2 - 8), w: ap.runway.x - ap.taxiway.x, d: 5 }));

/** Height of the airport's surfaces at (x, z), or null off the airport (bridge, island and the road to them). */
export function airportGroundAt(ap: Airport, x: number, z: number): number | null {
  if (inRect(ap.island, x, z)) {
    if (inRect(ap.terminal, x, z)) return TERMINAL_FLOOR;
    if (inRect(ap.hangar, x, z)) return HANGAR_FLOOR;
    if (inRect(ap.runway, x, z)) return RUNWAY_TOP;
    if (inRect(ap.taxiway, x, z) || taxiLinks(ap).some((l) => inRect(l, x, z))) return TAXIWAY_TOP;
    if (inRect(ap.apron, x, z) || inRect(ap.islandRoad, x, z) || inRect(ap.carPark, x, z)) return ISLAND_PAVED_TOP;
    return ISLAND_TOP;
  }
  if (inRect(ap.bridge, x, z)) return BRIDGE_TOP;
  if (inRect(ap.road, x, z)) return AIRPORT_ROAD_TOP;
  return null;
}

/** Height of the walkable surface at (x, z) anywhere in the world. */
export function groundAt(t: Terrain, x: number, z: number): number {
  const venue = venueFloorAt(t.venues, x, z);
  if (venue !== null) return venue;
  if (t.hasCity) {
    const ap = airportGroundAt(t.airport, x, z);
    if (ap !== null) return ap;
  }
  const r = Math.hypot(x, z);
  if (r > t.boundaryRadius) return WATER_TOP;
  if (t.hasCity) {
    const { K, pitchX, pitchZ, road } = t.grid;
    if (Math.abs(x) <= ((2 * K + 1) * pitchX + road) / 2 && Math.abs(z) <= ((2 * K + 1) * pitchZ + road) / 2) return groundHeightAt(t.blocks, t.grid, x, z);
    const off = Math.abs(r - t.ringRoad);
    if (off <= RING_ROAD_W / 2) return RING_ASPHALT_TOP;
    if (off <= RING_ROAD_W / 2 + 0.6) return RING_CURB_TOP;
    for (const s of t.spurs) if (inRect(s, x, z)) return SPUR_TOP;
    if (onDistrictGround(t, x, z)) return DISTRICT_TOP;
  }
  return COUNTRYSIDE_TOP;
}

/** Ground height for walkers, cars and boats: the one function everything that stands on the world uses. */
export function surfaceY(blocks: Block[], grid: CityGrid, x: number, z: number, boundaryRadius: number) {
  return groundAt(terrainOf(blocks, grid, boundaryRadius), x, z);
}
