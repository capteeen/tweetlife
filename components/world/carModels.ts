import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural low-poly cars, shared by ambient traffic (instanced) and vehicles people ride.
// Each model is a side profile extruded across the width (wheel arches cut out), a glass greenhouse, a roof,
// wheels with rims, bumpers, grille and lights. Parts are merged per material so a model costs one draw call
// per material, and every geometry is built once and cached. Models face +z, wheels on the ground at y = 0.

export type CarModel = 'sedan' | 'hatch' | 'suv' | 'pickup' | 'danfo' | 'sport' | 'keke';
export type CarPart = 'paint' | 'glass' | 'trim' | 'rim' | 'head' | 'tail';
export const CAR_PARTS: CarPart[] = ['paint', 'glass', 'trim', 'rim', 'head', 'tail'];

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
};

const COMMON = ['#E63946', '#1D9BF0', '#F4F1DE', '#2D2D2D', '#8A96A8', '#06D6A0', '#8338EC', '#F28C28', '#C9CED6', '#7A1E2C', '#1F4E79'];

const SPECS: Record<CarModel, Spec> = {
  sedan: {
    L: 4.3, W: 1.8, y0: 0.28, wheelR: 0.36, axles: [{ z: 1.38 }, { z: -1.32 }], lightY: 0.62,
    top: [[2.15, 0.5], [2.12, 0.68], [1.9, 0.8], [0.95, 0.88], [-1.35, 0.92], [-2.05, 0.9], [-2.15, 0.72], [-2.15, 0.5]],
    cabin: [[0.95, 0.86], [0.2, 1.36], [-0.85, 1.36], [-1.4, 0.9]],
    roof: [0.22, -0.88, 1.36], colors: COMMON,
  },
  hatch: {
    L: 3.8, W: 1.74, y0: 0.27, wheelR: 0.34, axles: [{ z: 1.22 }, { z: -1.2 }], lightY: 0.66,
    top: [[1.9, 0.5], [1.88, 0.7], [1.65, 0.82], [0.85, 0.9], [-1.82, 0.95], [-1.9, 0.8], [-1.9, 0.5]],
    cabin: [[0.85, 0.88], [0.15, 1.38], [-1.45, 1.38], [-1.78, 0.94]],
    roof: [0.17, -1.5, 1.38], colors: COMMON,
  },
  suv: {
    L: 4.6, W: 1.95, y0: 0.4, wheelR: 0.45, axles: [{ z: 1.45 }, { z: -1.45 }], lightY: 0.85,
    top: [[2.3, 0.62], [2.28, 0.95], [2.05, 1.08], [1.15, 1.15], [-2.2, 1.2], [-2.3, 1.05], [-2.3, 0.62]],
    cabin: [[1.15, 1.13], [0.5, 1.75], [-2.1, 1.75], [-2.22, 1.18]],
    roof: [0.5, -2.15, 1.75], colors: ['#2D2D2D', '#F4F1DE', '#8A96A8', '#1F4E79', '#4B5320', '#7A1E2C', '#C9CED6'],
  },
  pickup: {
    L: 5.0, W: 1.9, y0: 0.4, wheelR: 0.44, axles: [{ z: 1.6 }, { z: -1.55 }], lightY: 0.85,
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
    L: 4.5, W: 1.95, y0: 0.2, wheelR: 0.33, axles: [{ z: 1.35 }, { z: -1.4 }], lightY: 0.55,
    top: [[2.25, 0.4], [2.2, 0.6], [1.2, 0.8], [-1.6, 0.9], [-2.2, 0.86], [-2.25, 0.62], [-2.25, 0.4]],
    cabin: [[0.75, 0.8], [-0.15, 1.15], [-0.8, 1.15], [-1.75, 0.9]],
    roof: [-0.12, -0.85, 1.15], colors: ['#E63946', '#FFD166', '#06D6A0', '#F28C28', '#F4F1DE'],
  },
  keke: {
    L: 2.7, W: 1.3, y0: 0.32, wheelR: 0.28, axles: [{ z: 1.0, single: true }, { z: -0.85 }], lightY: 0.8,
    top: [[1.3, 0.45], [1.32, 0.75], [1.1, 1.05], [0.6, 1.0], [-1.25, 0.95], [-1.35, 0.7], [-1.35, 0.45]],
    roof: [0.95, -1.35, 2.15], colors: ['#F2B705', '#2BA84A'],
  },
};

