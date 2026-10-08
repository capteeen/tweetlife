import type { Block, CityGrid, TerrainClass } from './geometry';
import { prng, hashString } from './seed';
import { RING_ROAD_W, slotAngle, ringRoadRadius, airportLayout } from './layout';
import { canPlace, type Site } from './placement';

// Pure generators for the trees and palms the scene draws (City.tsx, CityExtras.tsx), so the world check
// (scripts/check-world.ts) tests exactly what gets drawn. Every spot goes through canPlace().

export type TreeSpot = { x: number; z: number; s: number; dry: boolean };
export type PalmSpot = { x: number; z: number; s: number; lean: number; yaw: number };

/** Trunk clearance for each kind, in metres (the canopy may overhang a sidewalk, never a lane). */
export const TREE_R = { street: 0.35, lot: 0.6, countryside: 1.2, palm: 0.5 };

/**
 * Street trees on lush (and a few on dry) blocks, on the curb side of the sidewalk and away from crossings and
 * doors; small clusters on vacant lots; and the countryside scattered with trees by its own class.
 */
export function cityTrees(
  site: Site,
  { blocks, grid, outside, boundaryRadius, handle, wooded = 1 }: { blocks: Block[]; grid: CityGrid; outside: TerrainClass; boundaryRadius: number; handle: string; /** the country's countryside tree multiplier */ wooded?: number },
): TreeSpot[] {
  const { K, pitchX, pitchZ, blockW, blockD, sidewalk } = grid;
  const cityW = (2 * K + 1) * pitchX, cityD = (2 * K + 1) * pitchZ;
  const R = boundaryRadius;
  const rnd = prng(hashString(handle + '|trees'));
  const out: TreeSpot[] = [];
  for (const b of blocks) {
    const n = b.cls === 'lush' ? 10 : b.cls === 'dry' ? 3 : 0;
    for (let k = 0; k < n; k++) {
      // along the long sidewalks (north/south), in the curb half; draws stay the same whether or not the spot is kept
      const side = rnd() < 0.5 ? -1 : 1;
      const x = b.x - blockW / 2 + rnd() * blockW;
      const z = b.z + side * (blockD / 2 + sidewalk * 0.75);
      const s = 0.8 + rnd() * 0.5;
      if (canPlace(site, 'streetTree', x, z, TREE_R.street)) out.push({ x, z, s, dry: b.cls === 'dry' });
    }
    for (const v of b.vacant) {
      const m = v.cls === 'lush' ? 3 : v.cls === 'dry' ? 1 : 0;
      for (let k = 0; k < m; k++) {
        const x = v.x + (rnd() - 0.5) * (v.w - 2), z = v.z + (rnd() - 0.5) * (v.d - 2), s = 0.7 + rnd() * 0.6;
        if (canPlace(site, 'tree', x, z, TREE_R.lot)) out.push({ x, z, s, dry: v.cls === 'dry' });
      }
    }
  }
  const density = (outside === 'lush' ? 1 / 220 : outside === 'dry' ? 1 / 900 : wooded > 1 ? 1 / 600 : 0) * wooded;
  const area = Math.PI * R * R - cityW * cityD;
  const nOut = Math.min(900 * Math.max(1, wooded), Math.floor(Math.max(0, area) * density));
  for (let k = 0; k < nOut; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.9 + rnd() * 0.8;
    if (blocks.length > 0 && Math.abs(x) < cityW / 2 + 3 && Math.abs(z) < cityD / 2 + 3) continue;
    if (canPlace(site, 'tree', x, z, TREE_R.countryside)) out.push({ x, z, s, dry: outside === 'dry' });
  }
  return out;
}

/** Palms along the airport road, the island's kerb and between the districts. */
export function palmSpots(site: Site, { contentRadius, boundaryRadius, handle }: { contentRadius: number; boundaryRadius: number; handle: string }): PalmSpot[] {
  const ap = airportLayout(contentRadius, boundaryRadius);
  const rr = ringRoadRadius(contentRadius);
  const rnd = prng(hashString(handle + '|palms'));
  const out: PalmSpot[] = [];
  const add = (x: number, z: number, s: number, lean: number, yaw: number) => {
    if (canPlace(site, 'palm', x, z, TREE_R.palm)) out.push({ x, z, s, lean, yaw });
  };
  for (let x = ap.road.x - ap.road.w / 2 + 3; x < ap.road.x + ap.road.w / 2; x += 6) {
    add(x, ap.road.d / 2 + 2, 0.9 + rnd() * 0.3, rnd() * 0.2, rnd() * 6.28);
    add(x, -ap.road.d / 2 - 2, 0.9 + rnd() * 0.3, rnd() * 0.2, rnd() * 6.28);
  }
  for (let z = -ap.island.d / 2 + 6; z < ap.island.d / 2 - 4; z += 7) {
    if (Math.abs(z) < 6) continue;
    add(ap.island.x - ap.island.w / 2 + 1.2, z, 0.9 + rnd() * 0.4, rnd() * 0.25, rnd() * 6.28);
  }
  for (const s of [3, 7, 11, 15]) {
    const a = slotAngle(s) + 0.09;
    const r = rr + RING_ROAD_W / 2 + 3;
    for (let k = 0; k < 3; k++) add(Math.cos(a) * (r + k * 3), Math.sin(a) * (r + k * 3), 0.8 + rnd() * 0.4, rnd() * 0.25, rnd() * 6.28);
  }
  return out;
}
