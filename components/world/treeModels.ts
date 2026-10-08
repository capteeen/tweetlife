import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prng } from '@/lib/world/seed';

// Procedural tree models. Every tree is one merged geometry with per-face vertex colours (bark grooves, leaf tones,
// light on top and shade inside the crown), so a whole species draws in one call however many stand in the city.
// `aLeaf` marks leaf faces (1) against bark (0): the per-tree tint and the wind flutter only touch leaves.
// Each species has a near model (layered, lumpy crowns, branches, tapered and bent trunks) and a far model
// with a fraction of the triangles; Trees.tsx swaps between them by distance.

import type { TreeKind } from '@/lib/world/scatter';

export type TreeSpecies = TreeKind;
export const SPECIES: TreeSpecies[] = ['oak', 'street', 'pine', 'palm', 'shrub'];

type Shade = (c: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

const UP = new THREE.Vector3(0, 1, 0);
const tc = new THREE.Vector3(), tn = new THREE.Vector3(), ta = new THREE.Vector3(), tb = new THREE.Vector3();
const tcol = new THREE.Color();

export class Builder {
  parts: THREE.BufferGeometry[] = [];
  /** Add a part. `smooth` keeps rounded normals (trunks); otherwise faces are flat (leaves read as facets). */
  add(geo: THREE.BufferGeometry, leaf: boolean, shade: Shade, smooth = false) {
    let g = geo;
    if (smooth) {
      g.computeVertexNormals();
      if (g.index) g = g.toNonIndexed();
    } else {
      if (g.index) g = g.toNonIndexed();
      g.computeVertexNormals();
    }
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const lf = new Float32Array(n).fill(leaf ? 1 : 0);
    for (let i = 0; i + 2 < n; i += 3) {
      tc.set(0, 0, 0);
      for (let k = 0; k < 3; k++) tc.add(ta.fromBufferAttribute(pos, i + k));
      tc.multiplyScalar(1 / 3);
      ta.fromBufferAttribute(pos, i + 1).sub(tb.fromBufferAttribute(pos, i));
      tn.fromBufferAttribute(pos, i + 2).sub(tb).cross(ta).negate().normalize();
      shade(tc, tn, tcol);
      for (let k = 0; k < 3; k++) col.set([tcol.r, tcol.g, tcol.b], (i + k) * 3);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aLeaf', new THREE.BufferAttribute(lf, 1));
    this.parts.push(out);
  }
  build() {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Smooth, deterministic lumps for crowns: a few crossed sine waves. */
function lump(x: number, y: number, z: number, s: number) {
  return (
    Math.sin(x * 2.1 + s) * Math.sin(y * 1.7 + s * 1.3) * 0.5 +
    Math.sin(z * 2.6 - s * 0.7) * Math.cos(x * 1.3 + y * 0.9) * 0.35 +
    Math.sin((x + y + z) * 4.1 + s * 2.1) * 0.15
  );
}

const linear = (hex: string) => new THREE.Color(hex);

type Crown = { c: THREE.Vector3; r: number; leaves: THREE.Color[]; light: THREE.Color; shadeDepth: number };

/** Leaf shading: darker underneath and inside the crown, sunlit and yellower on top, speckled per face. */
function leafShade(crown: Crown, rnd: () => number): Shade {
  return (c, n, out) => {
    const base = crown.leaves[Math.floor(rnd() * crown.leaves.length)];
    const h = THREE.MathUtils.clamp((c.y - (crown.c.y - crown.r)) / (2 * crown.r), 0, 1);
    tb.copy(c).sub(crown.c);
    const outward = tb.lengthSq() > 1e-6 ? Math.max(0, n.dot(tb.normalize())) : 0.5;
    const k = (1 - crown.shadeDepth) + crown.shadeDepth * (0.35 + 0.4 * h + 0.25 * outward);
    out.copy(base).multiplyScalar(k * (0.9 + rnd() * 0.2));
    if (n.y > 0.35) out.lerp(crown.light, (n.y - 0.35) * 0.45 * h);
  };
}

function barkShade(base: string, rnd: () => number, height: number): Shade {
  const b = linear(base);
  return (c, _n, out) => {
    // vertical grooves round the trunk, darker and mossier at the foot
    const groove = Math.sin(Math.atan2(c.z, c.x) * 7 + c.y * 0.6) > 0.2 ? 1 : 0.78;
    const foot = 0.72 + 0.28 * Math.min(1, c.y / Math.max(0.5, height * 0.4));
    out.copy(b).multiplyScalar(groove * foot * (0.88 + rnd() * 0.24));
  };
}

/** A lumpy, slightly squashed leaf clump. */
function clump(b: Builder, at: THREE.Vector3, r: number, detail: number, crown: Crown, rnd: () => number, squash = 0.85, rough = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const s = rnd() * 50;
  for (let i = 0; i < p.count; i++) {
    ta.fromBufferAttribute(p, i).normalize();
    const d = 1 + rough * lump(ta.x * 1.6, ta.y * 1.6, ta.z * 1.6, s);
    p.setXYZ(i, ta.x * r * d, ta.y * r * d * squash, ta.z * r * d);
  }
  g.translate(at.x, at.y, at.z);
  b.add(g, true, leafShade(crown, rnd));
}

/** A tapered, gently bent trunk from the ground up to `h`; returns where its top ends up. */
function trunk(b: Builder, h: number, r0: number, r1: number, bend: THREE.Vector2, radial: number, segs: number, color: string, rnd: () => number) {
  const g = new THREE.CylinderGeometry(r1, r0, h, radial, segs, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) + bend.x * t * t);
    p.setZ(i, p.getZ(i) + bend.y * t * t);
  }
  b.add(g, false, barkShade(color, rnd, h), true);
  return new THREE.Vector3(bend.x, h, bend.y);
}

/** A limb from `a` to `c`. */
function limb(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, color: string, rnd: () => number, radial = 5) {
  const dir = tb.copy(c).sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  b.add(g, false, barkShade(color, rnd, 4), true);
}

function rootFlare(b: Builder, r: number, color: string, rnd: () => number, radial = 7) {
  const g = new THREE.CylinderGeometry(r * 0.55, r, r * 0.9, radial, 1, true);
  g.translate(0, r * 0.45, 0);
  b.add(g, false, barkShade(color, rnd, 1), true);
}

const LEAF_BROAD = ['#4A8A3A', '#58984A', '#69A64A', '#4F8E45', '#77AE4F'].map(linear);
const LEAF_STREET = ['#5A9A45', '#68A84C', '#79B453', '#5E9550'].map(linear);
const LEAF_PINE = ['#2F6B45', '#387348', '#417D4E', '#2B5F40'].map(linear);
const LEAF_PALM = ['#4E9A40', '#5DAA48', '#6AB552', '#55A04A'].map(linear);
const LEAF_SHRUB = ['#4A8A3E', '#58984A', '#67A651', '#4E8E4A'].map(linear);
const SUN = linear('#B8D468');

// ---------------------------------------------------------------- species

function oak(near: boolean, seed: number) {
  const rnd = prng(seed);
  const b = new Builder();
  const h = 3.0 + rnd() * 0.4;
  const bend = new THREE.Vector2((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
  const top = trunk(b, h, 0.24, 0.13, bend, near ? 8 : 5, near ? 5 : 1, '#5B4636', rnd);
  const crown: Crown = { c: new THREE.Vector3(top.x, h + 1.5, top.z), r: 2.2, leaves: LEAF_BROAD, light: SUN, shadeDepth: 0.55 };
  if (near) {
    rootFlare(b, 0.42, '#4E3B2D', rnd, 8);
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.8;
      const from = new THREE.Vector3(bend.x * 0.6, h * (0.7 + rnd() * 0.15), bend.y * 0.6);
      const to = new THREE.Vector3(from.x + Math.cos(a) * 1.3, from.y + 1.1 + rnd() * 0.4, from.z + Math.sin(a) * 1.3);
      limb(b, from, to, 0.1, 0.045, '#5B4636', rnd);
      clump(b, to.clone().add(new THREE.Vector3(0, 0.25, 0)), 0.85 + rnd() * 0.2, 1, crown, rnd);
    }
    clump(b, crown.c, 1.45, 1, crown, rnd);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rnd() * 0.5;
      const rr = 1.15 + rnd() * 0.3;
      clump(b, new THREE.Vector3(crown.c.x + Math.cos(a) * rr, crown.c.y - 0.3 + rnd() * 0.6, crown.c.z + Math.sin(a) * rr), 0.95 + rnd() * 0.25, 1, crown, rnd);
    }
    for (let k = 0; k < 2; k++) {
      const a = rnd() * Math.PI * 2;
      clump(b, new THREE.Vector3(crown.c.x + Math.cos(a) * 0.6, crown.c.y + 0.85 + rnd() * 0.2, crown.c.z + Math.sin(a) * 0.6), 0.8 + rnd() * 0.15, 1, crown, rnd);
    }
  } else {
    clump(b, crown.c, 1.7, 0, crown, rnd, 0.85, 0.12);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      clump(b, new THREE.Vector3(crown.c.x + Math.cos(a) * 1.15, crown.c.y - 0.2 + k * 0.25, crown.c.z + Math.sin(a) * 1.15), 1.1, 0, crown, rnd, 0.85, 0.12);
    }
  }
  return b.build();
}

/** Slim street tree: clear trunk, tall oval crown, fits a sidewalk. */
function street(near: boolean, seed: number) {
  const rnd = prng(seed);
  const b = new Builder();
  const h = 2.6 + rnd() * 0.3;
  const bend = new THREE.Vector2((rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2);
  const top = trunk(b, h + 1.2, 0.15, 0.08, bend, near ? 7 : 5, near ? 4 : 1, '#6A5544', rnd);
  const crown: Crown = { c: new THREE.Vector3(top.x, h + 1.9, top.z), r: 2.0, leaves: LEAF_STREET, light: SUN, shadeDepth: 0.5 };
  if (near) {
    rootFlare(b, 0.24, '#5A4636', rnd, 7);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rnd();
      limb(b, new THREE.Vector3(bend.x * 0.5, h + 0.2, bend.y * 0.5), new THREE.Vector3(Math.cos(a) * 0.7, h + 1.2, Math.sin(a) * 0.7), 0.06, 0.03, '#6A5544', rnd);
    }
    const col = [
      [h + 1.0, 1.05],
      [h + 2.0, 1.2],
      [h + 3.0, 0.95],
      [h + 3.75, 0.6],
    ];
    for (const [y, r] of col) clump(b, new THREE.Vector3(top.x, y, top.z), r, 1, crown, rnd, 0.9);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rnd() * 0.6;
      clump(b, new THREE.Vector3(top.x + Math.cos(a) * 0.75, h + 1.2 + rnd() * 2.0, top.z + Math.sin(a) * 0.75), 0.6 + rnd() * 0.15, 1, crown, rnd, 0.9);
    }
  } else {
    clump(b, new THREE.Vector3(top.x, h + 1.4, top.z), 1.2, 0, crown, rnd, 0.95, 0.1);
    clump(b, new THREE.Vector3(top.x, h + 2.8, top.z), 1.0, 0, crown, rnd, 0.95, 0.1);
  }
  return b.build();
}

