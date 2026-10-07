// The city around the posts: districts on a ring outside the post blocks, a ring road that joins them,
// billboards, and an airport on its own island across the lagoon, reached by a bridge.
// Everything here is deterministic from the world's content and boundary radii, so the server, the
// 3D scene and the map all agree on where things are.

export type District = { id: string; name: string; color: string; /** ring slots, 0 = east */ slots: number[]; venues: string[] };

/** 16 slots around the ring. Slot 0 (east) is kept clear for the airport road. */
export const RING_SLOTS = 16;

export const DISTRICTS: District[] = [
  { id: 'waterfront', name: 'Waterfront', color: '#6FA8C7', slots: [1, 2], venues: ['marina', 'dealership'] },
  { id: 'wellness', name: 'Wellness Row', color: '#2D6A4F', slots: [4, 5, 6], venues: ['gym', 'barber', 'clinic'] },
  { id: 'strip', name: 'The Strip', color: '#FF5D8F', slots: [8, 9, 10], venues: ['club', 'bar', 'suya'] },
  { id: 'trenches', name: 'Trenches Quarter', color: '#06D6A0', slots: [12, 13, 14], venues: ['exchange', 'bank', 'hustle'] },
];
/** Slots between districts. New venues that no district names land here, in this order. */
export const SPARE_SLOTS = [3, 7, 11, 15];

export const districtOf = (venueId: string) => DISTRICTS.find((d) => d.venues.includes(venueId)) ?? null;
export const slotAngle = (slot: number) => (slot / RING_SLOTS) * Math.PI * 2;

/** Venue ring radius: just outside the posts, never so tight that neighbouring plazas touch. */
export const venueRingRadius = (contentRadius: number) => Math.max(contentRadius + 16, (RING_SLOTS * 17) / (Math.PI * 2));
export const RING_ROAD_W = 6;
export const ringRoadRadius = (contentRadius: number) => venueRingRadius(contentRadius) - 11;

export type Rect = { x: number; z: number; w: number; d: number };
export const inRect = (r: Rect, x: number, z: number, pad = 0) => Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;

/** Airport island, east of the city across the lagoon. All rects are axis-aligned (x east, z south). */
export type Airport = {
  island: Rect;
  bridge: Rect;
  road: Rect; // mainland road from the ring road to the bridge
  islandRoad: Rect;
  terminal: Rect;
  carPark: Rect;
  hangar: Rect;
  tower: { x: number; z: number; r: number; h: number };
  apron: Rect;
  taxiway: Rect;
  runway: Rect;
  gates: { x: number; z: number }[];
  /** where travellers are dropped: the kerb in front of the terminal */
  kerb: { x: number; z: number };
};

export const LAGOON = 28;

export function airportLayout(contentRadius: number, boundaryRadius: number): Airport {
  const R = boundaryRadius;
  const x0 = R + LAGOON; // island's inner (west) edge
  const W = 62, L = 150;
  const rr = ringRoadRadius(contentRadius);
  const roadStart = rr + RING_ROAD_W / 2 - 0.5;
  return {
    island: { x: x0 + W / 2, z: 0, w: W, d: L },
    bridge: { x: (R - 4 + x0 + 3) / 2, z: 0, w: x0 + 3 - (R - 4), d: 8 },
    road: { x: (roadStart + R - 3) / 2, z: 0, w: R - 3 - roadStart, d: RING_ROAD_W },
    islandRoad: { x: x0 + 5, z: 0, w: 6, d: L - 16 },
    terminal: { x: x0 + 15, z: 0, w: 10, d: 54 },
    carPark: { x: x0 + 15, z: 42, w: 10, d: 24 },
    hangar: { x: x0 + 15, z: -46, w: 11, d: 20 },
    tower: { x: x0 + 15, z: 63, r: 1.8, h: 20 },
    apron: { x: x0 + 31, z: 0, w: 20, d: 130 },
    taxiway: { x: x0 + 44, z: 0, w: 5, d: 136 },
    runway: { x: x0 + 53, z: 0, w: 10, d: 142 },
    gates: [-18, 0, 18].map((z) => ({ x: x0 + 32, z })),
    kerb: { x: x0 + 8.5, z: 0 },
  };
}

/** Solid buildings at the airport (for collisions). */
export const airportSolids = (a: Airport): Rect[] => [a.terminal, a.hangar, { x: a.tower.x, z: a.tower.z, w: a.tower.r * 2, d: a.tower.r * 2 }];

