import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAMP, type LampKind } from './vehicleLights';

// Procedural low-poly cars, shared by ambient traffic (instanced) and vehicles people ride.
// Each model is a side profile extruded across the width (wheel arches cut out), a glass greenhouse, a roof,
// bumpers, grille, plates, mirrors, mud flaps and lamps. Parts are merged per material so a model costs one draw
// call per material, and every geometry is built once and cached. Wheels are a separate geometry so they can spin.
// Models face +z, wheels on the ground at y = 0. The driver sits on the left, which is +x (the car's right is -x).
//
// Traffic uses the solid body. Rides use `hollow`: the cabin is cut out between the windscreen and the rear window
// so there is a floor, seats, a dashboard and a steering wheel, and people sit inside instead of on the roof.

export type CarModel =
  | 'sedan' | 'hatch' | 'suv' | 'pickup' | 'danfo' | 'sport' | 'keke' | 'taxi' | 'van' | 'bus'
  | 'coupe' | 'wagon' | 'minivan' | 'boxtruck';
/** paint takes the car colour; trim carries its own colours per vertex (rubber, chrome, plates, seats); lamp glows */
export type CarPart = 'paint' | 'glass' | 'trim' | 'lamp';
export const CAR_PARTS: CarPart[] = ['paint', 'glass', 'trim', 'lamp'];

type Spec = {
  L: number;
  W: number;
  /** body underside */
  y0: number;
  wheelR: number;
  /** axle positions along z, and which axles have one centred wheel (keke front) */
  axles: { z: number; single?: boolean }[];
  /** side silhouette above the sills, from the front bottom over the top to the rear bottom: [z, y] */
  top: [number, number][];
  /** glass greenhouse silhouette, [z, y] */
  cabin?: [number, number][];
  /** roof slab: z from, z to, y */
  roof?: [number, number, number];
  /** height of the lights and bumpers */
  lightY: number;
  /** paint colours traffic picks from */
  colors: string[];
  /** number of doors a side (seams and handles) */
  doors?: 0 | 1 | 2;
};

const COMMON = ['#E63946', '#1D9BF0', '#F4F1DE', '#2D2D2D', '#8A96A8', '#06D6A0', '#8338EC', '#F28C28', '#C9CED6', '#7A1E2C', '#1F4E79'];
const SENSIBLE = ['#F4F1DE', '#2D2D2D', '#8A96A8', '#C9CED6', '#1F4E79', '#7A1E2C', '#3D5A40', '#5C6B7A'];

