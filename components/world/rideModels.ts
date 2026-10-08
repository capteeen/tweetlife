import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAMP, type LampKind } from './vehicleLights';

// The two-wheelers you can ride: a dock share bike and a rental e-scooter. Built from tubes and boxes, coloured per
// vertex and merged, so each is a handful of draw calls: the body, its lamps, the wheels, and on the bike the
// crank and pedals (which turn). Both face +z with the wheels on the ground at y = 0. The rider's right is -x.

type Piece = { g: THREE.BufferGeometry; color: string; lamp?: LampKind };

export type TwoWheeler = {
  body: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** wheel centres */
  wheels: { y: number; z: number; r: number }[];
  /** the crank (chainring and arms), turned about x at `bb`; bike only */
  crank: THREE.BufferGeometry | null;
  /** one pedal, kept level at the end of each crank arm; bike only */
  pedal: THREE.BufferGeometry | null;
  bb: { y: number; z: number };
  crankR: number;
};

const BIKE_TEAL = '#06D6A0';
const BIKE_DARK = '#1F2226';
const SCOOTER_TEAL = '#2EC4B6';
const RUBBER = '#141518';
const CHROME = '#C8CDD3';

class Kit {
  pieces: Piece[] = [];
  lamps: Piece[] = [];
  add(g: THREE.BufferGeometry, color: string, lamp?: LampKind) {
    (lamp == null ? this.pieces : this.lamps).push({ g, color, lamp });
  }
  /** a round tube from a to b */
  tube(a: [number, number, number], b: [number, number, number], r: number, color: string, seg = 8) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(g, color);
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0, lamp?: LampKind) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    this.add(g, color, lamp);
  }
  ball(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string) {
    const g = new THREE.SphereGeometry(1, 10, 6);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    this.add(g, color);
  }
  /** an arc of a ring standing in the yz plane round (y, z); angles from -z (behind) over the top (pi/2) to +z */
  arc(R: number, tube: number, from: number, to: number, y: number, z: number, color: string, x = 0, flat = 1) {
    const g = new THREE.TorusGeometry(R, tube, 4, 14, to - from);
    g.scale(1, 1, flat);
    g.rotateZ(from);
    g.rotateY(Math.PI / 2);
    g.translate(x, y, z);
    this.add(g, color);
  }
  merge() {
    return merge(this.pieces, false)!;
  }
  mergeLamps() {
    return merge(this.lamps, true)!;
  }
}

function merge(pieces: Piece[], lamps: boolean) {
  if (!pieces.length) return null;
  const list = pieces.map(({ g, color, lamp }) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.deleteAttribute('uv');
    const count = n.getAttribute('position').count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr.set([c.r, c.g, c.b], i * 3);
    n.setAttribute(lamps ? 'lampColor' : 'color', new THREE.BufferAttribute(arr, 3));
    if (lamps) n.setAttribute('lamp', new THREE.BufferAttribute(new Float32Array(count).fill(lamp ?? LAMP.sign), 1));
    return n;
  });
  const out = mergeGeometries(list);
  out.computeBoundingSphere();
  list.forEach((g) => g.dispose());
  return out;
}

/** A spoked wheel: tyre, rim, hub and two crossed sets of spokes, axle along x. */
function spokedWheel(r: number) {
  const k = new Kit();
  const tyre = new THREE.TorusGeometry(r - 0.022, 0.022, 6, 28);
  tyre.rotateY(Math.PI / 2);
  k.add(tyre, RUBBER);
  const rim = new THREE.TorusGeometry(r - 0.05, 0.009, 4, 28);
  rim.rotateY(Math.PI / 2);
  k.add(rim, CHROME);
  k.tube([-0.05, 0, 0], [0.05, 0, 0], 0.025, '#8E949B', 8);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    // spokes leave the hub flange a little off-centre and meet the rim tangentially
    const ha = a + side * 0.35;
    k.tube([side * 0.04, Math.cos(ha) * 0.03, Math.sin(ha) * 0.03], [0, Math.cos(a) * (r - 0.055), Math.sin(a) * (r - 0.055)], 0.0035, '#AEB4BB', 3);
  }
  return k.merge();
}

