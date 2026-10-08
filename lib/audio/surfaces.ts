import type { Block, CityGrid, TerrainClass } from '@/lib/world/geometry';
import { RING_ROAD_W, inRect, ringRoadRadius, type Airport } from '@/lib/world/layout';
import type { PlacedVenue } from '@/lib/life/venues';
import { WALK_IN } from '@/lib/world/interiors';
import type { Surface } from './sfx';

// What is underfoot at (x, z), for footsteps. Mirrors the ground layers City.tsx, CityExtras.tsx and Venues.tsx
// draw: asphalt roads, concrete sidewalks and plazas, grass/dirt/sand blocks by terrain class, the wooden bridge,
// the airport's concrete, and tiled floors inside walk-in venues.

const TERRAIN: Record<TerrainClass, Surface> = { lush: 'grass', dry: 'dirt', sand: 'sand' };

export type SurfaceMap = {
  blocks: Block[];
  grid: CityGrid;
  outside: TerrainClass;
  contentRadius: number;
  boundaryRadius: number;
  airport: Airport;
  venues: PlacedVenue[];
};

/** The walk-in venue (club, lounge, gym, coin shop) the point is inside, if any. */
export function insideVenue(venues: PlacedVenue[], x: number, z: number): PlacedVenue | null {
  for (const v of venues) {
    const k = v.walkIn ? WALK_IN[v.id] : null;
    if (!k) continue;
    const dx = x - v.x, dz = z - v.z;
    const c = Math.cos(v.rot), s = Math.sin(v.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < k.w / 2 && Math.abs(lz) < k.d / 2) return v;
  }
  return null;
}

/** Where (x, z) sits relative to a venue's door: local coordinates (z grows out of the door). */
export function venueLocal(v: PlacedVenue, x: number, z: number) {
  const dx = x - v.x, dz = z - v.z;
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

export function surfaceAt(m: SurfaceMap, x: number, z: number): Surface {
  const r = Math.hypot(x, z);
  if (inRect(m.airport.bridge, x, z)) return 'wood';
  if (inRect(m.airport.island, x, z)) {
    const a = m.airport;
    if (inRect(a.islandRoad, x, z) || inRect(a.runway, x, z) || inRect(a.taxiway, x, z) || inRect(a.carPark, x, z)) return 'asphalt';
    if (inRect(a.terminal, x, z, 3) || inRect(a.apron, x, z)) return 'concrete';
    return 'grass';
  }
  if (insideVenue(m.venues, x, z)) return 'tile';
  for (const v of m.venues) if (!v.custom && Math.hypot(x - v.x, z - v.z) < Math.max(v.w, v.d) / 2 + 4) return 'concrete';
  const rr = ringRoadRadius(m.contentRadius);
  if (Math.abs(r - rr) < RING_ROAD_W / 2) return 'asphalt';
  if (inRect(m.airport.road, x, z)) return 'asphalt';
  const { K, pitchX, pitchZ, blockW, blockD, road, sidewalk } = m.grid;
  const cityW = (2 * K + 1) * pitchX + road, cityD = (2 * K + 1) * pitchZ + road;
  if (!m.blocks.length || Math.abs(x) > cityW / 2 || Math.abs(z) > cityD / 2) return TERRAIN[m.outside];
  const i = Math.round(x / pitchX), j = Math.round(z / pitchZ);
  const b = m.blocks.find((bl) => bl.i === i && bl.j === j);
  if (!b) return 'asphalt';
  const dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
  if (dx > blockW / 2 + sidewalk || dz > blockD / 2 + sidewalk) return 'asphalt';
  if (dx > blockW / 2 || dz > blockD / 2) return 'concrete';
  for (const v of b.vacant) if (Math.abs(x - v.x) < v.w / 2 && Math.abs(z - v.z) < v.d / 2) return TERRAIN[v.cls];
  return TERRAIN[b.cls];
}