const SPECS: Record<CarModel, Spec> = {
  sedan: {
    L: 4.3, W: 1.8, y0: 0.28, wheelR: 0.36, axles: [{ z: 1.38 }, { z: -1.32 }], lightY: 0.62, doors: 2,
    top: [[2.15, 0.5], [2.12, 0.68], [1.9, 0.8], [0.95, 0.88], [-1.35, 0.92], [-2.05, 0.9], [-2.15, 0.72], [-2.15, 0.5]],
    cabin: [[0.95, 0.86], [0.2, 1.36], [-0.85, 1.36], [-1.4, 0.9]],
    roof: [0.22, -0.88, 1.36], colors: COMMON,
  },
  hatch: {
    L: 3.8, W: 1.74, y0: 0.27, wheelR: 0.34, axles: [{ z: 1.22 }, { z: -1.2 }], lightY: 0.66, doors: 2,
    top: [[1.9, 0.5], [1.88, 0.7], [1.65, 0.82], [0.85, 0.9], [-1.82, 0.95], [-1.9, 0.8], [-1.9, 0.5]],
    cabin: [[0.85, 0.88], [0.15, 1.38], [-1.45, 1.38], [-1.78, 0.94]],
    roof: [0.17, -1.5, 1.38], colors: COMMON,
  },
  coupe: {
    L: 4.4, W: 1.82, y0: 0.24, wheelR: 0.35, axles: [{ z: 1.4 }, { z: -1.35 }], lightY: 0.6, doors: 1,
    top: [[2.2, 0.46], [2.16, 0.64], [1.85, 0.76], [0.85, 0.84], [-1.4, 0.88], [-2.12, 0.84], [-2.2, 0.66], [-2.2, 0.46]],
    cabin: [[0.85, 0.82], [0.05, 1.24], [-0.7, 1.24], [-1.55, 0.86]],
    roof: [0.07, -0.73, 1.24], colors: ['#E63946', '#1D9BF0', '#FFD166', '#2D2D2D', '#F4F1DE', '#06D6A0'],
  },
  wagon: {
    L: 4.6, W: 1.82, y0: 0.29, wheelR: 0.36, axles: [{ z: 1.45 }, { z: -1.4 }], lightY: 0.66, doors: 2,
    top: [[2.3, 0.5], [2.27, 0.7], [2.0, 0.82], [1.05, 0.9], [-2.2, 0.96], [-2.3, 0.8], [-2.3, 0.5]],
    cabin: [[1.05, 0.88], [0.3, 1.42], [-2.0, 1.42], [-2.2, 0.95]],
    roof: [0.32, -2.05, 1.42], colors: SENSIBLE,
  },
  suv: {
    L: 4.6, W: 1.95, y0: 0.4, wheelR: 0.45, axles: [{ z: 1.45 }, { z: -1.45 }], lightY: 0.85, doors: 2,
    top: [[2.3, 0.62], [2.28, 0.95], [2.05, 1.08], [1.15, 1.15], [-2.2, 1.2], [-2.3, 1.05], [-2.3, 0.62]],
    cabin: [[1.15, 1.13], [0.5, 1.75], [-2.1, 1.75], [-2.22, 1.18]],
    roof: [0.5, -2.15, 1.75], colors: ['#2D2D2D', '#F4F1DE', '#8A96A8', '#1F4E79', '#4B5320', '#7A1E2C', '#C9CED6'],
  },
  minivan: {
    L: 5.0, W: 1.98, y0: 0.32, wheelR: 0.38, axles: [{ z: 1.7 }, { z: -1.5 }], lightY: 0.78, doors: 2,
    top: [[2.5, 0.56], [2.47, 0.86], [2.15, 1.0], [1.45, 1.06], [-2.42, 1.1], [-2.5, 0.92], [-2.5, 0.56]],
    cabin: [[1.45, 1.04], [0.65, 1.86], [-2.3, 1.86], [-2.42, 1.08]],
    roof: [0.67, -2.34, 1.86], colors: SENSIBLE,
  },
  pickup: {
    L: 5.0, W: 1.9, y0: 0.4, wheelR: 0.44, axles: [{ z: 1.6 }, { z: -1.55 }], lightY: 0.85, doors: 1,
    top: [[2.5, 0.62], [2.48, 0.95], [2.25, 1.08], [1.2, 1.14], [-2.45, 1.16], [-2.5, 1.0], [-2.5, 0.62]],
    cabin: [[1.2, 1.12], [0.6, 1.72], [-0.55, 1.72], [-0.65, 1.14]],
    roof: [0.6, -0.65, 1.72], colors: ['#F4F1DE', '#E63946', '#2D2D2D', '#1F4E79', '#8A96A8', '#C9CED6'],
  },
  danfo: {
    L: 5.0, W: 2.0, y0: 0.38, wheelR: 0.42, axles: [{ z: 1.75 }, { z: -1.6 }], lightY: 0.8,
    top: [[2.5, 0.6], [2.5, 1.05], [2.3, 1.25], [-2.5, 1.25], [-2.5, 0.6]],
    cabin: [[2.3, 1.22], [1.95, 2.1], [-2.48, 2.1], [-2.48, 1.22]],
    roof: [1.98, -2.5, 2.1], colors: ['#F2B705'],
  },
  sport: {
    L: 4.5, W: 1.95, y0: 0.2, wheelR: 0.33, axles: [{ z: 1.35 }, { z: -1.4 }], lightY: 0.55, doors: 1,
    top: [[2.25, 0.4], [2.2, 0.6], [1.2, 0.8], [-1.6, 0.9], [-2.2, 0.86], [-2.25, 0.62], [-2.25, 0.4]],
    cabin: [[0.75, 0.8], [-0.15, 1.15], [-0.8, 1.15], [-1.75, 0.9]],
    roof: [-0.12, -0.85, 1.15], colors: ['#E63946', '#FFD166', '#06D6A0', '#F28C28', '#F4F1DE'],
  },
  taxi: {
    L: 4.5, W: 1.85, y0: 0.28, wheelR: 0.36, axles: [{ z: 1.45 }, { z: -1.4 }], lightY: 0.62, doors: 2,
    top: [[2.25, 0.5], [2.22, 0.68], [2.0, 0.8], [1.0, 0.88], [-1.45, 0.92], [-2.15, 0.9], [-2.25, 0.72], [-2.25, 0.5]],
    cabin: [[1.0, 0.86], [0.25, 1.38], [-0.9, 1.38], [-1.5, 0.9]],
    roof: [0.27, -0.93, 1.38], colors: ['#F7C600'],
  },
  van: {
    L: 5.0, W: 2.0, y0: 0.38, wheelR: 0.42, axles: [{ z: 1.75 }, { z: -1.6 }], lightY: 0.8, doors: 1,
    top: [[2.5, 0.6], [2.5, 1.05], [2.3, 1.25], [-2.5, 1.25], [-2.5, 0.6]],
    cabin: [[2.3, 1.22], [1.95, 2.1], [-2.48, 2.1], [-2.48, 1.22]],
    roof: [1.98, -2.5, 2.1], colors: ['#F4F1DE', '#F4F1DE', '#C9CED6', '#2D2D2D'],
  },
  boxtruck: {
    // a cab up front and a tall box behind it: the delivery truck
    L: 6.4, W: 2.2, y0: 0.45, wheelR: 0.46, axles: [{ z: 2.15 }, { z: -1.8 }], lightY: 0.85, doors: 1,
    top: [[3.2, 0.65], [3.18, 1.1], [2.95, 1.25], [2.3, 1.3], [2.3, 1.3], [-3.2, 1.3], [-3.2, 0.65]],
    cabin: [[2.3, 1.28], [1.9, 2.15], [1.15, 2.15], [1.15, 1.28]],
    roof: [1.9, 1.15, 2.15], colors: ['#F4F1DE', '#E8E4D8', '#F2B705', '#C9CED6'],
  },
  bus: {
    L: 9.0, W: 2.45, y0: 0.45, wheelR: 0.5, axles: [{ z: 2.55 }, { z: -2.6 }], lightY: 0.85,
    top: [[4.5, 0.6], [4.5, 1.5], [-4.5, 1.5], [-4.5, 0.6]],
    cabin: [[4.5, 1.48], [4.45, 2.6], [-4.48, 2.6], [-4.48, 1.48]],
    roof: [4.45, -4.48, 2.6], colors: ['#1F4E79', '#F4F1DE'],
  },
  keke: {
    L: 2.7, W: 1.3, y0: 0.32, wheelR: 0.28, axles: [{ z: 1.0, single: true }, { z: -0.85 }], lightY: 0.8,
    top: [[1.3, 0.45], [1.32, 0.75], [1.1, 1.05], [0.6, 1.0], [-1.25, 0.95], [-1.35, 0.7], [-1.35, 0.45]],
    roof: [0.95, -1.35, 2.15], colors: ['#F2B705', '#2BA84A'],
  },
};

export const TRAFFIC_MODELS: { model: CarModel; weight: number; speed: number }[] = [
  { model: 'sedan', weight: 5, speed: 1 },
  { model: 'hatch', weight: 3, speed: 1 },
  { model: 'suv', weight: 3, speed: 0.95 },
  { model: 'taxi', weight: 3, speed: 1 },
  { model: 'wagon', weight: 2, speed: 0.95 },
  { model: 'minivan', weight: 2, speed: 0.9 },
  { model: 'coupe', weight: 1, speed: 1.15 },
  { model: 'van', weight: 1, speed: 0.85 },
  { model: 'boxtruck', weight: 1, speed: 0.75 },
  { model: 'bus', weight: 1, speed: 0.7 },
  { model: 'pickup', weight: 2, speed: 0.9 },
  { model: 'sport', weight: 1, speed: 1.25 },
];