function pine(near: boolean, seed: number) {
  const rnd = prng(seed);
  const b = new Builder();
  const h = 6.8;
  trunk(b, h, 0.22, 0.05, new THREE.Vector2(0, 0), near ? 7 : 5, 1, '#5A3F2E', rnd);
  const tiers = near ? 6 : 3;
  const crown: Crown = { c: new THREE.Vector3(0, 4.2, 0), r: 3.4, leaves: LEAF_PINE, light: linear('#6E9A5A'), shadeDepth: 0.6 };
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const r = 1.75 * (1 - f * 0.8);
    const th = (near ? 1.7 : 2.6) * (1 - f * 0.3);
    const y = 1.5 + f * 5.0;
    const radial = near ? 10 : 7;
    const g = new THREE.ConeGeometry(r, th, radial, near ? 2 : 1, true);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      // ragged hem: every other rim vertex pushed out and down, so tiers read as boughs, not lampshades
      if (p.getY(v) < -th / 2 + 1e-3) {
        const a = Math.atan2(p.getZ(v), p.getX(v));
        const odd = Math.round((a / (Math.PI * 2)) * radial) % 2 !== 0;
        const k = odd ? 1.18 : 0.88;
        p.setXYZ(v, p.getX(v) * k, p.getY(v) - (odd ? 0.22 : 0), p.getZ(v) * k);
      }
    }
    g.rotateY(rnd() * Math.PI);
    g.translate(0, y + th / 2, 0);
    b.add(g, true, leafShade(crown, rnd));
  }
  return b.build();
}

