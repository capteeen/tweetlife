import type { CityGrid } from './geometry';

// Sidewalk walks round a block, for the ambient residents (components/world/Residents.tsx).

export type RectLoop = { cx: number; cz: number; hw: number; hd: number };

/** The building side of the sidewalk all the way round a block (street trees and lamps stand on the curb side). */
export const sidewalkLoop = (b: { x: number; z: number }, grid: CityGrid): RectLoop => ({
  cx: b.x, cz: b.z, hw: grid.blockW / 2 + grid.sidewalk * 0.35, hd: grid.blockD / 2 + grid.sidewalk * 0.35,
});

/** Point and heading at fraction t (0..1) round a rectangle's perimeter, clockwise from its north-west corner. */
export function aroundRect(l: RectLoop, t: number) {
  const w = 2 * l.hw, d = 2 * l.hd, per = 2 * (w + d);
  let s = (((t % 1) + 1) % 1) * per;
  if (s < w) return { x: l.cx - l.hw + s, z: l.cz - l.hd, heading: Math.PI / 2 };
  if ((s -= w) < d) return { x: l.cx + l.hw, z: l.cz - l.hd + s, heading: 0 };
  if ((s -= d) < w) return { x: l.cx + l.hw - s, z: l.cz + l.hd, heading: -Math.PI / 2 };
  s -= w;
  return { x: l.cx - l.hw, z: l.cz + l.hd - s, heading: Math.PI };
}