export function carSpec(model: CarModel) {
  return SPECS[model];
}

/** Where people sit, in the car's own frame. `y` is the top of the seat cushion. */
export type Seat = { x: number; y: number; z: number };
export type CarSeats = { driver: Seat; front: Seat | null; rear: Seat[]; wheel: { x: number; y: number; z: number } };
/** A bus door leaf: slides out and along the side when the doors open. */
export type DoorLeaf = { x: number; z: number; w: number; dir: 1 | -1 };

export type CarGeo = {
  parts: Record<CarPart, THREE.BufferGeometry | null>;
  /** one wheel at the origin, axle along x, the rim on +x; spin it about x */
  wheel: THREE.BufferGeometry;
  /** wheel centres; `flip` wheels are the ones on -x (turn the wheel half round about y, and spin it the other way) */
  wheels: { x: number; y: number; z: number; flip: boolean }[];
  /** the scale that turns unitWheel() into this model's wheel */
  wheelScale: [number, number, number];
  seats: CarSeats | null;
  /** bus door leaves (hollow bus only) and the geometry of one leaf, hinge edge at its origin */
  doors: DoorLeaf[];
  door: THREE.BufferGeometry | null;
};

export type CarOpts = {
  /** no roof or side glass: the rider shows from every angle (Market cars) */
  open?: boolean;
  /** cut the cabin out and furnish it: floor, seats, dash, wheel */
  hollow?: boolean;
};

const CACHE = new Map<string, CarGeo>();

/** The geometry for a model, built once per (model, options). */
export function carGeo(model: CarModel, opts: CarOpts = {}): CarGeo {
  const open = !!opts.open, hollow = !!opts.hollow || open;
  const key = `${model}|${open}|${hollow}`;
  let g = CACHE.get(key);
  if (!g) CACHE.set(key, (g = build(SPECS[model], model, open, hollow)));
  return g;
}

/** Merged geometry per material for a model (no wheels). */
export function carParts(model: CarModel, opts: CarOpts = {}) {
  return carGeo(model, opts).parts;
}

const TRIM = '#18191C';
const CHROME = '#C8CDD3';
const PLATE = '#E8E6DA';
const SEAT = '#2C3038';
const DASH = '#22252B';

type Piece = { g: THREE.BufferGeometry; color?: string; lamp?: LampKind };