/** A small solid wheel: tyre and a five-spoke hub. */
function scooterWheel(r: number) {
  const k = new Kit();
  const tyre = new THREE.TorusGeometry(r - 0.03, 0.03, 6, 20);
  tyre.rotateY(Math.PI / 2);
  k.add(tyre, RUBBER);
  k.tube([-0.025, 0, 0], [0.025, 0, 0], r - 0.04, '#3A3E44', 12);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box(0.056, 0.02, r - 0.06, 0, Math.sin(a) * (r - 0.06) * 0.5, Math.cos(a) * (r - 0.06) * 0.5, '#9BA2AA', -a);
  }
  k.tube([-0.035, 0, 0], [0.035, 0, 0], 0.02, CHROME, 8);
  return k.merge();
}

let bike: TwoWheeler | null = null;
let scooter: TwoWheeler | null = null;

/** The share bike: step-through teal frame, fenders, chain guard, front basket on a rack, rear carrier, lights. */
export function bikeGeo(): TwoWheeler {
  if (bike) return bike;
  const k = new Kit();
  const r = 0.34;
  const BB: [number, number, number] = [0, 0.3, 0.02];
  const RA: [number, number, number] = [0, r, -0.52];
  const FA: [number, number, number] = [0, r, 0.6];
  const ST: [number, number, number] = [0, 0.78, -0.17];
  const HT: [number, number, number] = [0, 0.9, 0.38];
  const HB: [number, number, number] = [0, 0.7, 0.44];
  const LOW: [number, number, number] = [0, 0.4, 0.2];
  // frame: a big swooping down tube (step-through), seat tube, stays
  k.tube(BB, LOW, 0.034, BIKE_TEAL);
  k.tube(LOW, HB, 0.034, BIKE_TEAL);
  k.tube(BB, ST, 0.026, BIKE_TEAL);
  k.tube(HB, HT, 0.032, BIKE_TEAL);
  for (const sx of [-1, 1]) {
    k.tube([sx * 0.05, BB[1], BB[2]], [sx * 0.06, RA[1], RA[2]], 0.015, BIKE_TEAL);
    k.tube([sx * 0.03, ST[1] - 0.04, ST[2]], [sx * 0.06, RA[1] + 0.02, RA[2]], 0.013, BIKE_TEAL);
    // fork legs from the crown to the front axle
    k.tube([sx * 0.04, HB[1] - 0.02, HB[2] + 0.01], [sx * 0.055, FA[1], FA[2]], 0.017, BIKE_DARK);
  }
  k.tube([-0.06, HB[1] - 0.02, HB[2] + 0.01], [0.06, HB[1] - 0.02, HB[2] + 0.01], 0.022, BIKE_DARK); // fork crown
  // seat post, saddle with its rails and springs
  k.tube(ST, [0, 0.86, -0.2], 0.014, CHROME);
  k.ball(0.09, 0.034, 0.15, 0, 0.885, -0.21, '#151619');
  k.ball(0.12, 0.03, 0.08, 0, 0.88, -0.29, '#151619');
  for (const sx of [-1, 1]) k.tube([sx * 0.04, 0.855, -0.3], [sx * 0.04, 0.83, -0.29], 0.01, CHROME, 5);
  // stem and swept-back bars, grips, levers and a bell
  k.tube(HT, [0, 0.98, 0.35], 0.02, BIKE_DARK);
  k.tube([0, 0.98, 0.35], [0, 1.0, 0.31], 0.018, BIKE_DARK);
  for (const sx of [-1, 1]) {
    k.tube([0, 1.0, 0.31], [sx * 0.14, 1.0, 0.31], 0.012, CHROME);
    k.tube([sx * 0.14, 1.0, 0.31], [sx * 0.24, 1.0, 0.25], 0.012, CHROME);
    k.tube([sx * 0.24, 1.0, 0.25], [sx * 0.34, 0.99, 0.2], 0.02, '#232427');
    k.box(0.09, 0.012, 0.02, sx * 0.24, 0.985, 0.29, '#3A3E44', 0.3);
  }
  k.ball(0.025, 0.018, 0.025, 0.1, 1.022, 0.31, '#D9DDE2');
  // fenders over both wheels
  k.arc(r + 0.045, 0.024, 0.3, 2.15, RA[1], RA[2], '#127A63', 0, 1.7);
  k.arc(r + 0.045, 0.024, 1.15, 2.95, FA[1], FA[2], '#127A63', 0, 1.7);
  // chain guard on the right (-x), the rear sprocket and hub gear
  k.box(0.02, 0.1, 0.62, -0.085, 0.31, -0.24, BIKE_TEAL, 0.07);
  k.tube([-0.06, RA[1], RA[2]], [-0.08, RA[1], RA[2]], 0.045, '#5A5F66', 10);
  // front basket on its rack, with the dock number plate on the front
  const by = 0.92, bz = 0.68, bw = 0.42, bh = 0.22, bd = 0.32;
  k.box(bw, 0.012, bd, 0, by - bh / 2, bz, '#2D3035');
  for (const sx of [-1, 1]) k.box(0.012, bh, bd, sx * (bw / 2), by, bz, '#2D3035');
  k.box(bw, bh, 0.012, 0, by, bz - bd / 2, '#2D3035');
  k.box(bw, bh, 0.012, 0, by, bz + bd / 2, '#2D3035');
  for (let i = 1; i < 4; i++) k.box(bw, 0.008, 0.02, 0, by - bh / 2 + i * 0.055, bz + bd / 2 + 0.004, '#3E434A');
  k.box(0.16, 0.08, 0.01, 0, by, bz + bd / 2 + 0.012, '#F4F1DE');
  k.box(0.1, 0.016, 0.012, 0, by, bz + bd / 2 + 0.018, '#0E5E4C');
  for (const sx of [-1, 1]) k.tube([sx * 0.15, by - bh / 2, bz + 0.05], [sx * 0.055, FA[1] + 0.02, FA[2]], 0.01, '#2D3035', 5);
  k.tube([0, by - bh / 2, bz - bd / 2 + 0.02], [0, HT[1] - 0.04, HT[2] + 0.02], 0.012, '#2D3035', 5);
  // rear carrier and reflector
  for (const sx of [-1, 1]) {
    k.tube([sx * 0.07, 0.74, -0.3], [sx * 0.07, 0.74, -0.78], 0.01, BIKE_DARK, 5);
    k.tube([sx * 0.07, 0.74, -0.72], [sx * 0.06, RA[1], RA[2]], 0.01, BIKE_DARK, 5);
  }
  for (let i = 0; i < 4; i++) k.box(0.14, 0.008, 0.012, 0, 0.745, -0.36 - i * 0.12, BIKE_DARK);
  // kickstand, folded along the left chainstay
  k.tube([0.07, 0.28, -0.08], [0.09, 0.24, -0.42], 0.011, '#3A3E44', 5);
  // lamps: a headlight on the basket, a tail light and reflector on the carrier
  k.box(0.07, 0.05, 0.03, 0, by - 0.03, bz + bd / 2 + 0.03, '#FFFFFF', 0, LAMP.head);
  k.box(0.08, 0.035, 0.025, 0, 0.71, -0.8, '#FFFFFF', 0, LAMP.tail);

  // crank: chainring on the right, arms either side (left arm up at angle 0), turned about x at the bottom bracket
  const c = new Kit();
  const crankR = 0.16;
  const ring = new THREE.TorusGeometry(0.095, 0.01, 4, 20);
  ring.rotateY(Math.PI / 2);
  ring.translate(-0.075, 0, 0);
  c.add(ring, '#9BA2AA');
  c.tube([-0.072, 0, 0], [-0.068, 0, 0], 0.08, '#4A4F56', 12);
  c.tube([-0.1, 0, 0], [0.1, 0, 0], 0.022, '#5A5F66', 8);
  c.box(0.02, crankR + 0.02, 0.035, 0.1, crankR / 2, 0, '#3A3E44');
  c.box(0.02, crankR + 0.02, 0.035, -0.1, -crankR / 2, 0, '#3A3E44');
  const p = new Kit();
  p.box(0.1, 0.024, 0.07, 0, 0, 0, '#1C1D20');
  p.box(0.1, 0.01, 0.012, 0, 0, 0.04, '#E0A030'); // reflector strip

  bike = {
    body: k.merge(), lamp: k.mergeLamps(), wheel: spokedWheel(r),
    wheels: [{ y: FA[1], z: FA[2], r }, { y: RA[1], z: RA[2], r }],
    crank: c.merge(), pedal: p.merge(), bb: { y: BB[1], z: BB[2] }, crankR,
  };
  return bike;
}

