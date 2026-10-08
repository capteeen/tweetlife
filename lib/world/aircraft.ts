import { COUNTRY_IDS, type CountryId } from './countries';
import type { Airport, Pt, Rect } from './layout';

// Where planes sit at the airport, and how big they are. Pure numbers, shared by the scene (components/world/
// Airport.tsx, planeModels.ts), flights (components/life/flight.ts) and the world check (scripts/check-world.ts).

export type PlaneKind = 'airliner' | 'regional' | 'jet' | 'heli';

/** Nose-to-tail length and wingspan (rotor diameter for the helicopter). planeModels.ts builds to these. */
export const PLANE_SIZE: Record<PlaneKind, { length: number; span: number }> = {
  airliner: { length: 16.5, span: 14.8 },
  regional: { length: 12.5, span: 10.8 },
  jet: { length: 10.4, span: 9.8 },
  heli: { length: 7.6, span: 8.4 },
};

/** The stand on the apron, south of the gates: where the plane you board (or your own jet) waits. */
export const privateStand = (ap: Airport): Pt => ({ x: ap.apron.x + 2, z: -34 });
/** Where arriving planes stop, north of the gates. */
export const arrivalStand = (ap: Airport): Pt => ({ x: ap.apron.x + 2, z: 40 });

export type ParkedPlane = { kind: PlaneKind; country?: CountryId; tint?: string; x: number; z: number; yaw: number };

/**
 * The planes parked around the airport. At the gates they nose in towards the terminal, the home country's carrier
 * first; a business jet waits nose-out in the hangar and another on the apron at the tower end; the helicopter has
 * a pad at the north end. The flights stands stay clear.
 */
export function airportSpots(ap: Airport, home: CountryId): { gates: ParkedPlane[]; others: ParkedPlane[]; heliPad: Pt } {
  const wall = ap.terminal.x + ap.terminal.w / 2;
  const order = [home, ...COUNTRY_IDS.filter((c) => c !== home)];
  const gates = ap.gates.map((g, i): ParkedPlane => {
    const kind: PlaneKind = i < 2 ? 'airliner' : 'regional';
    return { kind, country: order[i % order.length], x: wall + 3 + PLANE_SIZE[kind].length / 2, z: g.z, yaw: -Math.PI / 2 };
  });
  const H = ap.hangar;
  return {
    gates,
    others: [
      { kind: 'jet', x: H.x - 0.3, z: H.z, yaw: Math.PI / 2 },
      { kind: 'jet', tint: '#B88A2E', x: ap.apron.x - ap.apron.w / 2 + 6, z: 57, yaw: -Math.PI / 2 },
    ],
    heliPad: { x: ap.apron.x + 3, z: -58 },
  };
}

/** A parked plane's footprint on the ground (length by span, turned by its yaw; yaws are multiples of 90 degrees). */
export function footprint(p: ParkedPlane): Rect {
  const { length, span } = PLANE_SIZE[p.kind];
  const along = Math.abs(Math.sin(p.yaw)) > 0.5; // nose along x
  return { x: p.x, z: p.z, w: along ? length : span, d: along ? span : length };
}