function build(s: Spec, model: CarModel, open: boolean, hollow: boolean): CarGeo {
  const P: Record<CarPart, Piece[]> = { paint: [], glass: [], trim: [], lamp: [] };
  const { L, W, y0, wheelR: r, lightY } = s;
  const hl = L / 2, hw = W / 2;
  const isBus = model === 'bus';
  const add = (part: CarPart, g: THREE.BufferGeometry, color?: string, lamp?: LampKind) => P[part].push({ g, color, lamp });
  const box = (part: CarPart, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, color?: string, lamp?: LampKind) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    add(part, g, color, lamp);
  };
  const cyl = (part: CarPart, rad: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', color?: string, seg = 10) => {
    const g = new THREE.CylinderGeometry(rad, rad, len, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    add(part, g, color);
  };

  // Body: side profile with wheel arches, extruded across the width with a small bevel for soft edges.
  const bevel = 0.06;
  const sh = new THREE.Shape();
  const arch = r + 0.07;
  const axles = [...s.axles].sort((a, b) => b.z - a.z); // front first
  sh.moveTo(hl, y0);
  for (const a of axles) {
    sh.lineTo(a.z + arch, y0);
    sh.lineTo(a.z + arch, r);
    sh.absarc(a.z, r, arch, 0, Math.PI, false);
    sh.lineTo(a.z - arch, y0);
  }
  sh.lineTo(-hl, y0);
  for (let i = s.top.length - 1; i >= 0; i--) sh.lineTo(s.top[i][0], s.top[i][1]);

  // the bus opens its doors on the kerb side (-x): one ahead of the front wheels, one in the middle
  const busDoors: [number, number][] = isBus ? [[3.2, 4.2], [-0.45, 0.55]] : [];
  const cab = s.cabin;
  const zf = cab ? Math.min(cab[0][0], hl - 0.16) : 0, zr = cab ? Math.max(cab[cab.length - 1][0], -hl + 0.16) : 0;
  const beltY = cab ? Math.min(cab[0][1], cab[cab.length - 1][1]) : lightY + 0.3;
  const floorY = isBus ? 0.55 : y0 + 0.1;
  if (hollow && cab) {
    const pts = sh.getPoints(8);
    // nose and tail as solid blocks, the cabin between them as two thick side walls over a floor
    add('paint', extrudeAcross(polyShape(clipZ(pts, zf, Infinity)), W - 2 * bevel, { bevel, curve: 4 }));
    add('paint', extrudeAcross(polyShape(clipZ(pts, -Infinity, zr)), W - 2 * bevel, { bevel, curve: 4 }));
    const wall = 0.14;
    for (const side of [-1, 1]) {
      const gaps = side < 0 ? busDoors : [];
      for (const [a, b] of spans(zr, zf, gaps)) {
        const g = extrudeAcross(polyShape(clipZ(pts, a, b)), wall - 2 * bevel, { bevel });
        g.translate(side * (hw - wall / 2), 0, 0);
        add('paint', g);
      }
    }
    box('trim', W - 0.2, 0.08, zf - zr, 0, floorY - 0.04, (zf + zr) / 2, 0, DASH);
    // wheel wells over the tyres inside
    for (const a of s.axles) {
      if (a.z - arch > zf || a.z + arch < zr) continue;
      for (const side of [-1, 1]) box('trim', 0.42, 0.3, arch * 2, side * (hw - 0.3), 2 * r + 0.07 - 0.12, a.z, 0, DASH);
    }
  } else {
    add('paint', extrudeAcross(sh, W - 2 * bevel, { bevel, curve: 4 }));
  }

  // Greenhouse: glass all round, narrower than the body, with pillars and a painted roof.
  const roofY = s.roof ? s.roof[2] : beltY + 0.4;
  if (cab && !open) {
    if (isBus) {
      // the bus is glazed with panes so its doors can open: windscreen, rear window, and both sides
      const gh = roofY - beltY, gy = (roofY + beltY) / 2;
      box('glass', W - 0.12, gh - 0.05, 0.05, 0, gy, hl - 0.02);
      box('glass', W - 0.12, gh * 0.6, 0.05, 0, beltY + gh * 0.55, -hl + 0.02);
      for (const side of [-1, 1]) {
        for (const [a, b] of spans(-hl + 0.1, hl - 0.1, side < 0 ? busDoors : [])) box('glass', 0.05, gh, b - a, side * (hw - 0.03), gy, (a + b) / 2);
      }
      // traffic buses: the shut doors' glass, from the step to just under the roof like the door leaves
      if (!hollow) for (const [a, b] of busDoors) box('glass', 0.05, roofY - 0.5, b - a, -(hw - 0.03), 0.3 + (roofY - 0.38) / 2, (a + b) / 2);
    } else {
      const c = new THREE.Shape(cab.map(([z, y]) => new THREE.Vector2(z, y)));
      add('glass', extrudeAcross(c, W - 0.22));
    }
    // B pillar (and a C pillar on long cabins) as painted strips over the side glass
    const pillars = model === 'danfo' || model === 'van' ? [0.9, -0.3, -1.4] : isBus ? [2.0, 1.0, -1.6, -2.6, -3.6] : model === 'minivan' ? [-0.15, -1.5] : model === 'wagon' ? [(cab[1][0] + cab[2][0]) / 2 + 0.3, -1.25] : model === 'pickup' || model === 'boxtruck' ? [] : [(cab[1][0] + cab[2][0]) / 2 - 0.05];
    for (const pz of pillars) box('paint', W - 0.14, roofY - beltY, 0.1, 0, (roofY + beltY) / 2, pz);
    if (isBus) {
      // a pillar either side of each door, and the windscreen split down the middle
      for (const [a, b] of busDoors) for (const pz of [a - 0.05, b + 0.05]) box('paint', W - 0.04, roofY - beltY, 0.1, 0, (roofY + beltY) / 2, pz);
      box('trim', 0.08, roofY - beltY, 0.06, 0, (roofY + beltY) / 2, hl, 0, TRIM);
    }
    // drip rail along the roof edge
    for (const side of [-1, 1]) box('trim', 0.03, 0.04, Math.abs(cab[1][0] - cab[2][0]), side * (hw - 0.09), roofY - 0.02, (cab[1][0] + cab[2][0]) / 2, 0, TRIM);
  } else if (cab && open) {
    // windscreen only
    const [z0, y0w] = cab[0], [z1, y1w] = cab[1];
    const len = Math.hypot(z1 - z0, y1w - y0w) * 0.75;
    const ang = Math.atan2(y1w - y0w, z0 - z1);
    const g = new THREE.BoxGeometry(W - 0.3, 0.05, len);
    g.rotateX(ang);
    g.translate(0, y0w + Math.sin(ang) * len * 0.5, z0 - Math.cos(ang) * len * 0.5);
    add('glass', g);
    // windscreen frame
    for (const side of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.06, 0.06, len);
      f.rotateX(ang);
      f.translate(side * (hw - 0.14), y0w + Math.sin(ang) * len * 0.5, z0 - Math.cos(ang) * len * 0.5);
      add('paint', f);
    }
  }
  if (s.roof && !open && model !== 'keke') {
    const [z0, z1, y] = s.roof;
    box('paint', W - 0.12, 0.07, Math.abs(z0 - z1) + 0.06, 0, y + 0.03, (z0 + z1) / 2);
  }

  // Inside: seats, dashboard and the steering wheel (rides only; traffic never shows its cabin)
  let seats: CarSeats | null = null;
  if (hollow && cab) {
    seats = isBus ? busInterior() : carInterior();
  }
  function seatAt(x: number, y: number, z: number, w = 0.5, color = SEAT) {
    box('trim', w, 0.12, 0.5, x, y - 0.06, z, 0, color);
    box('trim', w, 0.62, 0.1, x, y + 0.27, z - 0.27, -0.14, color);
    box('trim', w * 0.55, 0.16, 0.08, x, y + 0.66, z - 0.33, -0.14, color);
    box('trim', w * 0.9, y - floorY - 0.12, 0.4, x, (y + floorY) / 2 - 0.06, z, 0, DASH);
  }
  function carInterior(): CarSeats {
    const seatY = floorY + 0.24;
    const fz = cab![0][0] - 0.95;
    const rz = model === 'sport' || model === 'coupe' || model === 'pickup' || model === 'boxtruck' || fz - 0.92 < zr + 0.3 ? null : fz - 0.92;
    const sx = hw - 0.5;
    seatAt(sx, seatY, fz);
    seatAt(-sx, seatY, fz);
    if (rz != null) {
      box('trim', W - 0.4, 0.12, 0.5, 0, seatY - 0.06, rz, 0, SEAT);
      box('trim', W - 0.4, 0.62, 0.1, 0, seatY + 0.27, rz - 0.27, -0.14, SEAT);
      box('trim', W - 0.5, seatY - floorY - 0.12, 0.4, 0, (seatY + floorY) / 2 - 0.06, rz, 0, DASH);
    }
    // dashboard under the windscreen, a console between the seats
    const dashY = beltY - 0.06;
    box('trim', W - 0.24, 0.2, 0.42, 0, dashY, zf - 0.18, 0, DASH);
    box('trim', 0.18, 0.18, 0.9, 0, floorY + 0.2, fz + 0.15, 0, DASH);
    // the wheel on the driver's side (+x), tilted towards them, on its column
    const wheel = { x: sx, y: dashY + 0.14, z: zf - 0.5 };
    const rim = new THREE.TorusGeometry(0.17, 0.022, 6, 16);
    rim.rotateX(-0.45);
    rim.translate(wheel.x, wheel.y, wheel.z);
    add('trim', rim, '#111214');
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8);
    hub.rotateX(Math.PI / 2 - 0.45);
    hub.translate(wheel.x, wheel.y, wheel.z);
    add('trim', hub, '#2A2D33');
    box('trim', 0.05, 0.05, 0.3, wheel.x, wheel.y - 0.04, wheel.z + 0.16, -0.45, '#2A2D33');
    // the speedo glowing faintly behind the wheel
    box('lamp', 0.22, 0.06, 0.02, wheel.x, dashY + 0.09, zf - 0.36, -0.6, '#7FD4FF', LAMP.sign);
    return {
      driver: { x: sx, y: seatY, z: fz },
      front: { x: -sx, y: seatY, z: fz },
      rear: rz != null ? [{ x: -sx, y: seatY, z: rz }, { x: sx, y: seatY, z: rz }] : [],
      wheel,
    };
  }
  function busInterior(): CarSeats {
    const seatY = floorY + 0.45;
    const rear: Seat[] = [];
    // pairs of forward-facing seats down both sides, a clear aisle, nothing in front of the middle door
    for (let z = 2.3; z > -4.0; z -= 0.86) {
      for (const side of [-1, 1]) {
        if (side < 0 && z > -0.95 && z < 1.05) continue;
        for (const k of [0, 1]) {
          const x = side * (hw - 0.4 - k * 0.5);
          seatAt(x, seatY, z, 0.46, k ? '#2F5E8C' : '#2A527A');
          rear.push({ x, y: seatY, z });
        }
      }
    }
    // grab poles from floor to roof by the aisle
    for (const z of [2.75, 0.9, -1.1, -2.9]) for (const side of [-1, 1]) cyl('trim', 0.025, roofY - floorY, side * 0.32, (roofY + floorY) / 2, z, 'y', '#F2B705', 6);
    // driver's cab: seat, dash, the big flat wheel, a farebox by the door
    const d = { x: hw - 0.62, y: seatY, z: 3.35 };
    seatAt(d.x, d.y, d.z, 0.5, '#1E2228');
    box('trim', W - 0.3, 0.28, 0.5, 0, beltY - 0.15, hl - 0.4, 0, DASH);
    const wheel = { x: d.x, y: beltY + 0.0, z: d.z + 0.55 };
    const rim = new THREE.TorusGeometry(0.22, 0.025, 6, 16);
    rim.rotateX(-1.0);
    rim.translate(wheel.x, wheel.y, wheel.z);
    add('trim', rim, '#111214');
    box('trim', 0.06, 0.06, 0.4, wheel.x, wheel.y - 0.1, wheel.z + 0.18, -1.0, '#2A2D33');
    box('trim', 0.25, 0.9, 0.25, -0.2, floorY + 0.45, 3.85, 0, '#3A3F47');
    box('lamp', 0.12, 0.08, 0.02, -0.2, floorY + 0.85, 3.98, 0, '#7FFFB0', LAMP.sign);
    // a step down at each door
    for (const [a, b] of busDoors) box('trim', 0.4, 0.12, b - a, -(hw - 0.2), 0.3, (a + b) / 2, 0, '#3A3F47');
    // the passenger sits by a window on the kerb side, half way back
    const seatPick = rear.find((p) => p.x < 0 && Math.abs(p.z - -1.14) < 0.1) ?? rear[0];
    return { driver: d, front: seatPick, rear, wheel };
  }

  // Doors: seams and handles on the sides (painted cars) or real leaves on the bus
  const doors: DoorLeaf[] = [];
  let door: THREE.BufferGeometry | null = null;
  if (isBus) {
    for (const [a, b] of busDoors) {
      const w = (b - a) / 2;
      doors.push({ x: -hw - 0.01, z: b, w, dir: 1 }, { x: -hw - 0.01, z: a, w, dir: -1 });
    }
    // one leaf, hinge at z = 0, running towards -z: glass with a dark frame, from the step to the roof
    const leafH = roofY - 0.38;
    const leaf: Piece[] = [];
    const lb = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      leaf.push({ g, color });
    };
    const w = 0.5;
    lb(0.04, leafH - 0.12, w - 0.08, 0, 0.3 + leafH / 2, -w / 2, '#2B3A4E');
    lb(0.06, 0.06, w, 0, 0.32, -w / 2, TRIM);
    lb(0.06, 0.06, w, 0, 0.3 + leafH - 0.03, -w / 2, TRIM);
    lb(0.06, 0.06, w, 0, 0.3 + leafH * 0.45, -w / 2, TRIM);
    lb(0.06, leafH, 0.05, 0, 0.3 + leafH / 2, -0.02, TRIM);
    lb(0.06, leafH, 0.05, 0, 0.3 + leafH / 2, -w + 0.02, '#3A3F47');
    door = mergePieces(leaf, true, false);
    if (!hollow) {
      // traffic buses: the doors drawn shut on the side
      for (const [a, b] of busDoors) {
        box('trim', 0.03, roofY - 0.4, 0.05, -hw - 0.01, 0.3 + (roofY - 0.4) / 2, (a + b) / 2, 0, TRIM);
        box('trim', 0.03, 0.06, b - a, -hw - 0.01, 0.32, (a + b) / 2, 0, TRIM);
      }
    }
  } else if (s.doors && cab) {
    const zB = s.doors === 2 ? (cab[1][0] + cab[2][0]) / 2 - 0.05 : cab[cab.length - 1][0] + 0.15;
    const seams = s.doors === 2 ? [zf + 0.02, zB, cab[cab.length - 1][0] + 0.12] : [zf + 0.02, zB];
    for (const side of [-1, 1]) {
      const x = side * (hw + 0.004);
      for (const z of seams) box('trim', 0.012, beltY - y0 - 0.12, 0.018, x, (beltY + y0) / 2 + 0.02, z, 0, '#0E0F11');
      for (let k = 1; k < seams.length; k++) box('trim', 0.03, 0.035, 0.14, side * (hw + 0.015), beltY - 0.12, seams[k] + 0.16, 0, CHROME);
    }
  }

  // Model extras
  if (model === 'keke') {
    // canopy on posts, windscreen, open sides
    const [z0, z1, y] = s.roof!;
    box('paint', W + 0.04, 0.08, Math.abs(z0 - z1), 0, y, (z0 + z1) / 2);
    box('trim', W + 0.06, 0.12, Math.abs(z0 - z1) - 0.1, 0, y - 0.1, (z0 + z1) / 2, 0, TRIM);
    for (const px of [-1, 1]) {
      box('trim', 0.06, y - 1.0, 0.06, px * (hw - 0.05), (y + 1.0) / 2, z0 - 0.05, 0, TRIM);
      box('trim', 0.06, y - 0.95, 0.06, px * (hw - 0.05), (y + 0.95) / 2, z1 + 0.08, 0, TRIM);
    }
    box('glass', W - 0.15, 0.75, 0.04, 0, 1.4, z0 - 0.05, -0.18);
    box('trim', W - 0.1, 0.5, 0.05, 0, y - 0.35, z1 + 0.04, 0, TRIM); // back panel
    box('trim', 0.7, 0.06, 0.06, 0, 1.15, z0 - 0.4, 0, TRIM); // handlebar
    box('trim', 0.5, 0.1, 0.45, 0, 1.0, 0.25, 0, SEAT); // the driver's saddle
    box('trim', W - 0.2, 0.1, 0.5, 0, 0.98, -0.75, 0, SEAT); // the bench behind
  }
  if (model === 'danfo') {
    for (const sx of [-1, 1]) {
      box('trim', 0.02, 0.1, L - 0.4, sx * (hw + 0.005), 1.08, 0, 0, TRIM);
      box('trim', 0.02, 0.06, L - 0.4, sx * (hw + 0.005), 0.86, 0, 0, TRIM);
    }
    box('trim', W - 0.4, 0.06, L * 0.6, 0, 2.24, -0.4, 0, TRIM);
    for (const z of [-1.8, -0.4, 1.0]) box('trim', W - 0.3, 0.12, 0.06, 0, 2.2, z, 0, TRIM);
  }
  if (model === 'taxi') {
    // the checker band along both sides, and the lit sign on a black base on the roof
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 16; k++) for (const row of [0, 1]) if ((k + row) % 2 === 0) box('trim', 0.02, 0.075, 0.14, sx * (hw + 0.006), 0.7 + row * 0.075, 0.95 - k * 0.14, 0, '#111111');
    }
    if (!open) {
      box('trim', 0.82, 0.05, 0.36, 0, roofY + 0.09, -0.35, 0, TRIM);
      box('lamp', 0.76, 0.22, 0.3, 0, roofY + 0.22, -0.35, 0, '#FFE6A0', LAMP.sign);
      // the medallion number on the boot lid and a shield on each front door
      for (const sx of [-1, 1]) box('trim', 0.015, 0.14, 0.22, sx * (hw + 0.006), 0.66, 0.55, 0, '#1C1C1C');
    }
  }
  if (isBus) {
    // route signs over the windscreen and the rear window, a livery stripe, roof pods and a bike rack on the nose
    box('trim', W - 0.4, 0.34, 0.06, 0, roofY - 0.22, hl + 0.02, 0, '#0B0C0E');
    box('lamp', W - 0.56, 0.22, 0.02, 0, roofY - 0.22, hl + 0.055, 0, '#FFB020', LAMP.sign);
    box('lamp', W * 0.4, 0.16, 0.02, 0, roofY - 0.25, -hl - 0.03, 0, '#FFB020', LAMP.sign);
    for (const sx of [-1, 1]) {
      box('lamp', 0.02, 0.16, 0.9, sx * (hw + 0.012), roofY - 0.22, 2.9, 0, '#FFB020', LAMP.sign);
      for (const [a, b] of spans(-hl + 0.1, hl - 0.1, sx < 0 ? busDoors : [])) box('trim', 0.02, 0.14, b - a, sx * (hw + 0.008), 1.18, (a + b) / 2, 0, '#F2B705');
    }
    box('trim', W - 0.8, 0.32, 2.2, 0, roofY + 0.2, -1.6, 0, '#D9DDE2');
    box('trim', W - 1.0, 0.2, 1.0, 0, roofY + 0.14, 1.4, 0, '#D9DDE2');
    box('trim', W - 0.6, 0.06, 0.4, 0, 0.75, hl + 0.3, 0, '#3A3F47');
    box('trim', W - 0.6, 0.5, 0.05, 0, 0.98, hl + 0.48, 0, '#3A3F47');
    box('trim', W - 0.5, 0.45, 0.04, 0, 0.75, -hl - 0.05, 0, '#2A2D33'); // engine grille
    // mirrors on arms out front
    for (const sx of [-1, 1]) {
      box('trim', 0.4, 0.04, 0.04, sx * (hw + 0.15), roofY - 0.35, hl - 0.1, 0, TRIM);
      box('trim', 0.06, 0.4, 0.06, sx * (hw + 0.34), roofY - 0.55, hl + 0.02, 0, TRIM);
      box('trim', 0.08, 0.38, 0.18, sx * (hw + 0.36), roofY - 0.85, hl + 0.06, 0, TRIM);
    }
  }
  if (model === 'pickup') {
    // the bed: dark floor between painted walls
    box('trim', W - 0.32, 0.04, 1.75, 0, 1.17, -1.55, 0, TRIM);
    box('paint', W - 0.2, 0.08, 0.06, 0, 1.2, -0.68);
  }
  if (model === 'boxtruck') {
    // the box: white panels with ribs, a roller door at the back, a grab step
    box('paint', W + 0.04, 2.3, 4.4, 0, 1.3 + 1.15, -0.95);
    for (let k = 0; k < 6; k++) box('trim', W + 0.07, 0.04, 0.05, 0, 2.2 + k * 0.0, -3.1 + k * 0.85, 0, '#B9BEC6');
    for (let k = 0; k < 7; k++) box('trim', W - 0.2, 0.025, 0.02, 0, 1.45 + k * 0.3, -3.16, 0, '#B9BEC6');
    box('trim', W + 0.06, 0.06, 4.42, 0, 3.6, -0.95, 0, '#B9BEC6');
  }
  if (model === 'suv' || model === 'wagon' || model === 'minivan') {
    for (const sx of [-1, 1]) box('trim', 0.06, 0.06, (model === 'suv' ? 2.2 : 2.0), sx * (hw - 0.25), roofY + 0.07, -0.8, 0, TRIM);
    if (model === 'suv') box('trim', 0.12, 0.6, 0.6, 0, 0.95, -hl - 0.08, 0, TRIM); // spare on the tailgate
    if (model === 'minivan') for (const sx of [-1, 1]) box('trim', 0.02, 0.04, 1.4, sx * (hw + 0.01), beltY + 0.02, -0.9, 0, CHROME); // sliding door rail
  }
  if (model === 'sport') {
    box('trim', W - 0.2, 0.05, 0.3, 0, 1.02, -hl + 0.15, 0, TRIM); // wing
    for (const sx of [-1, 1]) box('trim', 0.06, 0.18, 0.06, sx * (hw - 0.4), 0.92, -hl + 0.18, 0, TRIM);
    for (const sx of [-1, 1]) box('trim', 0.03, 0.18, 0.6, sx * (hw + 0.005), 0.45, -0.6, 0, TRIM); // side intakes
  }
  if ((model === 'sedan' || model === 'taxi' || model === 'wagon') && !open) box('trim', 0.015, 0.4, 0.015, -hw + 0.3, roofY + 0.2, (cab ? cab[2][0] : 0) + 0.05, -0.2, TRIM); // antenna

  // Bumpers, grille, lights, plates, mirrors, mud flaps.
  // the bevel pushes the body out by `bevel`, so everything on the nose and tail sits just proud of it
  const noseZ = hl + bevel + 0.01, tailZ = -hl - bevel - 0.01;
  if (model !== 'keke') {
    box('trim', W + 0.02, 0.2, 0.14, 0, y0 + 0.1, hl + bevel, 0, '#1E1F23');
    box('trim', W + 0.02, 0.2, 0.14, 0, y0 + 0.1, -hl - bevel, 0, '#1E1F23');
    box('trim', W * 0.42, 0.14, 0.04, 0, lightY - 0.02, noseZ, 0, '#0E0F11'); // grille
    for (let k = 0; k < 3; k++) box('trim', W * 0.4, 0.015, 0.02, 0, lightY - 0.06 + k * 0.04, noseZ + 0.02, 0, '#5A5F66'); // grille slats
    box('trim', 0.42, 0.12, 0.02, 0, y0 + 0.24, tailZ - 0.07, 0, PLATE); // rear plate
    box('trim', 0.3, 0.03, 0.025, 0, y0 + 0.25, tailZ - 0.075, 0, '#2B4A7A'); // its lettering
    if (!isBus) box('trim', 0.38, 0.1, 0.02, 0, y0 + 0.12, noseZ + 0.08, 0, PLATE); // front plate
    for (const sx of [-1, 1]) {
      // left (+x) and right (-x) indicators front and back; headlights; tail lights with the brake lights
      const sig = sx > 0 ? LAMP.left : LAMP.right;
      box('lamp', 0.34, 0.12, 0.06, sx * (hw - 0.3), lightY, noseZ, 0, undefined, LAMP.head);
      box('trim', 0.4, 0.17, 0.04, sx * (hw - 0.3), lightY, noseZ - 0.02, 0, CHROME); // the bezel round it
      box('lamp', 0.3, 0.12, 0.06, sx * (hw - 0.26), lightY + 0.04, tailZ, 0, undefined, LAMP.tail);
      box('lamp', 0.12, 0.06, 0.04, sx * (hw - 0.14), y0 + 0.22, noseZ + 0.05, 0, undefined, sig);
      box('lamp', 0.1, 0.12, 0.06, sx * (hw - 0.06), lightY + 0.04, tailZ, 0, undefined, sig);
      // side mirrors at the foot of the windscreen
      if (cab && !isBus) {
        const [mz, my] = cab[0];
        box('paint', 0.2, 0.12, 0.1, sx * (hw + 0.09), my + 0.13, mz - 0.25);
        box('trim', 0.08, 0.04, 0.06, sx * (hw + 0.01), my + 0.08, mz - 0.22, 0, TRIM);
        box('trim', 0.16, 0.09, 0.01, sx * (hw + 0.1), my + 0.13, mz - 0.31, 0, CHROME);
      }
      // sill strip between the arches
      const a0 = axles[0].z - arch, a1 = axles[axles.length - 1].z + arch;
      box('trim', 0.03, 0.07, a0 - a1, sx * (hw + 0.005), y0 + 0.05, (a0 + a1) / 2, 0, '#26272B');
    }
    // high-mounted brake light at the top of the rear window
    if (cab && !open && !isBus && model !== 'boxtruck') {
      const [rz, ry] = cab[cab.length - 1];
      box('lamp', 0.4, 0.04, 0.04, 0, roofY - 0.06, (rz + cab[cab.length - 2][0]) / 2 - 0.05 - (roofY - ry) * 0.25, 0, undefined, LAMP.tail);
    }
    // exhaust tip under the rear on the right
    cyl('trim', 0.04, 0.16, -hw + 0.4, y0 + 0.02, tailZ - 0.02, 'z', CHROME, 8);
  } else {
    box('lamp', 0.22, 0.14, 0.06, 0, lightY + 0.2, noseZ - 0.1, 0, undefined, LAMP.head);
    for (const sx of [-1, 1]) box('lamp', 0.14, 0.1, 0.05, sx * (hw - 0.2), 0.7, tailZ, 0, undefined, LAMP.tail);
  }

  // Mud flaps behind every wheel
  const tyreW = model === 'keke' ? 0.18 : isBus || model === 'boxtruck' ? 0.3 : 0.26;
  const wheels: CarGeo['wheels'] = [];
  for (const a of s.axles) {
    for (const sx of a.single ? [0] : [-1, 1]) {
      const x = sx * (hw - tyreW / 2 - 0.04);
      wheels.push({ x, y: r, z: a.z, flip: sx < 0 });
      if (sx !== 0) box('trim', tyreW + 0.02, 0.26, 0.02, x, Math.max(0.17, y0 - 0.02), a.z - arch - 0.02, 0, '#141518');
    }
  }

  const parts = {} as Record<CarPart, THREE.BufferGeometry | null>;
  for (const part of CAR_PARTS) parts[part] = mergePieces(P[part], part === 'trim', part === 'lamp');
  return { parts, wheel: wheelGeo(r, tyreW, model === 'keke'), wheels, wheelScale: [tyreW / UNIT_TYRE_W, r, r], seats, doors, door };
}