/** Palm: a ringed, curving trunk and a crown of drooping, serrated fronds with coconuts. */
function palm(near: boolean, seed: number) {
  const rnd = prng(seed);
  const b = new Builder();
  const h = 6.0, lean = 0.9;
  const segs = near ? 10 : 3;
  const at = (t: number) => new THREE.Vector3(lean * t * t * h * 0.25, t * h, 0);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a = at(t0), c = at(t1);
    const r = 0.24 - 0.08 * t0;
    const dir = c.clone().sub(a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(near ? r * 0.84 : r * 0.9, near ? r * 1.04 : r, len, near ? 8 : 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    g.translate(a.x, a.y, a.z);
    const ring = i % 2 ? '#9A7B56' : '#8A6B4A';
    b.add(g, false, (cc, _n, out) => {
      out.set(ring);
      const k = cc.y - a.y < len * 0.25 ? 0.78 : 1; // dark band at each ring
      out.multiplyScalar(k * (0.92 + rnd() * 0.12));
    }, true);
  }
  const top = at(1);
  const crown: Crown = { c: top.clone(), r: 2.6, leaves: LEAF_PALM, light: linear('#B5D36A'), shadeDepth: 0.45 };
  if (near) {
    const nut = new THREE.IcosahedronGeometry(0.42, 1);
    nut.scale(1, 0.8, 1);
    nut.translate(top.x, top.y - 0.05, top.z);
    b.add(nut, false, (_c, _n, out) => out.set('#6B5A34').multiplyScalar(0.85 + rnd() * 0.2));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      const g = new THREE.IcosahedronGeometry(0.15, 0);
      g.translate(top.x + Math.cos(a) * 0.28, top.y - 0.32, top.z + Math.sin(a) * 0.28);
      b.add(g, false, (_c, _n, out) => out.set(k % 2 ? '#5C4326' : '#6C7A2E'));
    }
  }
  const fronds = near ? 11 : 6;
  for (let f = 0; f < fronds; f++) {
    const dead = near && f >= fronds - 2;
    const yaw = (f / fronds) * Math.PI * 2 + rnd() * 0.3;
    const L = (dead ? 2.4 : 3.1) + rnd() * 0.4;
    const lift = dead ? -0.4 : 0.55 - (f % 3) * 0.12;
    const droop = dead ? 0.55 : 0.75;
    const steps = near ? 10 : 3;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(new THREE.Vector3(L * t * 0.95, L * (lift * t - droop * t * t), 0));
    }
    const pos: number[] = [];
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const w = (dead ? 0.35 : 0.62) * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.05;
      const s0 = pts[i], s1 = pts[i + 1];
      for (const side of [-1, 1]) {
        const tip = new THREE.Vector3((s0.x + s1.x) / 2 + 0.18, (s0.y + s1.y) / 2 - w * 0.35, side * w);
        if (side < 0) pos.push(s0.x, s0.y, s0.z, s1.x, s1.y, s1.z, tip.x, tip.y, tip.z);
        else pos.push(s0.x, s0.y, s0.z, tip.x, tip.y, tip.z, s1.x, s1.y, s1.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.rotateY(yaw);
    g.translate(top.x, top.y + 0.1, top.z);
    if (dead) b.add(g, false, (_c, _n, out) => out.set('#8C7A4C').multiplyScalar(0.85 + rnd() * 0.25));
    else {
      const sh = leafShade(crown, rnd);
      b.add(g, true, (c, n, out) => {
        sh(c, n, out);
        out.multiplyScalar(0.85 + 0.3 * Math.min(1, Math.max(0, (c.y - top.y + 1.5) / 2)));
      });
    }
  }
  return b.build();
}

function shrub(near: boolean, seed: number) {
  const rnd = prng(seed);
  const b = new Builder();
  const crown: Crown = { c: new THREE.Vector3(0, 0.45, 0), r: 0.8, leaves: LEAF_SHRUB, light: SUN, shadeDepth: 0.6 };
  const n = near ? 5 : 2;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    const rr = k === 0 ? 0 : 0.45;
    clump(b, new THREE.Vector3(Math.cos(a) * rr, 0.42 + rnd() * 0.12 + (k === 0 ? 0.12 : 0), Math.sin(a) * rr), near ? 0.42 + rnd() * 0.12 : 0.6, near ? 1 : 0, crown, rnd, 0.8, near ? 0.25 : 0.1);
  }
  if (near && seed % 2 === 1) {
    const petals = ['#F2A6C2', '#FFFFFF', '#F7D85B'];
    const petal = petals[seed % petals.length];
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2, e = 0.2 + rnd() * 0.9;
      const g = new THREE.IcosahedronGeometry(0.06, 0);
      g.translate(Math.cos(a) * Math.cos(e) * 0.75, 0.5 + Math.sin(e) * 0.45, Math.sin(a) * Math.cos(e) * 0.75);
      b.add(g, false, (_c, _n, out) => out.set(petal));
    }
  }
  return b.build();
}

const BUILD: Record<TreeSpecies, (near: boolean, seed: number) => THREE.BufferGeometry> = { oak, street, pine, palm, shrub };
const cache = new Map<string, THREE.BufferGeometry>();

/** Shared model for a species at a level of detail, built once per page. */
export function treeModel(species: TreeSpecies, near: boolean) {
  const key = `${species}:${near ? 1 : 0}`;
  let g = cache.get(key);
  if (!g) cache.set(key, (g = BUILD[species](near, species === 'shrub' ? 3 : 11)));
  return g;
}
