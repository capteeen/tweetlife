import { LOT_W, LOTS_PER_SIDE, type Block, type CityGrid, type TerrainClass } from './geometry';
import { prng, hashString } from './seed';
import { RING_ROAD_W, slotAngle, ringRoadRadius, airportLayout } from './layout';
import { canPlace, zoneAt, CORNER_CLEAR, type Site } from './placement';
import { groundAt } from './ground';

// Pure generators for the trees, palms and street furniture the scene draws (City.tsx, CityExtras.tsx), so the
// world check (scripts/check-world.ts) tests exactly what gets drawn. Every spot goes through canPlace().

/** Tree models in components/world/treeModels.ts. */
export type TreeKind = 'oak' | 'street' | 'pine' | 'palm' | 'shrub';
/** `tone`: 0..1, picks the leaf tint; `y`: the ground under the trunk. */
export type TreeSpot = { x: number; z: number; y: number; s: number; yaw: number; species: TreeKind; dry: boolean; tone: number };
export type PalmSpot = { x: number; z: number; y: number; s: number; lean: number; yaw: number };
export type PropKind = 'bench' | 'bin' | 'hydrant' | 'planter' | 'pit';
export type PropSpot = { kind: PropKind; x: number; y: number; z: number; yaw: number };
/** A street light with its two name blades: `street` names the x-running road, `avenue` the z-running one. */
export type LightSpot = { x: number; y: number; z: number; yaw: number; street: number; avenue: number };

/** Trunk clearance for each kind, in metres (the canopy may overhang a sidewalk, never a lane). */
export const TREE_R = { street: 0.35, lot: 0.6, countryside: 1.2, palm: 0.5 };
/** Clearance for sidewalk furniture, and how far from the block edge the curb half of the sidewalk is. */
export const PROP_R: Record<PropKind, number> = { bench: 0.55, bin: 0.35, hydrant: 0.3, planter: 0.7, pit: 0.55 };
export const CURB_LINE = 1.5;

/**
 * Street trees in a regular row on the curb half of lush blocks' sidewalks (at lot boundaries, so doors stay
 * clear; a couple on dry blocks, none on sand); vacant lots become small parks of broadleaf trees and shrubs;
 * the countryside gets oaks, pines and shrubs by its own class and the country's woodedness.
 */
