import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Parts, faceTowards, remap, slab } from './meshParts';
import type { Livery, LogoMark } from './planeLiveries';

// Procedural planes: a narrow-body airliner, a regional jet with rear engines and a T-tail, a business jet and a
// helicopter. Each is built facing +z with its wheels (or skids) on y = 0, in five merged, vertex-coloured parts:
// body (paint, glass, logo), gear, steady nav lights, strobes, and the helicopter's rotors. Geometry is cached per
// model and livery, so a plane costs four or five draw calls however much detail it carries.

import { PLANE_SIZE, type PlaneKind } from '@/lib/world/aircraft';

export type { PlaneKind };

export type PlaneModel = {
  body: THREE.BufferGeometry;
  gear: THREE.BufferGeometry | null;
  nav: THREE.BufferGeometry | null;
  strobe: THREE.BufferGeometry | null;
  rotor?: { geometry: THREE.BufferGeometry; at: [number, number, number]; axis: 'y' | 'x' }[];
  /** nose-to-tail length and wingspan, for spacing and cameras */
  length: number;
  span: number;
  /** the front passenger door on the left (+x) side: where a jet bridge or stairs meet the plane */
  door: { x: number; y: number; z: number };
};

type Wing = { y: number; le: number; root: number; tip: number; span: number; sweep: number; dihedral: number; t: number; winglet: number };
type Engine = { x: number; y: number; z: number; r: number; len: number; rear?: boolean };
type Spec = {
  L: number;
  R: number;
  cy: number;
  nose: number;
  tail: number;
  /** tail cone rise and nose droop */
  up: number;
  droop: number;
  /** radius left at the tail cone's tip, as a fraction of R */
  tailEnd: number;
  wing: Wing;
  engines: Engine[];
  fin: { le: number; root: number; tip: number; h: number; sweep: number; t: number };
  stab: { le: number; root: number; tip: number; span: number; sweep: number; t: number; tTail: boolean };
  windows: { from: number; to: number; step: number; w: number; h: number; angle: number };
  doors: number[];
  gear: { nose: number; main: number; mainX: number; wheel: number };
};

const SPECS: Record<Exclude<PlaneKind, 'heli'>, Spec> = {
  airliner: {
    L: PLANE_SIZE.airliner.length, R: 0.95, cy: 1.75, nose: 2.5, tail: 4.2, up: 0.5, droop: 0.22, tailEnd: 0.16,
    wing: { y: 1.25, le: 2.0, root: 3.5, tip: 1.0, span: 7.4, sweep: 3.0, dihedral: 0.09, t: 0.3, winglet: 0.7 },
    engines: [{ x: 2.7, y: 0.78, z: 1.5, r: 0.5, len: 2.2 }],
    fin: { le: -4.3, root: 3.1, tip: 1.3, h: 3.0, sweep: 2.0, t: 0.2 },
    stab: { le: -5.9, root: 1.7, tip: 0.65, span: 3.0, sweep: 1.15, t: 0.14, tTail: false },
    windows: { from: 5.2, to: -4.6, step: 0.4, w: 0.2, h: 0.14, angle: 1.2 },
    doors: [6.0, -5.2],
    gear: { nose: 6.2, main: -0.75, mainX: 1.05, wheel: 0.3 },
  },
  regional: {
    L: PLANE_SIZE.regional.length, R: 0.68, cy: 1.22, nose: 2.0, tail: 3.2, up: 0.32, droop: 0.15, tailEnd: 0.2,
    wing: { y: 0.82, le: 0.9, root: 2.4, tip: 0.75, span: 5.4, sweep: 1.9, dihedral: 0.07, t: 0.22, winglet: 0.55 },
    engines: [{ x: 1.15, y: 1.5, z: -3.2, r: 0.36, len: 1.9, rear: true }],
    fin: { le: -3.4, root: 2.5, tip: 1.4, h: 2.4, sweep: 1.7, t: 0.16 },
    stab: { le: 0, root: 1.3, tip: 0.6, span: 2.3, sweep: 0.8, t: 0.12, tTail: true },
    windows: { from: 3.7, to: -2.3, step: 0.42, w: 0.17, h: 0.13, angle: 1.18 },
    doors: [4.6],
    gear: { nose: 4.7, main: -1.0, mainX: 0.85, wheel: 0.24 },
  },
  jet: {
    L: PLANE_SIZE.jet.length, R: 0.6, cy: 1.1, nose: 2.3, tail: 2.6, up: 0.28, droop: 0.12, tailEnd: 0.2,
    wing: { y: 0.72, le: 0.7, root: 2.0, tip: 0.6, span: 4.9, sweep: 1.6, dihedral: 0.08, t: 0.18, winglet: 0.75 },
    engines: [{ x: 1.05, y: 1.4, z: -2.4, r: 0.33, len: 1.75, rear: true }],
    fin: { le: -2.8, root: 2.0, tip: 1.1, h: 2.0, sweep: 1.6, t: 0.14 },
    stab: { le: 0, root: 1.0, tip: 0.5, span: 1.8, sweep: 0.7, t: 0.1, tTail: true },
    windows: { from: 2.3, to: -1.2, step: 0.62, w: 0.26, h: 0.22, angle: 1.2 },
    doors: [3.0],
    gear: { nose: 3.4, main: -0.75, mainX: 0.75, wheel: 0.21 },
  },
};

