// The welcome island's floor plan, as plain data so it can be checked without a browser
// (scripts/check-welcome-scene.ts). People and cars share one scale, so cars fit their lanes and
// people fit the pavement. Angles go round from +z towards +x: a point at angle a, radius r is
// (sin a * r, cos a * r).

/** people and cars are drawn at this scale (game units → island units) */
export const K = 0.75;

export const ISLAND_R = 17.6;
export const GRASS_R = 17.0;
export const PLAZA_R = 7.8; // inner pavement starts here
export const ROAD_IN = 9.2;
export const ROAD_OUT = 13.5;
export const OUTER_WALK_OUT = 14.7;

/**
 * Lanes. Traffic keeps right: going round with increasing angle, the right-hand side is outward. The outer lane
 * is wide because the bus runs there: a straight 6.75-long bus on a bend swings its corners out.
 */
export const CAR_LANES = [
  { r: 10.1, dir: -1 as const },
  { r: 12.05, dir: 1 as const },
];
/** the lanes' centre line */
export const LANE_SPLIT = 11.07;
export const WALK_LANES = [
  { r: 8.3, dir: -1 as const },
  { r: 8.75, dir: 1 as const },
];

export type Building = { x: number; z: number; w: number; d: number; h: number; antenna?: boolean };
export const BUILDINGS: Building[] = [
  { x: 0, z: 0, w: 3.4, d: 3.4, h: 9.5, antenna: true },
  { x: -4.2, z: -1.2, w: 2.6, d: 2.4, h: 5.6 },
  { x: 4.0, z: -1.6, w: 2.8, d: 2.4, h: 6.6, antenna: true },
  { x: -1.5, z: 4.3, w: 2.6, d: 2.2, h: 4.2 },
  { x: 2.8, z: 3.7, w: 2.4, d: 2.4, h: 5.0 },
  { x: -5.0, z: 3.2, w: 2.0, d: 2.0, h: 3.2 },
  { x: 5.6, z: 2.2, w: 2.0, d: 2.2, h: 3.8 },
  { x: -2.4, z: -5.0, w: 2.4, d: 2.0, h: 4.8, antenna: true },
  { x: 2.4, z: -5.4, w: 2.2, d: 2.0, h: 3.4 },
];
/** each building faces out from the middle, so its door is seen as the camera circles */
export const facing = (b: { x: number; z: number }) => Math.atan2(b.x, b.z || 0.001);

const rad = (deg: number) => (deg * Math.PI) / 180;
export const polar = (a: number, r: number) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });

/** Zebra crossings, where people cross between the plaza and the outer pavement. */
export const CROSSINGS = [rad(10), rad(180)];
export const CROSSING_HALF = 0.75; // half the crossing's width, along the road
/** where people wait: on the outer pavement, and in the plaza */
export const WAIT_OUT_R = 14.05;
export const WAIT_IN_R = 6.9;

export const FOUNTAIN = { ...polar(rad(280), 6.5), r: 0.85 };
export const BUS_STOP = rad(100);

export const INNER_TREES: [number, number][] = [
  [-5.47, -4.03], [6.31, -2.0], [0.46, -3.91], [-2.4, 6.31], [0.04, 6.62], [6.19, 0.17],
  [-3.34, 1.84], [4.82, -4.77], [2.24, 6.39], [3.51, 1.11], [-4.12, 5.47], [-6.5, -1.2],
];

/** Signed distance from a point to a building's footprint (negative inside). */
export function distToBuilding(px: number, pz: number, b: Building) {
  const rot = facing(b);
  const dx = px - b.x, dz = pz - b.z;
  // into the building's own frame (inverse of a rotation about y by `rot`)
  const lx = dx * Math.cos(rot) - dz * Math.sin(rot);
  const lz = dx * Math.sin(rot) + dz * Math.cos(rot);
  const ox = Math.max(Math.abs(lx) - b.w / 2, 0), oz = Math.max(Math.abs(lz) - b.d / 2, 0);
  if (ox || oz) return Math.hypot(ox, oz);
  return -Math.min(b.w / 2 - Math.abs(lx), b.d / 2 - Math.abs(lz));
}
export const clearOfBuildings = (x: number, z: number) => Math.min(...BUILDINGS.map((b) => distToBuilding(x, z, b)));

/** angles of things along a ring, skipping spots taken by crossings or the bus stop */
function ring(count: number, r: number, skip: { at: number; arc: number }[], offset = 0) {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    if (skip.some((s) => Math.abs(angleDiff(a, s.at)) * r < s.arc)) continue;
    out.push(a);
  }
  return out;
}
export const angleDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const crossingSkip = (arc: number) => CROSSINGS.map((at) => ({ at, arc }));
export const LAMPS_IN = ring(14, 7.95, crossingSkip(1.1), 0.12).map((a) => ({ a, r: 7.95 }));
export const LAMPS_OUT = ring(14, 14.4, [...crossingSkip(1.3), { at: BUS_STOP, arc: 2.4 }], 0.2).map((a) => ({ a, r: 14.4 }));
export const BENCHES = ring(14, 14.25, [...crossingSkip(1.6), { at: BUS_STOP, arc: 2.8 }], 0.42).filter((_, i) => i % 2 === 0).map((a) => ({ a, r: 14.25 }));
/** the outer ring of trees, on the grass beyond the pavement, leaving the bubble's tail clear */
export const TAIL_AT = rad(133);

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const OUTER_TREES = Array.from({ length: 34 }, (_, i) => {
  const a = (i / 34) * Math.PI * 2 + (hash(i) - 0.5) * 0.1;
  const r = 15.5 + hash(i + 50) * 0.8;
  return { ...polar(a, r), s: 0.8 + hash(i + 100) * 0.4, tint: hash(i + 150) };
});

/** The bus shelter on the outer pavement, and the people standing about (they face `rot`). */
export const SHELTER = { ...polar(BUS_STOP - 0.08, 14.4), rot: BUS_STOP - 0.08 + Math.PI, w: 2.2, d: 0.6 };
const toFountain = { x: -FOUNTAIN.x / Math.hypot(FOUNTAIN.x, FOUNTAIN.z), z: -FOUNTAIN.z / Math.hypot(FOUNTAIN.x, FOUNTAIN.z) };
export const IDLERS: { seed: string; x: number; z: number; rot: number; act: 'selfie' | 'cheer' | null }[] = [
  // waiting for the bus in front of the shelter, looking down the road it comes from
  { seed: 'busstop_bisi', ...polar(BUS_STOP - 0.02, 13.85), rot: BUS_STOP + Math.PI + 0.6, act: null },
  // a selfie with the fountain behind, and a friend cheering it on
  { seed: 'selfie_sade', x: FOUNTAIN.x + toFountain.x * 1.3, z: FOUNTAIN.z + toFountain.z * 1.3, rot: Math.atan2(toFountain.x, toFountain.z), act: 'selfie' },
  { seed: 'hype_femi', x: FOUNTAIN.x + toFountain.z * 1.3, z: FOUNTAIN.z - toFountain.x * 1.3, rot: Math.atan2(-toFountain.z, toFountain.x), act: 'cheer' },
];