const UNIT_TYRE_W = 0.72;
let unit: THREE.BufferGeometry | null = null;
/** One wheel of radius 1 for the whole fleet: traffic scales it per model (CarGeo.wheelScale), so every car's
 *  wheels are a single instanced draw. */
export function unitWheel() {
  return (unit ??= wheelGeo(1, UNIT_TYRE_W, false));
}

/** A tyre with a rim, hub, spokes and wheel nuts, axle along x, the face on +x. Coloured per vertex. */
function wheelGeo(r: number, tyreW: number, small: boolean) {
  const out: Piece[] = [];
  // details are sized for a car wheel; keep them in proportion on the unit wheel
  const k = r === 1 ? 1 / 0.36 : 1;
  const add = (g: THREE.BufferGeometry, color: string) => out.push({ g, color });
  const tyre = new THREE.CylinderGeometry(r, r, tyreW, 16);
  tyre.rotateZ(Math.PI / 2);
  add(tyre, '#151518');
  // sidewall shoulder on the face, a little smaller than the tread
  const wall = new THREE.CylinderGeometry(r * 0.92, r * 0.96, 0.02 * k, 16);
  wall.rotateZ(Math.PI / 2);
  wall.translate(tyreW / 2 + 0.005 * k, 0, 0);
  add(wall, '#202024');
  const face = tyreW / 2 + 0.01 * k;
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.04 * k, 14);
  rim.rotateZ(Math.PI / 2);
  rim.translate(face, 0, 0);
  add(rim, '#C8CDD3');
  const dish = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.045 * k, 12);
  dish.rotateZ(Math.PI / 2);
  dish.translate(face + 0.002 * k, 0, 0);
  add(dish, '#5C6168');
  const hub = new THREE.CylinderGeometry(r * 0.17, r * 0.17, 0.07 * k, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(face + 0.025 * k, 0, 0);
  add(hub, '#D9DDE2');
  if (!small) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.03 * k, r * 0.42, r * 0.12);
      sp.translate(0, r * 0.32, 0);
      sp.rotateX(a);
      sp.translate(face + 0.02 * k, 0, 0);
      add(sp, '#C8CDD3');
    }
  }
  return mergePieces(out, true, false)!;
}

