import type { Look } from './look';
import type { PlacedVenue } from './venues';
import { airportLayout, inRect } from '@/lib/world/layout';
import type { SafeZone } from './crimeRules';

// The police: a station in the Civic Center (a venue in lib/life/venues.ts), a cell round its side, and the AI
// officers who work it. Shared by the server (safe zones) and the scene (the cell, the officers, the arrest).
//
// TODO(jobs): a "Police officer" job can plug in here later: players on shift would take the reports that the AI
// officers handle now (app/api/life/crime, op "report"), and get paid per arrest. Not built yet.

export type Officer = { id: string; name: string; look: Look };

const uniform = (l: Partial<Look> & Pick<Look, 'body' | 'skin' | 'hairStyle'>): Look => ({
  eyes: 'round',
  hair: '#1B1410',
  shirt: '#1F3A93',
  shirtAlt: '#C9D3E8',
  pattern: 'solid',
  sleeves: 'short',
  bottom: 'pants',
  pants: '#14213D',
  shoes: '#0B0E14',
  height: 1.04,
  build: 1.08,
  top: 'shirt',
  shoeStyle: 'boots',
  hat: 'cap',
  eyewear: 'none',
  extras: ['watch'],
  accent: '#14213D',
  ...l,
});

export const OFFICERS: Officer[] = [
  { id: 'reyes', name: 'Officer Reyes', look: uniform({ body: 'female', skin: '#B9835A', hairStyle: 'bun', hair: '#1B1410' }) },
  { id: 'miller', name: 'Sgt. Miller', look: uniform({ body: 'male', skin: '#E8B89A', hairStyle: 'buzz', hair: '#3F2A1C' }) },
];

/** Turn a point in a venue's own frame (door at +z) into world space. */
export function venueToWorld(v: { x: number; z: number; rot: number }, lx: number, lz: number) {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c };
}

/** The holding cell: on the station's plaza, to the right of the building as you face the door. */
export const CELL = { lx: 6.4, lz: 1.2, w: 2.8, d: 2.8 };
/** the cell's slab, a step up from the plaza (lib/world/ground.ts stands you on it) */
export const CELL_TOP = 0.24;

export function jailCell(station: PlacedVenue) {
  const c = venueToWorld(station, CELL.lx, CELL.lz);
  return { ...c, rot: station.rot, w: CELL.w, d: CELL.d };
}

/** Clamp a world point into the cell (so a jailed player can pace, but not leave). */
export function clampToCell(cell: ReturnType<typeof jailCell>, x: number, z: number) {
  const c = Math.cos(cell.rot), s = Math.sin(cell.rot);
  // world -> cell frame
  const dx = x - cell.x, dz = z - cell.z;
  let lx = dx * c - dz * s;
  let lz = dx * s + dz * c;
  const hx = cell.w / 2 - 0.45, hz = cell.d / 2 - 0.45;
  lx = Math.max(-hx, Math.min(hx, lx));
  lz = Math.max(-hz, Math.min(hz, lz));
  return { x: cell.x + lx * c + lz * s, z: cell.z - lx * s + lz * c };
}

/** Where the officers stand: either side of the station door. */
export const OFFICER_POSTS = [
  { lx: -3.0, lz: 6.6, rot: 0.25 },
  { lx: 3.6, lz: 5.4, rot: -0.6 },
];

/** Within this distance of the station's walls counts as "at the police station". */
const STATION_ZONE = 10;

/** Is this spot somewhere crime can't happen? */
export function safeZoneAt(x: number, z: number, venues: PlacedVenue[], contentRadius: number, boundaryRadius: number): SafeZone | null {
  const ap = airportLayout(contentRadius, boundaryRadius);
  if (inRect(ap.island, x, z, 2) || inRect(ap.bridge, x, z, 2)) return 'airport';
  const st = venues.find((v) => v.id === 'police');
  if (st) {
    const gap = Math.hypot(Math.max(0, Math.abs(x - st.x) - st.w / 2), Math.max(0, Math.abs(z - st.z) - st.d / 2));
    if (gap < STATION_ZONE) return 'police';
  }
  return null;
}
