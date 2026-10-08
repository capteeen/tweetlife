import type { Block, CityGrid, Placed } from './geometry';
import { RING_ROAD_W, billboardSpots, inRect, type BillboardSpot } from './layout';
import { WALK_IN } from './interiors';
import { taxiLinks, terrainOf, toVenueFrame, type Terrain } from './ground';

// Where things may stand. Anything scattered over the world (trees, palms, lamps, benches, signs, kiosks,
// billboards, parked cars, resident spots) asks canPlace() first, so nothing lands on a road, a crossing, a
// runway, in a doorway or inside a building. scripts/check-world.ts generates worlds and fails if anything
// that is placed breaks these rules.

export type PlaceKind = 'tree' | 'streetTree' | 'palm' | 'lamp' | 'bench' | 'sign' | 'kiosk' | 'billboard' | 'parkedCar' | 'resident';

/** What the ground is at a point. */
export type Zone =
  | 'water'
  | 'road' // the post grid's asphalt
  | 'sidewalk'
  | 'corner' // the sidewalk near a block corner, where the crossings land
  | 'block' // a block's built-on ground (lots with posts, back yards)
  | 'lot' // a vacant lot
  | 'ringRoad'
  | 'spur'
  | 'airportRoad'
  | 'bridge'
  | 'runway'
  | 'taxiway'
  | 'apron'
  | 'islandRoad'
  | 'carPark'
  | 'island'
  | 'venue' // inside a venue's footprint
  | 'door' // the approach to a venue's door
  | 'plaza'
  | 'district'
  | 'countryside';

/** How far from a block corner the sidewalk counts as part of the crossing. */
export const CORNER_CLEAR = 2.5;
/** Half-width of the strip kept clear in front of a post building's door. */
export const DOOR_CLEAR = 1.4;
const BILLBOARD_R = 3.4;

export type Site = Terrain & { structures: Placed[]; billboards: BillboardSpot[] };

/** Everything placement needs about a world. Memoize it per world; it is cheap to query. */
export function placementSite({ blocks, grid, boundaryRadius, structures = [] }: { blocks: Block[]; grid: CityGrid; boundaryRadius: number; structures?: Placed[] }): Site {
  const t = terrainOf(blocks, grid, boundaryRadius);
  return { ...t, structures, billboards: t.hasCity ? billboardSpots(t.contentRadius, boundaryRadius) : [] };
}

/** The zone at a single point. */
export function zoneAt(s: Site, x: number, z: number): Zone {
  for (const v of s.venues) {
    if (v.custom) continue;
    const { lx, lz } = toVenueFrame(v, x, z);
    const k = WALK_IN[v.id];
    if (Math.abs(lx) <= v.w / 2 && Math.abs(lz) <= v.d / 2) return 'venue';
    const doorHalf = (k?.door ?? 2.2) / 2 + 1;
    if (Math.abs(lx) <= doorHalf && lz > v.d / 2 && lz <= v.d / 2 + 5) return 'door';
    if (k ? Math.abs(lx) < (k.w + 3) / 2 && lz > -k.d / 2 - 1.5 && lz < k.d / 2 + 4.5 : Math.abs(lx) < (v.w + 6) / 2 && Math.abs(lz) < (v.d + 6) / 2) return 'plaza';
  }
  if (s.hasCity) {
    const ap = s.airport;
    if (inRect(ap.island, x, z)) {
      if (inRect(ap.runway, x, z)) return 'runway';
      if (inRect(ap.taxiway, x, z) || taxiLinks(ap).some((l) => inRect(l, x, z))) return 'taxiway';
      if (inRect(ap.apron, x, z)) return 'apron';
      if (inRect(ap.islandRoad, x, z)) return 'islandRoad';
      if (inRect(ap.carPark, x, z)) return 'carPark';
      return 'island';
    }
    if (inRect(ap.bridge, x, z)) return 'bridge';
    if (inRect(ap.road, x, z)) return 'airportRoad';
  }
  const r = Math.hypot(x, z);
  if (r > s.boundaryRadius - 1) return 'water';
  if (!s.hasCity) return 'countryside';
  const { K, pitchX, pitchZ, road, blockW, blockD, sidewalk } = s.grid;
  if (Math.abs(x) <= ((2 * K + 1) * pitchX + road) / 2 && Math.abs(z) <= ((2 * K + 1) * pitchZ + road) / 2) {
    const i = Math.round(x / pitchX), j = Math.round(z / pitchZ);
    const b = s.blocks.find((bl) => bl.i === i && bl.j === j);
    if (!b) return 'road';
    const dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
    if (dx > blockW / 2 + sidewalk || dz > blockD / 2 + sidewalk) return 'road';
    if (dx > blockW / 2 || dz > blockD / 2) return dx > blockW / 2 - CORNER_CLEAR && dz > blockD / 2 - CORNER_CLEAR ? 'corner' : 'sidewalk';
    for (const v of b.vacant) if (Math.abs(x - v.x) < v.w / 2 - 0.3 && Math.abs(z - v.z) < v.d / 2 - 0.3) return 'lot';
    return 'block';
  }
  if (Math.abs(r - s.ringRoad) <= RING_ROAD_W / 2 + 0.6) return 'ringRoad';
  for (const sp of s.spurs) if (inRect(sp, x, z)) return 'spur';
  return Math.hypot(x, z) > s.ringRoad + RING_ROAD_W / 2 + 0.6 ? 'district' : 'countryside';
}