const GLASS = '#18212F';
const TYRE = '#1A1B1E';
const METAL = '#AEB5BE';
const DARK = '#3B4048';
const RED = '#FF2A2A';
const GREEN = '#1FFF6A';
const LAMP = '#FFF4DA';

const CACHE = new Map<string, PlaneModel>();

export function planeModel(kind: PlaneKind, livery: Livery): PlaneModel {
  const key = `${kind}|${livery.key}`;
  let m = CACHE.get(key);
  if (!m) CACHE.set(key, (m = kind === 'heli' ? buildHeli(livery) : buildPlane(SPECS[kind], livery)));
  return m;
}

const lerpCol = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

function buildPlane(s: Spec, lv: Livery): PlaneModel {
  const body = new Parts(), gear = new Parts(), nav = new Parts(), strobe = new Parts();
  const { L, R, nose, tail } = s;
  const zt = -L / 2 + tail, zn = L / 2 - nose;
  const rad = (z: number) => {
    if (z < zt) {
      const u = Math.max(0, (z + L / 2) / tail);
      return R * (s.tailEnd + (1 - s.tailEnd) * (1 - (1 - u) * (1 - u)));
    }
    if (z > zn) return R * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, (z - zn) / nose), 2.3)));
    return R;
  };
  const cyAt = (z: number) => s.cy + (z < zt ? s.up * Math.pow((zt - z) / tail, 1.5) : 0) - (z > zn ? s.droop * Math.pow((z - zn) / nose, 2) : 0);

  // ---- fuselage: a lathe of the side profile, the tail swept up and the nose drooped, painted face by face
  const zs: number[] = [];
  for (let i = 0; i <= 10; i++) zs.push(-L / 2 + (tail * i) / 10);
  for (let i = 1; i < 6; i++) zs.push(zt + ((zn - zt) * i) / 6);
  for (let i = 0; i <= 16; i++) zs.push(zn + nose * (1 - Math.pow(1 - i / 16, 1.5)));
  const lathe = new THREE.LatheGeometry(zs.map((z) => new THREE.Vector2(rad(z), z)), 32);
  lathe.rotateX(Math.PI / 2); // lathe axis (y) becomes z: nose towards +z
  const lp = lathe.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setY(i, lp.getY(i) + cyAt(lp.getZ(i)));
  lathe.computeVertexNormals();
  const cheatAt = (z: number) => (Array.isArray(lv.cheat) ? lerpCol(lv.cheat[1], lv.cheat[0], (z + L / 2) / L) : lv.cheat);
  // the cockpit windscreen is a band of the nose's own faces, leaving a centre post
  const glass0 = zn + nose * 0.2, glass1 = zn + nose * 0.42;
  body.addFaces(lathe, (x, y, z) => {
    const deg = (Math.atan2(Math.abs(x), y - cyAt(z)) * 180) / Math.PI; // 0 on top, 180 underneath
    if (z > glass0 && z < glass1 && deg > 11 && deg < 80) return GLASS;
    if (deg > 124) return lv.belly;
    if (deg > 90 && deg < 101.5 && z < zn + nose * 0.55) return cheatAt(z);
    return lv.top;
  }, true);
  // tail cone tip: the APU exhaust
  const cap = new THREE.CircleGeometry(rad(-L / 2) * 1.02, 12);
  cap.rotateY(Math.PI);
  cap.translate(0, cyAt(-L / 2), -L / 2);
  body.add(cap, DARK);

  // ---- cabin windows and doors
  const { windows: win } = s;
  const n = new THREE.Vector3(), p = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    const th = win.angle;
    n.set(sx * Math.sin(th), Math.cos(th), 0);
    for (let z = win.from; z >= win.to; z -= win.step) {
      if (s.doors.some((d) => Math.abs(d - z) < 0.55)) continue;
      p.set(sx * rad(z) * Math.sin(th), cyAt(z) + rad(z) * Math.cos(th), z).addScaledVector(n, 0.005);
      body.patch(GLASS, win.w, win.h, 0.03, p, n);
    }
    for (const z of s.doors) {
      const th2 = 1.42;
      n.set(sx * Math.sin(th2), Math.cos(th2), 0);
      p.set(sx * rad(z) * Math.sin(th2), cyAt(z) + rad(z) * Math.cos(th2), z);
      body.patch('#8E96A1', R * 1.05, R * 0.52, 0.02, p.clone().addScaledVector(n, 0.004), n);
      body.patch(lv.top, R * 0.95, R * 0.44, 0.03, p.clone().addScaledVector(n, 0.008), n);
      body.patch(GLASS, 0.12, 0.1, 0.035, p.clone().addScaledVector(n, 0.01).add(new THREE.Vector3(0, R * 0.25, 0)), n);
    }
  }

  // ---- wings, winglets, flap-track fairings and the belly fairing
  const w = s.wing;
  const tipLE = w.le - w.sweep, tipTE = tipLE - w.tip;
  for (const sx of [-1, 1]) {
    const yAt = (a: number) => w.y + a * Math.tan(w.dihedral);
    const g = remap(slab([[0, w.le], [w.span, tipLE], [w.span, tipTE], [0, w.le - w.root]], w.t), (v) => {
      const a = v.x;
      v.set(sx * a, yAt(a) + v.z * (1 - (0.6 * a) / w.span), v.y);
    });
    body.add(g, lv.wing);
    // a darker strip along the trailing edge reads as the flaps: (a, f) runs out along the span and forward from the edge
    const chordAt = (a: number) => w.root + (w.tip - w.root) * (a / w.span);
    const teAt = (a: number) => w.le - (w.sweep * a) / w.span - chordAt(a);
    const flaps = remap(slab([[w.span * 0.1, 0], [w.span * 0.72, 0], [w.span * 0.72, 0.22], [w.span * 0.1, 0.22]], 0.02), (v) => {
      const a = v.x;
      v.set(sx * a, yAt(a) + (w.t / 2) * (1 - (0.6 * a) / w.span) + 0.008 + v.z, teAt(a) + v.y * chordAt(a));
    });
    body.add(flaps, '#AEB6C0');
    if (w.winglet) {
      const wl = remap(slab([[tipLE + 0.1, 0], [tipLE - w.tip * 0.55, w.winglet], [tipLE - w.tip * 0.95, w.winglet], [tipTE + 0.02, 0]], 0.07), (v) => {
        const h = v.y;
        v.set(sx * (w.span - 0.02 + v.z + h * 0.18), yAt(w.span) + h, v.x);
      });
      body.add(wl, lv.winglet);
    }
    for (const f of [0.28, 0.52, 0.76]) {
      const a = w.span * f;
      body.box(lv.wing, 0.14, 0.14, chordAt(a) * 0.55, sx * a, yAt(a) - w.t * 0.45, teAt(a) + chordAt(a) * 0.18);
    }
    // nav lights at the tips: red on the left (+x), green on the right
    const tipY = yAt(w.span);
    nav.add(new THREE.OctahedronGeometry(0.09, 0).translate(sx * (w.span + 0.04), tipY, tipLE - 0.1), sx > 0 ? RED : GREEN, 3.5);
    strobe.add(new THREE.OctahedronGeometry(0.08, 0).translate(sx * (w.span + 0.04), tipY, tipTE + 0.05), '#FFFFFF', 5);
    // landing lights in the wing roots
    nav.add(new THREE.BoxGeometry(0.22, 0.08, 0.04).translate(sx * (R + 0.35), yAt(R + 0.35), w.le - 0.35 * ((R + 0.35) / w.span) * w.sweep + 0.01), LAMP, 2.2);
  }
  body.box(lv.belly, R * 1.6, 0.5, w.root * 1.25, 0, w.y - 0.08, w.le - w.root * 0.5);

  // ---- engines: under the wings on pylons, or on the rear fuselage
  for (const e of s.engines)
    for (const sx of [-1, 1]) {
      const ex = sx * e.x;
      const shell = new THREE.LatheGeometry(
        [
          [0.55, -e.len / 2],
          [0.82, -e.len * 0.32],
          [0.97, -e.len * 0.05],
          [1.0, e.len * 0.3],
          [0.97, e.len / 2 - 0.06],
          [0.86, e.len / 2],
        ].map(([r, h]) => new THREE.Vector2(r * e.r, h)),
        16,
      );
      shell.rotateX(Math.PI / 2);
      shell.translate(ex, e.y, e.z);
      body.add(shell, lv.engine);
      const lip = new THREE.TorusGeometry(e.r * 0.9, e.r * 0.07, 6, 16);
      lip.translate(ex, e.y, e.z + e.len / 2 - 0.01);
      body.add(lip, METAL);
      body.add(new THREE.CircleGeometry(e.r * 0.86, 16).translate(ex, e.y, e.z + e.len / 2 - 0.12), '#23272E');
      body.add(new THREE.ConeGeometry(e.r * 0.24, e.r * 0.42, 10).rotateX(Math.PI / 2).translate(ex, e.y, e.z + e.len / 2 - 0.02), METAL);
      body.add(new THREE.ConeGeometry(e.r * 0.42, e.r * 1.1, 10).rotateX(-Math.PI / 2).translate(ex, e.y, e.z - e.len / 2 - e.r * 0.5), '#5E656F');
      if (e.rear) {
        // a short stub wing from the fuselage side
        const inner = sx * (rad(e.z) * 0.8);
        body.box(lv.top, Math.abs(ex - inner) - e.r * 0.6, 0.12, e.len * 0.55, (ex + inner) / 2 - sx * e.r * 0.3, e.y, e.z - e.len * 0.08);
      } else {
        const top = w.y + e.x * Math.tan(w.dihedral) - w.t * 0.3;
        body.box(lv.wing, 0.13, top - (e.y + e.r * 0.8), e.len * 0.8, ex, (top + e.y + e.r * 0.8) / 2, e.z - e.len * 0.1, 0.0);
      }
    }

  // ---- tail: fin with the logo, and the stabilisers (low, or on top of the fin)
  const f = s.fin;
  const finBase = cyAt(f.le - f.root * 0.5) + rad(f.le - f.root * 0.5) * 0.55;
  const fin = remap(slab([[f.le + 0.3, -0.25], [f.le - f.sweep, f.h], [f.le - f.sweep - f.tip, f.h], [f.le - f.root, -0.25]], f.t), (v) => {
    v.set(v.z * (1 - (0.5 * Math.max(0, v.y)) / f.h), finBase + v.y, v.x);
  });
  body.add(fin, lv.fin);
  if (lv.logo) {
    const midH = f.h * 0.48;
    const zMid = f.le - (f.sweep * midH) / f.h - (f.root + ((f.tip - f.root) * midH) / f.h) / 2;
    const size = Math.min(f.h * 0.62, (f.root + f.tip) * 0.42);
    for (const sx of [-1, 1]) addLogo(body, lv.logo, size, sx, (f.t * (1 - (0.5 * midH) / f.h)) / 2 + 0.006, finBase + midH, zMid);
  }
  const st = s.stab;
  const stY = st.tTail ? finBase + f.h - 0.02 : cyAt(st.le - st.root / 2) + 0.12;
  const stLE = st.tTail ? f.le - f.sweep + 0.05 : st.le;
  for (const sx of [-1, 1]) {
    const g = remap(slab([[0, stLE], [st.span, stLE - st.sweep], [st.span, stLE - st.sweep - st.tip], [0, stLE - st.root]], st.t), (v) => {
      v.set(sx * v.x, stY + v.z + v.x * 0.08, v.y);
    });
    body.add(g, st.tTail ? lv.fin : lv.top);
  }
  // tail light, and the beacons top and bottom
  nav.add(new THREE.OctahedronGeometry(0.07, 0).translate(0, cyAt(-L / 2) + 0.05, -L / 2 - 0.05), '#FFFFFF', 3);
  strobe.add(new THREE.OctahedronGeometry(0.08, 0).translate(0, s.cy + R + 0.04, 0.3), RED, 4);
  strobe.add(new THREE.OctahedronGeometry(0.08, 0).translate(0, s.cy - R - 0.04, -1.0), RED, 4);

  // ---- landing gear: twin-wheel nose leg and two twin-wheel main legs, with a taxi light on the nose leg
  const g = s.gear, wr = g.wheel;
  const legs: [number, number, number][] = [[0, cyAt(g.nose) - rad(g.nose) * 0.8, g.nose], [-g.mainX, w.y - 0.1, g.main], [g.mainX, w.y - 0.1, g.main]];
  legs.forEach(([x, top, z], i) => {
    gear.rod(METAL, [x, wr, z], [x, top, z], i ? 0.07 : 0.05, 6);
    const half = i ? 0.17 : 0.12;
    gear.rod(METAL, [x - half, wr, z], [x + half, wr, z], 0.035, 5);
    for (const side of [-1, 1]) {
      const tyre = new THREE.CylinderGeometry(i ? wr : wr * 0.8, i ? wr : wr * 0.8, i ? 0.17 : 0.12, 12);
      tyre.rotateZ(Math.PI / 2);
      tyre.translate(x + side * half, i ? wr : wr * 0.8, z);
      gear.add(tyre, TYRE);
      const hub = new THREE.CylinderGeometry(wr * 0.45, wr * 0.45, 0.02, 8);
      hub.rotateZ(Math.PI / 2);
      hub.translate(x + side * (half + (i ? 0.09 : 0.065)), i ? wr : wr * 0.8, z);
      gear.add(hub, METAL);
    }
    if (i) gear.box(lv.belly, 0.04, (top - wr) * 0.7, 0.55, x + Math.sign(x) * 0.14, (top + wr) / 2 + 0.1, z);
    else gear.add(new THREE.BoxGeometry(0.1, 0.07, 0.04).translate(0, (top + wr) / 2, z + 0.06), LAMP);
  });

  return {
    body: body.build()!,
    gear: gear.build(),
    nav: nav.build(),
    strobe: strobe.build(),
    length: L,
    span: w.span * 2,
    door: { x: R, y: cyAt(s.doors[0]) - R * 0.35, z: s.doors[0] },
  };
}