/** Can someone on foot (or in a car) stand here? The mainland disc, the bridge, or the island. */
export function onLand(x: number, z: number, contentRadius: number, boundaryRadius: number, a?: Airport) {
  if (Math.hypot(x, z) <= boundaryRadius - 1.5) return true;
  const ap = a ?? airportLayout(contentRadius, boundaryRadius);
  return inRect(ap.bridge, x, z, -0.8) || inRect(ap.island, x, z, -1);
}

/** Billboards: in the spare slots on the outside of the ring road, and on the airport road. */
export type BillboardSpot = { x: number; z: number; rot: number };
export function billboardSpots(contentRadius: number, boundaryRadius: number): BillboardSpot[] {
  const rr = ringRoadRadius(contentRadius);
  const r = rr + RING_ROAD_W / 2 + 4;
  const out: BillboardSpot[] = SPARE_SLOTS.map((s) => {
    const a = slotAngle(s);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, z, rot: Math.atan2(-x, -z) };
  });
  const a = airportLayout(contentRadius, boundaryRadius);
  // one on each side of the airport road, facing traffic
  out.push({ x: a.road.x, z: -a.road.d / 2 - 4, rot: Math.PI / 2 });
  out.push({ x: a.bridge.x + a.bridge.w / 2 + 14, z: 0, rot: -Math.PI / 2 });
  return out;
}

// ---- routes

export type Pt = { x: number; z: number };

export type CityBox = { halfW: number; halfD: number; pitchX: number; pitchZ: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
export const pathLength = (p: Pt[]) => p.reduce((s, q, i) => (i ? s + dist(p[i - 1], q) : 0), 0);

/** Point and heading at fraction t (0..1) of a polyline's length. */
export function along(p: Pt[], t: number): { x: number; z: number; heading: number } {
  const total = pathLength(p);
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < p.length; i++) {
    const seg = dist(p[i - 1], p[i]);
    if (left <= seg || i === p.length - 1) {
      const f = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, z: p[i - 1].z + (p[i].z - p[i - 1].z) * f, heading: Math.atan2(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z) };
    }
    left -= seg;
  }
  const last = p[p.length - 1];
  return { x: last.x, z: last.z, heading: 0 };
}

/**
 * A believable road route between two points: out of the post grid along its roads, round the ring road,
 * across the bridge if the airport is involved, and in again. Short hops go straight.
 */
export function route(from: Pt, to: Pt, contentRadius: number, boundaryRadius: number, box: CityBox | null): Pt[] {
  if (dist(from, to) < 22) return [from, to];
  const rr = ringRoadRadius(contentRadius);
  const ap = airportLayout(contentRadius, boundaryRadius);
  const offAirport = (p: Pt) => inRect(ap.island, p.x, p.z, 2) || inRect(ap.bridge, p.x, p.z, 2) || (p.x > 0 && inRect(ap.road, p.x, p.z, 4));

  // leg from a point to the ring road; returns the points after `p` and the ring angle it joins at
  const toRing = (p: Pt): { pts: Pt[]; angle: number } => {
    if (offAirport(p)) {
      const pts: Pt[] = [];
      if (inRect(ap.island, p.x, p.z, 2)) pts.push({ x: ap.islandRoad.x, z: p.z }, { x: ap.islandRoad.x, z: 0 });
      pts.push({ x: rr, z: 0 });
      return { pts, angle: 0 };
    }
    if (box && Math.abs(p.x) < box.halfW && Math.abs(p.z) < box.halfD) {
      // inside the grid: step onto the nearest east-west road, drive to the grid edge nearest the target side
      const zr = (Math.round(p.z / box.pitchZ + 0.5) - 0.5) * box.pitchZ;
      const zc = Math.max(-box.halfD, Math.min(box.halfD, zr));
      const xe = (to.x >= p.x ? 1 : -1) * box.halfW;
      const a = Math.atan2(zc, xe);
      return { pts: [{ x: p.x, z: zc }, { x: xe, z: zc }, { x: Math.cos(a) * rr, z: Math.sin(a) * rr }], angle: a };
    }
    const a = Math.atan2(p.z, p.x);
    return { pts: [{ x: Math.cos(a) * rr, z: Math.sin(a) * rr }], angle: a };
  };

  const out = toRing(from);
  const into = toRing(to);
  const a0 = out.angle;
  let d = into.angle - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const arc: Pt[] = [];
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.12));
  for (let i = 1; i < steps; i++) {
    const a = a0 + (d * i) / steps;
    arc.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr });
  }
  return [from, ...out.pts, ...arc, ...into.pts.slice().reverse(), to];
}
