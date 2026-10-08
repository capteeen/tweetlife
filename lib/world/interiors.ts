import { capitolSolids } from './capitol';

// Walk-in venues: open-roofed buildings you can walk into (the clubs, the lounge, the gym, the coin shop, the
// government house, and the workplaces: the clinic, the Hustle Hub job centre and the Devnet Labs tech office).
// Footprints are in the venue's own frame: x across the front, z towards the door (+z faces the city centre).

export type LocalRect = { x: number; z: number; w: number; d: number };

export type WalkIn = {
  w: number;
  d: number;
  h: number;
  door: number;
  /** solid things inside (bar counters, stages, partition walls), in the venue's frame, for collisions */
  solids?: LocalRect[];
  /** how many people it is built for, shown on the venue sheet */
  capacity?: number;
};

export const WALK_IN: Record<string, WalkIn> = {
  // Club Moon: the flagship. Stage and DJ booth at the back, a big LED floor, the bar down the left wall, VIP
  // booths behind a rail on the right, a lounge front left and the chill room with the toilets front right.
  club: {
    w: 30, d: 24, h: 6.5, door: 6, capacity: 120,
    solids: [
      { x: 0, z: -9.6, w: 12.4, d: 4.4 }, // stage
      { x: -12.1, z: -2.5, w: 1.1, d: 11 }, // bar counter
      { x: 8.6, z: -4.6, w: 0.25, d: 8.4 }, // VIP rail
      { x: 8.1, z: 5.8, w: 2.2, d: 0.3 }, // chill room partition, either side of its door
      { x: 12.6, z: 5.8, w: 4.0, d: 0.3 },
      { x: 7.1, z: 8.7, w: 0.3, d: 5.8 },
    ],
  },
  // Afro Yard: an open-air garden with a live band stage, string lights, palms and a long bar.
  yard: {
    w: 24, d: 18, h: 3.2, door: 6, capacity: 80,
    solids: [
      { x: 0, z: -7, w: 10.4, d: 3.4 }, // stage
      { x: 10.6, z: -1.5, w: 1.1, d: 8 }, // bar
    ],
  },
  // Warehouse 404: a techno warehouse. Shipping-container DJ booth, speaker walls, lasers and strobes.
  warehouse: {
    w: 24, d: 18, h: 7, door: 5, capacity: 100,
    solids: [
      { x: 0, z: -6.9, w: 7.2, d: 3.0 }, // container booth
      { x: -10.3, z: 1, w: 1.0, d: 7 }, // bar
    ],
  },
  // Velvet Room: a jazz bar. Live trio on a low stage, round tables with candles, a brass bar.
  jazz: {
    w: 18, d: 14, h: 4.6, door: 4.5, capacity: 50,
    solids: [
      { x: -2, z: -5.2, w: 8.4, d: 2.8 }, // stage
      { x: 7.3, z: -1.2, w: 1.0, d: 6.5 }, // bar
    ],
  },
  // Sunset Beach Club: on the shore. Sand floor, a pool, cabanas, a tiki bar and a DJ hut.
  beach: {
    w: 24, d: 18, h: 2.4, door: 8, capacity: 90,
    solids: [
      { x: 0, z: -7.2, w: 5, d: 2.6 }, // DJ hut
      { x: -9.8, z: -0.5, w: 1.1, d: 7 }, // tiki bar
      { x: 5.5, z: -1.2, w: 7, d: 4.6 }, // pool
    ],
  },
  bar: { w: 12, d: 10, h: 4, door: 4 },
  gym: { w: 14, d: 12, h: 4.2, door: 5 },
  exchange: { w: 12, d: 10, h: 4.2, door: 4.5 },
  clinic: { w: 13, d: 11, h: 4.2, door: 4.5 },
  hustle: { w: 13, d: 11, h: 4.2, door: 4.5 },
  tech: { w: 13, d: 11, h: 4.4, door: 4.5 },
  capitol: { w: 16, d: 13, h: 5.2, door: 5 },
};

/** The clubs, in the order the map and the nightlife list show them. */
export const CLUB_IDS = ['club', 'yard', 'warehouse', 'jazz', 'beach'] as const;
export type ClubId = (typeof CLUB_IDS)[number];
export const isClub = (id: string): id is ClubId => (CLUB_IDS as readonly string[]).includes(id);

export const WALL = 0.4;