// ---------------------------------------------------------------- logos

const LOGO_CACHE = new Map<string, THREE.BufferGeometry[]>();

/** The logo's triangles in its 24 x 24 box (x right, y up, centred on 0), one geometry per shape. */
function logoShapes(mark: LogoMark): THREE.BufferGeometry[] {
  let list = LOGO_CACHE.get(mark.d);
  if (list) return list;
  list = [];
  if (typeof DOMParser !== 'undefined') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${mark.d}"/></svg>`;
    for (const path of new SVGLoader().parse(svg).paths)
      for (const shape of SVGLoader.createShapes(path)) {
        const g = new THREE.ShapeGeometry(shape, 6);
        g.translate(-12, -12, 0);
        g.scale(1, -1, 1); // svg y runs down
        list.push(g);
      }
  }
  LOGO_CACHE.set(mark.d, list);
  return list;
}

/** Lay the logo flat on the fin's side `sx`, centred at (y, z), readable from that side. */
function addLogo(parts: Parts, mark: LogoMark, size: number, sx: number, x: number, y: number, z: number) {
  const k = size / 24;
  const colourAt = (u: number, v: number) =>
    Array.isArray(mark.fill) ? lerpCol(mark.fill[0], mark.fill[1], ((u + 12) / 24 + (v + 12) / 24) / 2) : new THREE.Color(mark.fill);
  for (const shape of logoShapes(mark)) {
    const g = shape.clone().toNonIndexed();
    const pos = g.attributes.position;
    // seen from +x the nose is on the left, so the mark's right runs towards the tail
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, sx * x, y + pos.getY(i) * k, z - sx * pos.getX(i) * k);
    faceTowards(g, new THREE.Vector3(sx, 0, 0));
    const piece = parts.add(g, '#FFFFFF');
    // colour by position (the gradient runs bottom-left to top-right of the mark)
    const c = piece.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const col = colourAt((sx * (z - pos.getZ(i))) / k, (pos.getY(i) - y) / k);
      c.setXYZ(i, col.r, col.g, col.b);
    }
  }
}