const OPEN: Zone[] = ['lot', 'district', 'countryside', 'island'];
const ALLOWED: Record<PlaceKind, Zone[]> = {
  tree: OPEN,
  palm: OPEN,
  streetTree: ['sidewalk'],
  lamp: ['sidewalk', 'plaza', ...OPEN],
  bench: ['sidewalk', 'plaza', ...OPEN],
  sign: ['sidewalk', 'plaza', ...OPEN],
  kiosk: ['sidewalk', 'plaza', ...OPEN],
  billboard: ['district', 'countryside'],
  parkedCar: ['carPark', 'lot', 'district', 'countryside', 'island'],
  resident: ['sidewalk', 'corner', 'block', 'lot', 'plaza', 'venue', 'door', 'district', 'countryside', 'island', 'apron', 'carPark', 'bridge'],
};

/** Why (x, z) with this radius is no place for this kind of thing, or null when it is fine. */
export function placementConflict(s: Site, kind: PlaceKind, x: number, z: number, radius = 0.6): string | null {
  const allowed = ALLOWED[kind];
  // the centre and eight points round the edge must all be on allowed ground
  for (let k = -1; k < 8; k++) {
    const px = k < 0 ? x : x + Math.cos((k * Math.PI) / 4) * radius;
    const pz = k < 0 ? z : z + Math.sin((k * Math.PI) / 4) * radius;
    const zone = zoneAt(s, px, pz);
    if (!allowed.includes(zone)) return zone;
  }
  // and clear of what stands there already
  for (const st of s.structures) {
    if (st.segment > 0) continue;
    if (st.kind === 'lantern') {
      if (kind !== 'resident' && Math.hypot(x - st.x, z - st.z) < radius + 0.6) return 'lamp post';
      continue;
    }
    if (Math.abs(x - st.x) < st.width / 2 + radius && Math.abs(z - st.z) < st.depth / 2 + radius) return 'building';
    // the strip of sidewalk in front of a building's door stays clear (residents may walk through it)
    if (kind !== 'resident') {
      const face = st.rot === 0 ? 1 : -1;
      const front = (z - st.z) * face;
      if (Math.abs(x - st.x) < DOOR_CLEAR + radius && front > st.depth / 2 && front < st.depth / 2 + 1.2 + s.grid.sidewalk + radius) return 'building door';
    }
  }
  if (kind !== 'resident') {
    for (const b of s.billboards) {
      if (kind === 'billboard' && b.x === x && b.z === z) continue;
      if (Math.hypot(x - b.x, z - b.z) < BILLBOARD_R + radius) return 'billboard';
    }
  }
  const ap = s.airport;
  if (s.hasCity) {
    for (const r of [ap.terminal, ap.hangar]) if (inRect(r, x, z, radius)) return 'airport building';
    if (Math.hypot(x - ap.tower.x, z - ap.tower.z) < ap.tower.r + radius) return 'control tower';
  }
  return null;
}

/** May a thing of this kind and radius stand at (x, z)? */
export const canPlace = (s: Site, kind: PlaceKind, x: number, z: number, radius = 0.6) => placementConflict(s, kind, x, z, radius) === null;