/** Merge pieces into one geometry, with per-vertex colours (trim) or lamp kinds (lamps). */
function mergePieces(pieces: Piece[], colors: boolean, lamps: boolean) {
  if (!pieces.length) return null;
  const list = pieces.map(({ g, color, lamp }) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.deleteAttribute('uv');
    const count = n.getAttribute('position').count;
    if (colors || lamps) {
      const c = new THREE.Color(color ?? (lamps ? '#FFFFFF' : TRIM));
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) arr.set([c.r, c.g, c.b], i * 3);
      n.setAttribute(lamps ? 'lampColor' : 'color', new THREE.BufferAttribute(arr, 3));
    }
    if (lamps) n.setAttribute('lamp', new THREE.BufferAttribute(new Float32Array(count).fill(lamp ?? LAMP.sign), 1));
    return n;
  });
  const out = mergeGeometries(list);
  out.computeBoundingSphere();
  out.computeBoundingBox();
  list.forEach((g) => g.dispose());
  return out;
}

/** The parts of [a, b] not covered by the gaps. */
function spans(a: number, b: number, gaps: [number, number][]) {
  const out: [number, number][] = [];
  let at = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > at) out.push([at, Math.min(g0, b)]);
    at = Math.max(at, g1);
  }
  if (at < b) out.push([at, b]);
  return out;
}

