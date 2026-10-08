// Walk-in venues: open-roofed buildings you can walk into (the club, the lounge, the gym, the coin shop).
// Footprints are in the venue's own frame: x across the front, z towards the door (+z faces the city centre).

export type WalkIn = { w: number; d: number; h: number; door: number };

export const WALK_IN: Record<string, WalkIn> = {
  club: { w: 15, d: 13, h: 4.6, door: 5 },
  bar: { w: 12, d: 10, h: 4, door: 4 },
  gym: { w: 14, d: 12, h: 4.2, door: 5 },
  exchange: { w: 12, d: 10, h: 4.2, door: 4.5 },
};

export const WALL = 0.4;

/** Top of a walk-in venue's floor (lib/world/ground.ts stands everyone on it). */
export const FLOOR_Y = 0.22;

/** Club Moon's raised dance floor, in the club's frame: an N x N grid of tiles, `top` is where feet go. */
export const DANCE_FLOOR = { n: 6, tile: 1.15, x: 0, z: 0.4, size: 6 * 1.15, tileH: 0.05, top: FLOOR_Y + 0.05 };

/** Wall rects in the venue's frame: back, two sides, and the front either side of the door. */
export function wallsOf(k: WalkIn): { x: number; z: number; w: number; d: number }[] {
  const seg = (k.w - k.door) / 2;
  return [
    { x: 0, z: -k.d / 2 + WALL / 2, w: k.w, d: WALL },
    { x: -k.w / 2 + WALL / 2, z: 0, w: WALL, d: k.d },
    { x: k.w / 2 - WALL / 2, z: 0, w: WALL, d: k.d },
    { x: -k.w / 2 + seg / 2, z: k.d / 2 - WALL / 2, w: seg, d: WALL },
    { x: k.w / 2 - seg / 2, z: k.d / 2 - WALL / 2, w: seg, d: WALL },
  ];
}

/** The same walls in world space, each with the venue's rotation (for collisions). */
export function worldWalls(v: { id: string; x: number; z: number; rot: number }) {
  const k = WALK_IN[v.id];
  if (!k) return [];
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return wallsOf(k).map((r) => ({ x: v.x + r.x * c + r.z * s, z: v.z - r.x * s + r.z * c, w: r.w, d: r.d, rot: v.rot }));
}