/** The rental e-scooter: low deck with grip tape, a tall stem with a display and a light, fenders, kickstand. */
export function scooterGeo(): TwoWheeler {
  if (scooter) return scooter;
  const k = new Kit();
  const fr = 0.12, rr = 0.11;
  const FZ = 0.52, RZ = -0.5;
  // deck, grip tape, the battery under it, and a kicktail over the rear wheel
  k.box(0.2, 0.06, 0.86, 0, 0.15, 0, '#2B2D31');
  k.box(0.17, 0.008, 0.78, 0, 0.184, -0.01, '#0F1012');
  k.box(0.16, 0.05, 0.6, 0, 0.1, 0.02, '#202226');
  k.box(0.18, 0.02, 0.2, 0, 0.2, -0.47, SCOOTER_TEAL, -0.25);
  for (const sx of [-1, 1]) k.box(0.012, 0.03, 0.8, sx * 0.104, 0.15, 0, SCOOTER_TEAL); // side stripes
  // rear fork and fender
  for (const sx of [-1, 1]) k.tube([sx * 0.05, 0.14, -0.38], [sx * 0.05, rr, RZ], 0.014, '#2B2D31', 6);
  k.arc(rr + 0.03, 0.02, 0.2, 1.9, rr, RZ, SCOOTER_TEAL, 0, 1.5);
  // the neck rising from the deck front, the stem, the folding clamp, front fork and fender
  k.tube([0, 0.18, 0.4], [0, 0.32, 0.5], 0.03, '#2B2D31');
  const top: [number, number, number] = [0, 1.08, 0.57];
  k.tube([0, 0.3, 0.5], top, 0.024, SCOOTER_TEAL);
  k.tube([0, 0.36, 0.505], [0, 0.42, 0.51], 0.032, '#2B2D31');
  for (const sx of [-1, 1]) k.tube([sx * 0.045, 0.3, 0.5], [sx * 0.045, fr, FZ], 0.014, '#2B2D31', 6);
  k.arc(fr + 0.03, 0.02, 1.1, 2.7, fr, FZ, SCOOTER_TEAL, 0, 1.5);
  // bars, grips, brake lever, bell, the display and the QR plate
  k.tube([-0.25, top[1], top[2]], [0.25, top[1], top[2]], 0.014, '#2B2D31');
  for (const sx of [-1, 1]) k.tube([sx * 0.17, top[1], top[2]], [sx * 0.27, top[1], top[2]], 0.021, '#141518');
  k.box(0.08, 0.012, 0.02, 0.15, top[1] - 0.01, top[2] + 0.035, '#3A3E44', 0.3);
  k.ball(0.02, 0.016, 0.02, -0.09, top[1] + 0.02, top[2], '#D9DDE2');
  k.box(0.1, 0.03, 0.07, 0, top[1] + 0.025, top[2] - 0.01, '#141518', -0.4);
  k.box(0.06, 0.09, 0.008, 0, 0.75, 0.555, '#F4F1DE', -0.09);
  k.box(0.04, 0.04, 0.009, 0, 0.75, 0.559, '#141518', -0.09);
  // kickstand, folded under the deck
  k.tube([-0.09, 0.1, -0.05], [-0.1, 0.07, -0.3], 0.01, '#3A3E44', 5);
  // lamps: headlight on the stem, the display glowing, a tail light on the kicktail
  k.box(0.07, 0.045, 0.03, 0, 0.98, 0.585, '#FFFFFF', -0.09, LAMP.head);
  k.box(0.06, 0.01, 0.04, 0, top[1] + 0.042, top[2] - 0.01, '#5FD8FF', -0.4, LAMP.sign);
  k.box(0.1, 0.025, 0.02, 0, 0.21, -0.585, '#FFFFFF', -0.25, LAMP.tail);
  scooter = {
    body: k.merge(), lamp: k.mergeLamps(), wheel: scooterWheel(fr),
    wheels: [{ y: fr, z: FZ, r: fr }, { y: rr, z: RZ, r: rr }],
    crank: null, pedal: null, bb: { y: 0, z: 0 }, crankR: 0,
  };
  return scooter;
}

/** Shared material for the two-wheelers' bodies and wheels (coloured per vertex). */
export function twoWheelerMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.35 });
}