// ---------------------------------------------------------------- helicopter

function buildHeli(lv: Livery): PlaneModel {
  const body = new Parts(), gear = new Parts(), nav = new Parts(), strobe = new Parts(), rotor = new Parts(), tailRotor = new Parts();
  const cy = 1.3, R = 0.85;
  const rad = (z: number) => (z > 0.5 ? R * Math.sqrt(Math.max(0, 1 - Math.pow((z - 0.5) / 1.9, 2))) : z > -0.5 ? R : Math.max(0.24, R - ((-0.5 - z) / 1.2) * (R - 0.24)));
  const cyAt = (z: number) => cy + (z < -0.5 ? 0.35 * Math.min(1, (-0.5 - z) / 1.2) : 0) - (z > 0.5 ? 0.18 * Math.pow((z - 0.5) / 1.9, 2) : 0);
  const zs: number[] = [];
  for (let i = 0; i <= 8; i++) zs.push(-1.7 + (1.2 * i) / 8);
  zs.push(0);
  for (let i = 0; i <= 12; i++) zs.push(0.5 + 1.9 * (1 - Math.pow(1 - i / 12, 1.7)));
  const lathe = new THREE.LatheGeometry(zs.map((z) => new THREE.Vector2(rad(z), z)), 24);
  lathe.rotateX(Math.PI / 2);
  const lp = lathe.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    lp.setY(i, lp.getY(i) + cyAt(lp.getZ(i)));
    lp.setX(i, lp.getX(i) * 0.88); // a little narrower than tall
  }
  lathe.computeVertexNormals();
  const stripe = Array.isArray(lv.cheat) ? lv.cheat[0] : lv.cheat;
  body.addFaces(lathe, (x, y, z) => {
    const deg = (Math.atan2(Math.abs(x) / 0.88, y - cyAt(z)) * 180) / Math.PI;
    if (z > 0.95 && deg < 112) return GLASS; // the bubble canopy
    if (z > -0.3 && z < 0.9 && deg > 50 && deg < 95) return GLASS; // cabin side windows
    if (deg > 125) return lv.belly;
    if (deg > 100 && deg < 118) return stripe;
    return lv.fin;
  }, true);
  body.add(new THREE.CircleGeometry(rad(-1.7), 10).rotateY(Math.PI).translate(0, cyAt(-1.7), -1.7), lv.fin);
  // engine cowling and mast on top
  body.box(lv.fin, 0.8, 0.42, 1.6, 0, cy + R * 0.92, -0.35);
  body.box(DARK, 0.5, 0.18, 0.3, 0, cy + R * 0.92, -1.25);
  body.rod(METAL, [0, cy + R + 0.1, 0], [0, cy + R + 0.55, 0], 0.07, 6);
  // tail boom, fin, stabiliser
  body.rod(lv.fin, [0, cyAt(-1.6), -1.6], [0, cy + 0.55, -5.2], 0.22, 10, 0.11);
  body.add(
    remap(slab([[-4.75, -0.1], [-5.15, 1.2], [-5.55, 1.2], [-5.4, -0.1]], 0.07), (v) => v.set(v.z, cy + 0.5 + v.y, v.x)),
    lv.fin,
  );
  body.box(stripe, 1.5, 0.05, 0.42, 0, cy + 0.52, -4.4);
  // skids
  for (const sx of [-1, 1]) {
    gear.rod(DARK, [sx * 0.8, 0.07, -1.25], [sx * 0.8, 0.07, 1.3], 0.05, 6);
    gear.rod(DARK, [sx * 0.8, 0.07, 1.3], [sx * 0.8, 0.28, 1.75], 0.05, 6);
    for (const z of [-0.65, 0.8]) gear.rod(DARK, [sx * 0.8, 0.07, z], [sx * 0.42, cyAt(z) - R * 0.82, z], 0.04, 5);
  }
  // main rotor: hub and four blades; tail rotor: two blades turning about x
  rotor.add(new THREE.CylinderGeometry(0.18, 0.2, 0.18, 8), DARK);
  for (let k = 0; k < 4; k++) rotor.add(new THREE.BoxGeometry(4.1, 0.04, 0.24).translate(2.1, 0.05, 0).rotateY((k * Math.PI) / 2), '#2A2E35');
  for (let k = 0; k < 2; k++) tailRotor.box('#2A2E35', 0.04, 1.15, 0.13, 0, 0, 0, (k * Math.PI) / 2, 0, 0);
  tailRotor.add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6).rotateZ(Math.PI / 2), DARK);
  nav.add(new THREE.OctahedronGeometry(0.06, 0).translate(0.76, cy + 0.53, -4.4), RED, 3.5);
  nav.add(new THREE.OctahedronGeometry(0.06, 0).translate(-0.76, cy + 0.53, -4.4), GREEN, 3.5);
  nav.add(new THREE.BoxGeometry(0.22, 0.08, 0.05).translate(0, cyAt(1.9) - 0.55, 1.7), LAMP, 2.2);
  strobe.add(new THREE.OctahedronGeometry(0.07, 0).translate(0, cy + 1.75, -5.45), RED, 4);
  strobe.add(new THREE.OctahedronGeometry(0.07, 0).translate(0, cy - R - 0.03, -0.2), RED, 4);
  return {
    body: body.build()!,
    gear: gear.build(),
    nav: nav.build(),
    strobe: strobe.build(),
    rotor: [
      { geometry: rotor.build()!, at: [0, cy + R + 0.6, 0], axis: 'y' },
      { geometry: tailRotor.build()!, at: [0.17, cy + 0.85, -5.3], axis: 'x' },
    ],
    length: PLANE_SIZE.heli.length,
    span: PLANE_SIZE.heli.span,
    door: { x: R * 0.88, y: 0.5, z: 0.2 },
  };
}