export function cityTrees(
  site: Site,
  { blocks, grid, outside, boundaryRadius, handle, wooded = 1 }: { blocks: Block[]; grid: CityGrid; outside: TerrainClass; boundaryRadius: number; handle: string; /** the country's countryside tree multiplier */ wooded?: number },
): TreeSpot[] {
  const { K, pitchX, pitchZ, blockW, blockD } = grid;
  const cityW = (2 * K + 1) * pitchX, cityD = (2 * K + 1) * pitchZ;
  const R = boundaryRadius;
  const rnd = prng(hashString(handle + '|trees'));
  const out: TreeSpot[] = [];
  // every candidate makes the same draws whether or not it is kept, so one rejected spot doesn't reshuffle the rest
  const add = (species: TreeKind, x: number, z: number, s: number, dry: boolean, r: number, kind: 'tree' | 'streetTree') => {
    const yaw = rnd() * Math.PI * 2, tone = rnd();
    if (canPlace(site, kind, x, z, r)) out.push({ x, z, y: groundAt(site, x, z), s, yaw, species, dry, tone });
  };
  const walkZ = blockD / 2 + CURB_LINE, walkX = blockW / 2 + CURB_LINE;
  for (const b of blocks) {
    if (b.cls === 'lush') {
      for (const side of [-1, 1])
        for (let k = 1; k < LOTS_PER_SIDE; k++) {
          const skip = rnd() < 0.12, broad = rnd() < 0.2, jitter = (rnd() - 0.5) * 0.4, s = rnd();
          if (skip) continue;
          add(broad ? 'oak' : 'street', b.x - blockW / 2 + k * LOT_W + jitter, b.z + side * walkZ, broad ? 0.62 + s * 0.1 : 0.85 + s * 0.25, false, TREE_R.street, 'streetTree');
        }
      for (const side of [-1, 1]) {
        const dz = (rnd() - 0.5) * 4, s = 0.8 + rnd() * 0.2;
        add('street', b.x + side * walkX, b.z + dz, s, false, TREE_R.street, 'streetTree');
      }
    } else if (b.cls === 'dry') {
      for (let k = 0; k < 2; k++) {
        const side = rnd() < 0.5 ? -1 : 1, lot = 1 + Math.floor(rnd() * (LOTS_PER_SIDE - 1)), s = 0.8 + rnd() * 0.2;
        add('street', b.x - blockW / 2 + lot * LOT_W, b.z + side * walkZ, s, true, TREE_R.street, 'streetTree');
      }
    }
    for (const v of b.vacant) {
      const spot = (pad: number) => ({ x: v.x + (rnd() - 0.5) * (v.w - pad), z: v.z + (rnd() - 0.5) * (v.d - pad) });
      if (v.cls === 'sand') {
        const p = spot(2), keep = rnd() < 0.5, s = 0.7 + rnd() * 0.3;
        if (keep) add('shrub', p.x, p.z, s, true, TREE_R.lot, 'tree');
        continue;
      }
      const dry = v.cls === 'dry';
      const big = dry ? 1 : 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < big; k++) {
        const p = spot(3), s = 0.65 + rnd() * 0.25;
        add('oak', p.x, p.z, s, dry, TREE_R.lot, 'tree');
      }
      const small = dry ? 1 : 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < small; k++) {
        const p = spot(1.5), s = 0.8 + rnd() * 0.5;
        add('shrub', p.x, p.z, s, dry, TREE_R.lot, 'tree');
      }
    }
  }
  const density = (outside === 'lush' ? 1 / 220 : outside === 'dry' ? 1 / 900 : wooded > 1 ? 1 / 600 : 0) * wooded;
  const area = Math.PI * R * R - cityW * cityD;
  const nOut = Math.min(900 * Math.max(1, wooded), Math.floor(Math.max(0, area) * density));
  const dry = outside === 'dry';
  for (let k = 0; k < nOut; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const pick = rnd(), s = 0.9 + rnd() * 0.8;
    if (blocks.length > 0 && Math.abs(x) < cityW / 2 + 3 && Math.abs(z) < cityD / 2 + 3) continue;
    const species: TreeKind = pick < (dry ? 0.35 : 0.5) ? 'oak' : pick < 0.78 ? 'pine' : 'shrub';
    add(species, x, z, species === 'shrub' ? s * 1.3 : species === 'pine' ? s * 1.05 : s * 0.85, dry, TREE_R.countryside, 'tree');
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
    if (canPlace(site, 'palm', x, z, TREE_R.palm)) out.push({ x, z, y: groundAt(site, x, z), s, lean, yaw });
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

/**
 * Sidewalk furniture round the post blocks: grates round the street trees, a bench and a bin or two per block face,
 * a hydrant near one corner, concrete planters (with a shrub each) where dry and sandy blocks have no street trees,
 * and a street light just past one corner of every junction, its arm over the lane, carrying both street names.
 */
export function streetFurniture(site: Site, { blocks, grid, trees, handle }: { blocks: Block[]; grid: CityGrid; trees: TreeSpot[]; handle: string }) {
  const { K, blockW, blockD, sidewalk } = grid;
  const rnd = prng(hashString(handle + '|props'));
  const props: PropSpot[] = [];
  const shrubs: TreeSpot[] = [];
  const lights: LightSpot[] = [];
  const sidewalkTrees = trees.filter((t) => t.species !== 'shrub' && zoneAt(site, t.x, t.z) === 'sidewalk');
  for (const t of sidewalkTrees) props.push({ kind: 'pit', x: t.x, y: t.y + 0.002, z: t.z, yaw: 0 });
  const taken: { x: number; z: number; r: number }[] = sidewalkTrees.map((t) => ({ x: t.x, z: t.z, r: 0.6 }));
  const put = (kind: PropKind, x: number, z: number, yaw: number) => {
    const r = PROP_R[kind];
    if (taken.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.3) || !canPlace(site, 'bench', x, z, r)) return false;
    taken.push({ x, z, r });
    props.push({ kind, x, y: groundAt(site, x, z), z, yaw });
    return true;
  };
  const inner = blockW / 2 - CORNER_CLEAR - 0.8; // furthest from the block's middle a thing may stand, clear of the crossings
  for (const b of blocks) {
    for (const side of [-1, 1]) {
      const curb = b.z + side * (blockD / 2 + CURB_LINE);
      const benchAt = b.x - blockW / 2 + (1 + Math.floor(rnd() * (LOTS_PER_SIDE - 1))) * LOT_W + (rnd() < 0.5 ? -2 : 2), bench = rnd() < 0.55;
      if (bench) put('bench', benchAt, curb, side > 0 ? 0 : Math.PI);
      const binSide = rnd() < 0.5 ? -1 : 1, bin = rnd() < 0.7, binYaw = rnd() * 6.28;
      if (bin) put('bin', b.x + binSide * inner, curb, binYaw);
      if (b.cls !== 'lush')
        for (let k = 1; k < LOTS_PER_SIDE; k++) {
          const x = b.x - blockW / 2 + k * LOT_W, keep = rnd() >= 0.4, s = 0.7 + rnd() * 0.15, yaw = rnd() * 6.28;
          if (keep && put('planter', x, curb, 0)) shrubs.push({ x, z: curb, y: groundAt(site, x, curb) + 0.52, s, yaw, species: 'shrub', dry: b.cls === 'dry', tone: 0 });
        }
    }
    const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1, yaw = rnd() * 6.28;
    put('hydrant', b.x + sx * (inner - 0.6), b.z + sz * (blockD / 2 + sidewalk - 0.35), yaw);
  }
  // street lights: on the sidewalk of a block at the junction, a little past its corner, facing the x-running road
  const have = new Map(blocks.map((b) => [`${b.i},${b.j}`, b]));
  const corners = [[0, 0, 1, 1], [-1, 0, -1, 1], [0, -1, 1, -1], [-1, -1, -1, -1]];
  for (let i = -K; i <= K + 1; i++)
    for (let j = -K; j <= K + 1; j++) {
      for (const [di, dj, sx, sz] of corners) {
        const b = have.get(`${i + di},${j + dj}`);
        if (!b) continue;
        const x = b.x - sx * inner, z = b.z - sz * (blockD / 2 + CURB_LINE);
        if (taken.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6) || !canPlace(site, 'lamp', x, z, 0.3)) continue;
        taken.push({ x, z, r: 0.3 });
        // the arm reaches over the road, away from the block
        lights.push({ x, y: groundAt(site, x, z), z, yaw: Math.atan2(sz, 0), street: j + K, avenue: i + K });
        break;
      }
    }
  return { props, shrubs, lights };
}
