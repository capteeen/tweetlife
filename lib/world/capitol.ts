import type { Rect } from './layout';

// The government house floor plan, in the venue's own frame (x across, door at +z). One source of truth for
// where things stand: components/world/Capitol.tsx draws them, lib/world/interiors.ts makes them solid, and
// components/world/residentPaths.ts seats the president and the cabinet on them.

/** The president's desk: an executive pedestal desk with a kneehole on the president's (-z) side. */
export const DESK = { x: 0, z: -4.2, w: 3.3, d: 1.2, h: 0.78 };
/** The president's chair behind it; `seat` is the top of the cushion. */
export const DESK_CHAIR = { x: 0, z: -5.25, seat: 0.55 };
export const PODIUM = { x: -4.6, z: -2.5, rot: 0.25, w: 1.0, d: 0.7, h: 1.12 };
export const FLAGS = [
  { x: -1.9, z: -5.7, dir: -1 as const },
  { x: 1.9, z: -5.7, dir: 1 as const },
];
/** Town-hall benches either side of the carpet, facing the desk. */
export const BENCHES = [0.9, 2.7].flatMap((z) => [-2.6, 2.6].map((x) => ({ x, z, w: 2.4, d: 0.6 })));
/** The cabinet table and its chairs; `side` is which side of the table a chair is on (-1 = towards the carpet). */
export const CABINET = { x: 4.6, z: -1.8, w: 1.9, d: 3.6, h: 0.76 };
export const CABINET_SEAT = 0.5;
export const CABINET_CHAIRS = [-2.7, -1.8, -0.9].flatMap((z) => [
  { x: 3.45, z, side: -1 as const },
  { x: 5.75, z, side: 1 as const },
]);

/** Furniture you can't walk through, as rects in the venue's frame. */
export function capitolSolids(): Rect[] {
  return [
    { x: DESK.x, z: DESK.z, w: DESK.w, d: DESK.d },
    { x: DESK_CHAIR.x, z: DESK_CHAIR.z, w: 0.8, d: 0.8 },
    // the podium is turned a little; its box is grown to cover the turn
    { x: PODIUM.x, z: PODIUM.z, w: PODIUM.w + 0.2, d: PODIUM.d + 0.25 },
    ...FLAGS.map((f) => ({ x: f.x, z: f.z, w: 0.3, d: 0.3 })),
    ...BENCHES.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
    // the table with its chairs round it
    { x: CABINET.x, z: CABINET.z, w: CABINET.w + 1.0, d: CABINET.d + 0.2 },
  ];
}