export const TRAFFIC_MODELS: { model: CarModel; weight: number; speed: number }[] = [
  { model: 'sedan', weight: 5, speed: 1 },
  { model: 'hatch', weight: 4, speed: 1 },
  { model: 'suv', weight: 3, speed: 0.95 },
  { model: 'danfo', weight: 3, speed: 0.8 },
  { model: 'keke', weight: 3, speed: 0.7 },
  { model: 'pickup', weight: 2, speed: 0.9 },
  { model: 'sport', weight: 1, speed: 1.25 },
];

export function carSpec(model: CarModel) {
  return SPECS[model];
}

const CACHE = new Map<string, Record<CarPart, THREE.BufferGeometry | null>>();

/** Merged geometry per material for a model. `open` drops the roof and side glass so a rider stands visible. */
export function carParts(model: CarModel, open = false): Record<CarPart, THREE.BufferGeometry | null> {
  const key = `${model}|${open}`;
  let parts = CACHE.get(key);
  if (!parts) CACHE.set(key, (parts = build(SPECS[model], model, open)));
  return parts;
}

function build(s: Spec, model: CarModel, open: boolean): Record<CarPart, THREE.BufferGeometry | null> {
  const P: Record<CarPart, THREE.BufferGeometry[]> = { paint: [], glass: [], trim: [], rim: [], head: [], tail: [] };
  const { L, W, y0, wheelR: r, lightY } = s;
  const hl = L / 2, hw = W / 2;
  const box = (part: CarPart, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    P[part].push(g);
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
  P.paint.push(extrudeAcross(sh, W - 2 * bevel, { bevel, curve: 4 }));

  // Greenhouse: glass all round, narrower than the body, with pillars and a painted roof.
  if (s.cabin && !open) {
    const c = new THREE.Shape(s.cabin.map(([z, y]) => new THREE.Vector2(z, y)));
    P.glass.push(extrudeAcross(c, W - 0.22));
    const [rz0, rz1] = [s.cabin[0][0], s.cabin[s.cabin.length - 1][0]];
    const beltY = Math.min(s.cabin[0][1], s.cabin[s.cabin.length - 1][1]);
    const roofY = s.roof ? s.roof[2] : beltY + 0.4;
    // B pillar (and a C pillar on long cabins) as painted strips over the side glass
    const pillars = model === 'danfo' ? [0.9, -0.3, -1.4] : model === 'pickup' ? [] : [(s.cabin[1][0] + s.cabin[2][0]) / 2 - 0.05];
    for (const pz of pillars) box('paint', W - 0.18, roofY - beltY, 0.1, 0, (roofY + beltY) / 2, pz);
    // drip rail along the roof edge
    box('trim', W - 0.16, 0.04, Math.abs(rz0 - rz1) * 0.5, 0, beltY + 0.02, (rz0 + rz1) / 2);
  } else if (s.cabin && open) {
    // windshield only
    const [z0, y0w] = s.cabin[0], [z1, y1w] = s.cabin[1];
    const len = Math.hypot(z1 - z0, y1w - y0w) * 0.75;
    const ang = Math.atan2(y1w - y0w, z0 - z1);
    const g = new THREE.BoxGeometry(W - 0.3, 0.05, len);
    g.rotateX(ang);
    g.translate(0, y0w + Math.sin(ang) * len * 0.5, z0 - Math.cos(ang) * len * 0.5);
    P.glass.push(g);
    // seats, seen from above with nobody in them
    const sz = (s.cabin[1][0] + s.cabin[2][0]) / 2;
    const seatY = s.cabin[0][1] + 0.02;
    for (const sx of [-1, 1]) {
      box('trim', 0.55, 0.12, 0.6, sx * 0.4, seatY, sz);
      box('trim', 0.55, 0.5, 0.12, sx * 0.4, seatY + 0.25, sz - 0.3, -0.15);
    }
  }
  if (s.roof && !open && model !== 'keke') {
    const [z0, z1, y] = s.roof;
    box('paint', W - 0.16, 0.07, Math.abs(z0 - z1) + 0.06, 0, y + 0.03, (z0 + z1) / 2);
  }
  if (model === 'keke') {
    // canopy on posts, windscreen, open sides
    const [z0, z1, y] = s.roof!;
    box('paint', W + 0.04, 0.08, Math.abs(z0 - z1), 0, y, (z0 + z1) / 2);
    box('trim', W + 0.06, 0.12, Math.abs(z0 - z1) - 0.1, 0, y - 0.1, (z0 + z1) / 2);
    for (const px of [-1, 1]) {
      box('trim', 0.06, y - 1.0, 0.06, px * (hw - 0.05), (y + 1.0) / 2, z0 - 0.05);
      box('trim', 0.06, y - 0.95, 0.06, px * (hw - 0.05), (y + 0.95) / 2, z1 + 0.08);
    }
    box('glass', W - 0.15, 0.75, 0.04, 0, 1.4, z0 - 0.05, -0.18);
    box('trim', W - 0.1, 0.5, 0.05, 0, y - 0.35, z1 + 0.04); // back panel
    box('trim', 0.7, 0.06, 0.06, 0, 1.15, z0 - 0.4); // handlebar
  }
  if (model === 'danfo') {
    // the black danfo stripes, a roof rack and a spare wheel at the back
    for (const sx of [-1, 1]) {
      box('trim', 0.02, 0.1, L - 0.4, sx * (hw + 0.005), 1.08, 0);
      box('trim', 0.02, 0.06, L - 0.4, sx * (hw + 0.005), 0.86, 0);
    }
    box('trim', W - 0.4, 0.06, L * 0.6, 0, 2.24, -0.4);
    for (const z of [-1.8, -0.4, 1.0]) box('trim', W - 0.3, 0.12, 0.06, 0, 2.2, z);
  }
  if (model === 'pickup') {
    // the bed: dark floor between painted walls
    box('trim', W - 0.32, 0.04, 1.75, 0, 1.17, -1.55);
    box('paint', W - 0.2, 0.08, 0.06, 0, 1.2, -0.68);
  }
  if (model === 'suv') {
    for (const sx of [-1, 1]) box('trim', 0.06, 0.06, 2.2, sx * (hw - 0.25), 1.82, -0.8);
    box('trim', 0.12, 0.6, 0.6, 0, 0.95, -hl - 0.08); // spare on the tailgate
  }
  if (model === 'sport') {
    box('trim', W - 0.2, 0.05, 0.3, 0, 1.02, -hl + 0.15); // wing
    for (const sx of [-1, 1]) box('trim', 0.06, 0.18, 0.06, sx * (hw - 0.4), 0.92, -hl + 0.18);
    for (const sx of [-1, 1]) box('trim', 0.03, 0.18, 0.6, sx * (hw + 0.005), 0.45, -0.6); // side intakes
  }

  // Bumpers, grille, lights, plates, mirrors.
  // the bevel pushes the body out by `bevel`, so everything on the nose and tail sits just proud of it
  const noseZ = hl + bevel + 0.01, tailZ = -hl - bevel - 0.01;
  if (model !== 'keke') {
    box('trim', W + 0.02, 0.2, 0.14, 0, y0 + 0.1, hl + bevel);
    box('trim', W + 0.02, 0.2, 0.14, 0, y0 + 0.1, -hl - bevel);
    box('trim', W * 0.42, 0.14, 0.04, 0, lightY - 0.02, noseZ); // grille
    box('rim', 0.42, 0.12, 0.02, 0, y0 + 0.24, tailZ - 0.07); // plate
    for (const sx of [-1, 1]) {
      box('head', 0.36, 0.12, 0.06, sx * (hw - 0.3), lightY, noseZ);
      box('tail', 0.32, 0.12, 0.06, sx * (hw - 0.26), lightY + (model === 'danfo' ? 0.1 : 0.04), tailZ);
      box('head', 0.14, 0.05, 0.04, sx * (hw - 0.18), y0 + 0.2, noseZ + 0.05); // indicators/fog lamps
      if (s.cabin && !open) {
        const [mz, my] = s.cabin[0];
        box('paint', 0.18, 0.1, 0.1, sx * (hw + 0.07), my + 0.12, mz - 0.25);
      }
    }
  } else {
    box('head', 0.22, 0.14, 0.06, 0, lightY + 0.2, noseZ - 0.1);
    for (const sx of [-1, 1]) box('tail', 0.14, 0.1, 0.05, sx * (hw - 0.2), 0.7, tailZ);
  }

  // Wheels: tyre, rim with a hub, set into the arches.
  const tyreW = model === 'keke' ? 0.18 : 0.26;
  for (const a of s.axles) {
    for (const sx of a.single ? [0] : [-1, 1]) {
      const x = sx * (hw - tyreW / 2 - 0.04);
      const tyre = new THREE.CylinderGeometry(r, r, tyreW, 14);
      tyre.rotateZ(Math.PI / 2);
      tyre.translate(x, r, a.z);
      P.trim.push(tyre);
      if (sx !== 0) {
        const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.04, 10);
        rim.rotateZ(Math.PI / 2);
        rim.translate(x + sx * (tyreW / 2 + 0.005), r, a.z);
        P.rim.push(rim);
        const hub = new THREE.CylinderGeometry(r * 0.18, r * 0.18, 0.06, 6);
        hub.rotateZ(Math.PI / 2);
        hub.translate(x + sx * (tyreW / 2 + 0.03), r, a.z);
        P.trim.push(hub);
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.BoxGeometry(0.02, r * 1.1, 0.05);
          sp.rotateX((k / 5) * Math.PI);
          sp.translate(x + sx * (tyreW / 2 + 0.02), r, a.z);
          P.trim.push(sp);
        }
      }
    }
  }

  const out = {} as Record<CarPart, THREE.BufferGeometry | null>;
  for (const part of CAR_PARTS) {
    const list = P[part].map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      n.deleteAttribute('uv');
      if (n !== g) g.dispose();
      return n;
    });
    out[part] = list.length ? mergeGeometries(list) : null;
    if (out[part]) out[part]!.computeBoundingSphere();
    list.forEach((g) => g.dispose());
  }
  return out;
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

/** Materials per part. Lights glow past the bloom threshold. */
export function carMaterial(part: CarPart, paint?: string): THREE.Material {
  switch (part) {
    case 'paint':
      return new THREE.MeshStandardMaterial({ color: paint ?? '#ffffff', flatShading: true, roughness: 0.35, metalness: 0.35 });
    case 'glass':
      return new THREE.MeshStandardMaterial({ color: '#1B2436', flatShading: true, roughness: 0.12, metalness: 0.6 });
    case 'trim':
      return new THREE.MeshStandardMaterial({ color: '#18191C', flatShading: true, roughness: 0.8, metalness: 0.1 });
    case 'rim':
      return new THREE.MeshStandardMaterial({ color: '#C8CDD3', flatShading: true, roughness: 0.3, metalness: 0.8 });
    case 'head':
      return new THREE.MeshStandardMaterial({ color: '#FFF6D8', emissive: '#FFF1C4', emissiveIntensity: 1.6, toneMapped: false });
    case 'tail':
      return new THREE.MeshStandardMaterial({ color: '#B3001B', emissive: '#FF1E2D', emissiveIntensity: 1.3, toneMapped: false });
  }
}