/** Top of a walk-in venue's floor (lib/world/ground.ts stands everyone on it). */
export const FLOOR_Y = 0.22;

/**
 * A club's raised LED dance floor, in the club's frame: an n x m grid of tiles centred on (x, z), `top` is where
 * feet go. A round floor keeps only the tiles within n/2 tiles of the centre.
 */
export type DanceFloor = { n: number; m: number; tile: number; x: number; z: number; round?: boolean; tileH: number; top: number };
const TILE_H = 0.05;
const dance = (n: number, m: number, tile: number, x: number, z: number, round = false): DanceFloor => ({ n, m, tile, x, z, round, tileH: TILE_H, top: FLOOR_Y + TILE_H });

/** The dance floors the clubs draw (components/world/Clubs.tsx) and everyone stands on (lib/world/ground.ts). */
export const DANCE_FLOORS: Record<string, DanceFloor> = {
  club: dance(10, 10, 1.15, 0, -1.6),
  yard: dance(9, 9, 1.0, -1, 0, true),
  beach: dance(6, 5, 1.2, -3.6, -2.6),
};

/** Club Moon's dance floor (the one scripts/check-world.ts probes by name). */
export const DANCE_FLOOR = { ...DANCE_FLOORS.club, size: DANCE_FLOORS.club.n * DANCE_FLOORS.club.tile };

/** Is local (lx, lz) on a tile of this dance floor? */
export function onDanceFloor(f: DanceFloor, lx: number, lz: number) {
  const i = (lx - f.x) / f.tile, j = (lz - f.z) / f.tile;
  if (Math.abs(i) > f.n / 2 || Math.abs(j) > f.m / 2) return false;
  if (!f.round) return true;
  // the tile whose centre is nearest, kept when its centre is within n/2 of the middle (as LedFloor draws it)
  const ci = Math.min(f.n - 1, Math.floor(i + f.n / 2)) - (f.n - 1) / 2, cj = Math.min(f.m - 1, Math.floor(j + f.m / 2)) - (f.m - 1) / 2;
  return Math.hypot(ci, cj) <= f.n / 2;
}

/** Height of the floor inside a walk-in venue at local (lx, lz): the dance floor's top on its tiles, else FLOOR_Y. */
export function walkInFloorAt(id: string, lx: number, lz: number) {
  const f = DANCE_FLOORS[id];
  return f && onDanceFloor(f, lx, lz) ? f.top : FLOOR_Y;
}

/**
 * How far in front of the venue ring every walk-in's front wall sits (its door faces the ring road). Deeper venues
 * are pushed outwards so their door stays here and the ring road stays clear.
 */
export const FRONT_SETBACK = 6.5;
export const outwardShift = (k: WalkIn | undefined) => (k ? Math.max(0, k.d / 2 - FRONT_SETBACK) : 0);

/** Wall rects in the venue's frame: back, two sides, and the front either side of the door. */
export function wallsOf(k: WalkIn): LocalRect[] {
  const seg = (k.w - k.door) / 2;
  return [
    { x: 0, z: -k.d / 2 + WALL / 2, w: k.w, d: WALL },
    { x: -k.w / 2 + WALL / 2, z: 0, w: WALL, d: k.d },
    { x: k.w / 2 - WALL / 2, z: 0, w: WALL, d: k.d },
    { x: -k.w / 2 + seg / 2, z: k.d / 2 - WALL / 2, w: seg, d: WALL },
    { x: k.w / 2 - seg / 2, z: k.d / 2 - WALL / 2, w: seg, d: WALL },
  ];
}

/** Furniture inside a walk-in venue that you can't walk through, built elsewhere, in the venue's frame. */
const SOLIDS: Record<string, () => LocalRect[]> = { capitol: capitolSolids };

/** Local point to world, for a venue at (x, z) turned by rot. */
export const venueToWorld = (v: { x: number; z: number; rot: number }, lx: number, lz: number) => {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c };
};

/** The walls and solid furniture in world space, each with the venue's rotation (for collisions). */
export function worldWalls(v: { id: string; x: number; z: number; rot: number }) {
  const k = WALK_IN[v.id];
  if (!k) return [];
  return [...wallsOf(k), ...(k.solids ?? []), ...(SOLIDS[v.id]?.() ?? [])].map((r) => ({ ...venueToWorld(v, r.x, r.z), w: r.w, d: r.d, rot: v.rot }));
}