/** Clip a side-profile polygon (x = car z) to lo <= z <= hi. The profile is z-monotone, so one clip is one polygon. */
function clipZ(pts: THREE.Vector2[], lo: number, hi: number) {
  const clip = (poly: THREE.Vector2[], inside: (p: THREE.Vector2) => boolean, cut: number) => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (cut - a.x) / (b.x - a.x);
        out.push(new THREE.Vector2(cut, a.y + (b.y - a.y) * t));
      }
    }
    return out;
  };
  let poly = pts;
  if (Number.isFinite(lo)) poly = clip(poly, (p) => p.x >= lo, lo);
  if (Number.isFinite(hi)) poly = clip(poly, (p) => p.x <= hi, hi);
  return poly;
}

function polyShape(pts: THREE.Vector2[]) {
  // drop repeated points, which upset the triangulator
  const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-8);
  return new THREE.Shape(clean);
}

/** A side profile (shape x = car z, shape y = height) extruded symmetrically across x. */
function extrudeAcross(shape: THREE.Shape, width: number, opts?: { bevel?: number; curve?: number }) {
  const b = opts?.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: b > 0,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 1,
    curveSegments: opts?.curve ?? 6,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2); // (x, y, z) -> (-z, y, x): shape x becomes the car's length
  return g;
}

/** Materials per part. Lamps come from vehicleLights. `seeThrough` glass lets you see the people inside. */
export function carMaterial(part: Exclude<CarPart, 'lamp'>, paint?: string, seeThrough = false): THREE.Material {
  switch (part) {
    case 'paint':
      return new THREE.MeshStandardMaterial({ color: paint ?? '#ffffff', flatShading: true, roughness: 0.32, metalness: 0.38 });
    case 'glass':
      return seeThrough
        ? new THREE.MeshStandardMaterial({ color: '#3A4D68', flatShading: true, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.4, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: '#1B2436', flatShading: true, roughness: 0.12, metalness: 0.6 });
    case 'trim':
      return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.25 });
  }
}

/** Shared material for wheels (coloured per vertex). */
export function wheelMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.35 });
}
