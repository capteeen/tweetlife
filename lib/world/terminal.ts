import type { Airport, Pt, Rect } from './layout';

// Inside the airport terminal: a long glass hall you walk through, landside (west, the kerb) to airside
// (east, the apron). From south to north:
//   gate lounge  - seats, the gate desk and its board, the boarding door out to your plane
//   security     - a wall across the hall with one scanner arch in it
//   check-in     - the desks where you book a flight; the main door from the kerb
//   arrivals     - its own hall: in from the apron, passport control, out to the kerb
// Everything is in world units, derived from the terminal rect in airportLayout.

export type Terminal = {
  rect: Rect;
  /** x of the landside (west) and airside (east) walls */
  west: number;
  east: number;
  /** z of the security wall and of the wall between check-in and arrivals */
  securityZ: number;
  arrivalsZ: number;
  /** doors, as z ranges on the west / east walls */
  doors: { landside: [number, number]; arrivalsOut: [number, number]; boarding: [number, number]; arrivalsIn: [number, number] };
  /** the scanner arch's opening in the security wall, as an x range */
  arch: [number, number];
  /** where you stand to use each desk */
  kiosks: Pt[];
  gateDesk: Pt;
  booth: Pt;
  /** the floor spot just inside the main door */
  entrance: Pt;
};

const T = 0.4; // wall thickness
/** Top of the terminal's floor (lib/world/ground.ts stands travellers on it). */
export const TERMINAL_FLOOR = 0.08;

export function terminalLayout(ap: Airport): Terminal {
  const r = ap.terminal;
  const west = r.x - r.w / 2, east = r.x + r.w / 2;
  const n = r.z + r.d / 2, s = r.z - r.d / 2; // north (+z) and south (-z) ends
  const securityZ = r.z - 9, arrivalsZ = r.z + 12;
  return {
    rect: r,
    west,
    east,
    securityZ,
    arrivalsZ,
    doors: { landside: [r.z - 2.2, r.z + 2.2], arrivalsOut: [n - 9, n - 5], boarding: [s + 3, s + 7], arrivalsIn: [n - 9, n - 5] },
    arch: [r.x - 1.1, r.x + 1.1],
    kiosks: [-1, 3, 7].map((dz) => ({ x: east - 3.4, z: r.z + dz })),
    gateDesk: { x: east - 3.2, z: s + 9 },
    booth: { x: r.x - 0.5, z: n - 7 },
    entrance: { x: west + 2, z: r.z },
  };
}

const span = (a: number, b: number) => ({ from: Math.min(a, b), to: Math.max(a, b) });

/** A wall along z at `x` from z0 to z1, with gaps for doors. */
function zWall(x: number, z0: number, z1: number, gaps: [number, number][]): Rect[] {
  const out: Rect[] = [];
  let at = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > at) out.push({ x, z: (at + g0) / 2, w: T, d: g0 - at });
    at = Math.max(at, g1);
  }
  if (z1 > at) out.push({ x, z: (at + z1) / 2, w: T, d: z1 - at });
  return out;
}

/** A wall along x at `z` from x0 to x1, with gaps. */
function xWall(z: number, x0: number, x1: number, gaps: [number, number][]): Rect[] {
  return zWall(0, x0, x1, gaps).map((r) => ({ x: r.z, z, w: r.d, d: T }));
}

/** Every wall of the terminal, for collisions and for drawing. */
export function terminalWalls(t: Terminal): Rect[] {
  const { rect: r, west, east, doors } = t;
  const n = r.z + r.d / 2, s = r.z - r.d / 2;
  const sp = span(west, east);
  return [
    ...zWall(west, s, n, [doors.landside, doors.arrivalsOut]),
    ...zWall(east, s, n, [doors.boarding, doors.arrivalsIn]),
    ...xWall(n, sp.from, sp.to, []),
    ...xWall(s, sp.from, sp.to, []),
    ...xWall(t.securityZ, sp.from, sp.to, [t.arch]),
    ...xWall(t.arrivalsZ, sp.from, sp.to, []),
  ];
}

export type Zone = 'outside' | 'checkin' | 'gate' | 'arrivals';

/** Which part of the terminal a point is in. */
export function zoneOf(t: Terminal, x: number, z: number): Zone {
  const r = t.rect;
  if (x < t.west || x > t.east || z < r.z - r.d / 2 || z > r.z + r.d / 2) return 'outside';
  if (z > t.arrivalsZ) return 'arrivals';
  if (z < t.securityZ) return 'gate';
  return 'checkin';
}
