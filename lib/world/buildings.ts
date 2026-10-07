import { hashString, prng } from './seed';

// Procedural building models. Pure: a post's building is planned from its footprint (width, depth, height,
// which are already the live data contract: likes -> height, reposts -> width) plus a hash of the post id,
// so every post keeps the same look on every device and every load.
//
// A plan is a flat list of parts in the building's local frame: x across the facade, z toward the street
// (front face at +depth/2), y up from the building's base. Parts are drawn by components/world/Buildings.tsx
// as a handful of InstancedMeshes keyed by geometry and material. `detail` parts (windows, ledges,
// balconies, awnings, rooftop units) are only drawn near the camera; massing parts are always drawn.
//
// replies -> lit windows: of all window slots on a building, exactly `windows` are lit (the rest are dark glass).
// impressions -> glow: brightens the lit windows.

export type Archetype = 'house' | 'shop' | 'warehouse' | 'midrise' | 'office' | 'tower' | 'kiosk' | 'segment';
export type PartGeo = 'box' | 'gable' | 'cyl' | 'pyramid';
export type PartMat = 'solid' | 'glass' | 'lit';

export type Part = {
  g: PartGeo;
  m: PartMat;
  /** centre x/z, bottom y, local frame */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  color: string;
  /** brightness multiplier for lit parts */
  k: number;
  detail: boolean;
};

export type PlanInput = {
  /** stable id (the post id); the look is seeded from it */
  seed: string;
  kind: string;
  width: number;
  depth: number;
  height: number;
  windows: number;
  glow: number;
  isLandmark: boolean;
  /** thread towers: segment index and whether this piece is the top of its stack */
  segment: number;
  isTop: boolean;
  /** thread towers share one palette: a seed for the whole stack */
  stackSeed?: string;
};

export type Plan = { archetype: Archetype; parts: Part[] };

// Palettes. Warm West-African street colours next to concrete, brick and glass.
const PLASTER = ['#E9DCC4', '#D9C7A7', '#EFE6D6', '#CFB896', '#E3D3C0', '#F2E2C4'];
const PAINT = ['#E2B33B', '#5BA3A0', '#D9775B', '#7FA36B', '#C95C54', '#6D8FB8', '#E08E45', '#9C7FB8'];
const BRICK = ['#A4553F', '#8E4A39', '#B8694E', '#7D4436', '#9A5B45'];
const CONCRETE = ['#B9B6AE', '#A7A49C', '#C9C5BC', '#8F8C86', '#D2CCC0'];
const METAL = ['#7E8A8F', '#A3ACA8', '#5F7A86', '#B07A4F', '#8A9A7B', '#C9C2B3', '#6E7F9A'];
const GLASS = ['#5B7F9E', '#6A8FA8', '#5E8C94', '#4F6F8F', '#7A97AD', '#6A8C84', '#8195AE'];
const FRAME = ['#E9ECEF', '#C8CED6', '#2A2F36', '#8C949E', '#B79A63'];
const ROOF = ['#B5482F', '#8C3B2E', '#5B5F66', '#3E5A73', '#9C6B3E', '#6F4A3A'];
const AWNING = ['#D94F3D', '#2F7F6F', '#E0A63A', '#3C6FB0', '#8E4FA0', '#3E8E4E'];
const SIGN = ['#1F2933', '#F5F0E6', '#C0392B', '#1E5AA8', '#E7B23A', '#2D7A4F'];
const DARK_GLASS = ['#34485A', '#3B5064', '#41586E', '#36495A', '#4A5A6C'];
const TRIM = '#F4EFE6';
const DOOR = ['#5B3A29', '#3B2A20', '#2F4858', '#6B2E2E', '#24323A'];
const LIT = ['#FFD9A0', '#FFE6B8', '#FFCF8A', '#FFF1D2'];
const LANDMARK_STONE = '#F1E8D6';
const GOLD = '#D8B160';

const FLOOR = 2.9;

type Slot = { x: number; y: number; z: number; sx: number; sy: number; sz: number; dark: string };

class Builder {
  parts: Part[] = [];
  slots: Slot[] = [];
  constructor(private wantDetail: boolean) {}
  /** y is the bottom of the part */
  add(g: PartGeo, m: PartMat, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail = true, rx = 0, ry = 0) {
    if (detail && !this.wantDetail) return;
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    this.parts.push({ g, m, x, y, z, sx, sy, sz, rx, ry, color, k: 1, detail });
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail = true, m: PartMat = 'solid') {
    this.add('box', m, x, y, z, sx, sy, sz, color, detail);
  }
  slot(s: Slot) {
    if (this.wantDetail) this.slots.push(s);
  }
  /** turn window slots into parts: `lit` of them lit (deterministic order), the rest dark glass */
  finish(lit: number, glow: number, rand: () => number) {
    if (!this.wantDetail) return;
    const order = this.slots.map((s, i) => ({ s, r: rand() }));
    order.sort((a, b) => a.r - b.r);
    const n = Math.min(lit, order.length);
    const litColor = LIT[Math.floor(rand() * LIT.length)];
    order.forEach(({ s }, i) => {
      if (i < n) {
        this.parts.push({ g: 'box', m: 'lit', x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, rx: 0, ry: 0, color: litColor, k: 0.72 + glow * 0.4, detail: true });
      } else {
        this.parts.push({ g: 'box', m: 'glass', x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, rx: 0, ry: 0, color: s.dark, k: 1, detail: true });
      }
    });
  }
}

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length) % a.length];

type GridOpts = {
  /** tier centre and size */
  cx: number;
  cz: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  floorH: number;
  bay: number;
  winW: number;
  winH: number;
  sides: boolean;
  frame?: string;
  sill?: string;
  dark: string;
  /** leave a gap for a door on the ground floor front */
  doorGap?: number;
};

/** A grid of windows on the front (and optionally both sides) of a box tier, with frames and sills. */
function windowGrid(b: Builder, o: GridOpts) {
  const floors = Math.max(1, Math.floor((o.y1 - o.y0) / o.floorH + 0.25));
  const fh = (o.y1 - o.y0) / floors;
  const faces: { len: number; place: (u: number, y: number, t: number, w: number, h: number, depth: number) => [number, number, number, number, number, number] }[] = [
    { len: o.w, place: (u, y, t, w, h, dz) => [o.cx + u, y, o.cz + o.d / 2 + t, w, h, dz] },
  ];
  if (o.sides) {
    faces.push({ len: o.d, place: (u, y, t, w, h, dz) => [o.cx - o.w / 2 - t, y, o.cz + u, dz, h, w] });
    faces.push({ len: o.d, place: (u, y, t, w, h, dz) => [o.cx + o.w / 2 + t, y, o.cz + u, dz, h, w] });
  }
  faces.forEach((f, fi) => {
    const cols = Math.max(1, Math.floor((f.len - 0.6) / o.bay));
    const step = (f.len - 0.6) / cols;
    for (let r = 0; r < floors; r++) {
      const yb = o.y0 + r * fh + (fh - o.winH) * 0.55;
      for (let c = 0; c < cols; c++) {
        const u = -f.len / 2 + 0.3 + step * (c + 0.5);
        if (fi === 0 && r === 0 && o.doorGap && Math.abs(u) < o.doorGap / 2 + o.winW / 2) continue;
        const [x, y, z, sx, sy, sz] = f.place(u, yb, 0.04, o.winW, o.winH, 0.08);
        b.slot({ x, y, z, sx, sy, sz, dark: o.dark });
        if (o.frame) {
          const [fx, fy, fz, fsx, fsy, fsz] = f.place(u, yb - 0.08, 0.02, o.winW + 0.22, o.winH + 0.16, 0.06);
          b.box(fx, fy, fz, fsx, fsy, fsz, o.frame);
        }
        if (o.sill && fi === 0) {
          const [sx2, sy2, sz2, ssx, ssy, ssz] = f.place(u, yb - 0.14, 0.12, o.winW + 0.3, 0.1, 0.24);
          b.box(sx2, sy2, sz2, ssx, ssy, ssz, o.sill);
        }
      }
    }
  });
  return floors;
}

/** A parapet ring around a flat roof. */
function parapet(b: Builder, cx: number, cz: number, w: number, d: number, y: number, h: number, t: number, color: string) {
  b.box(cx, y, cz + d / 2 - t / 2, w, h, t, color);
  b.box(cx, y, cz - d / 2 + t / 2, w, h, t, color);
  b.box(cx - w / 2 + t / 2, y, cz, t, h, d - 2 * t, color);
  b.box(cx + w / 2 - t / 2, y, cz, t, h, d - 2 * t, color);
}

/** Rooftop clutter: AC units, a water tank on a stand, a stair hut. */
function rooftop(b: Builder, r: () => number, cx: number, cz: number, w: number, d: number, y: number, opts: { tank?: boolean; hut?: boolean; ac?: number }) {
  const ac = opts.ac ?? 0;
  for (let i = 0; i < ac; i++) {
    const ax = cx + (r() - 0.5) * (w - 1.6);
    const az = cz + (r() - 0.5) * (d - 1.6);
    b.box(ax, y, az, 0.9, 0.6, 0.7, '#C9CDD2');
    b.box(ax, y + 0.6, az, 0.6, 0.05, 0.5, '#7D848C');
  }
  if (opts.tank) {
    const tx = cx + (r() < 0.5 ? -1 : 1) * (w / 2 - 1.1);
    const tz = cz - d / 2 + 1.2;
    b.box(tx, y, tz, 1.2, 0.8, 1.2, '#5A5F66');
    b.add('cyl', 'solid', tx, y + 0.8, tz, 1.1, 1.1, 1.1, r() < 0.6 ? '#1E2226' : '#2F5D8A');
  }
  if (opts.hut && w > 3.4) {
    b.box(cx + (r() - 0.5) * (w - 2.4), y, cz - d / 4, 1.4, 1.5, 1.6, '#BDB6A8');
  }
}

function house(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const roofH = Math.min(3.4, Math.max(1.3, H * 0.38));
  const Hb = Math.max(2.4, H - roofH);
  const wall = r() < 0.45 ? pick(PAINT, r) : pick(PLASTER, r);
  const roof = pick(ROOF, r);
  b.box(0, 0, 0, W, Hb, D, wall, false);
  // plinth
  b.box(0, 0, 0, W + 0.08, 0.35, D + 0.08, '#8F877A');
  const ridgeAlongZ = r() < 0.45;
  if (ridgeAlongZ) {
    // gable faces the street
    b.add('gable', 'solid', 0, Hb, 0, D + 0.7, roofH, W + 0.6, roof, false, 0, Math.PI / 2);
    b.add('gable', 'solid', 0, Hb, 0, D - 0.02, roofH - 0.12, W - 0.04, wall, true, 0, Math.PI / 2);
    // a round attic window in the gable
    b.box(0, Hb + roofH * 0.25, D / 2 + 0.33, 0.6, 0.6, 0.06, pick(DARK_GLASS, r));
  } else {
    b.add('gable', 'solid', 0, Hb, 0, W + 0.7, roofH, D + 0.6, roof, false);
    b.add('gable', 'solid', 0, Hb, 0, W - 0.04, roofH - 0.12, D - 0.02, wall, true);
    // dormer
    if (W > 4.2 && r() < 0.6) {
      b.box(W * 0.22, Hb + roofH * 0.25, D * 0.18, 1.1, 0.9, 1.0, wall);
      b.add('gable', 'solid', W * 0.22, Hb + roofH * 0.25 + 0.9, D * 0.18, 1.3, 0.5, 1.1, roof, true, 0, Math.PI / 2);
      b.box(W * 0.22, Hb + roofH * 0.25 + 0.15, D * 0.18 + 0.52, 0.6, 0.6, 0.06, pick(DARK_GLASS, r));
    }
  }
  // chimney
  b.box(-W * 0.28, Hb + roofH * 0.3, -D * 0.12, 0.55, roofH * 0.85, 0.55, r() < 0.5 ? '#8E4A39' : '#9A958B');
  // door, frame, step, little porch roof
  const doorX = W > 4 ? (r() < 0.5 ? -1 : 1) * W * 0.2 : 0;
  b.box(doorX, 0.35, D / 2 + 0.04, 1.1, 2.0, 0.08, TRIM);
  b.box(doorX, 0.35, D / 2 + 0.07, 0.9, 1.9, 0.06, pick(DOOR, r));
  b.box(doorX, 0, D / 2 + 0.35, 1.6, 0.35, 0.7, '#9A958B');
  if (r() < 0.6) {
    b.add('box', 'solid', doorX, 2.55, D / 2 + 0.5, 1.8, 0.1, 1.1, roof, true, -0.2, 0);
  }
  windowGrid(b, { cx: 0, cz: 0, w: W, d: D, y0: 0.35, y1: Hb, floorH: 2.6, bay: 1.7, winW: 0.9, winH: 1.15, sides: true, frame: TRIM, sill: TRIM, dark: pick(DARK_GLASS, r), doorGap: W > 4 ? 0 : 1.2 });
  // low hedge along the front
  if (r() < 0.5) b.box(0, 0, D / 2 + 1.0, W * 0.9, 0.55, 0.45, '#5E8A4A');
}

function shop(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const wall = r() < 0.5 ? pick(PAINT, r) : pick(r() < 0.5 ? PLASTER : BRICK, r);
  const groundH = Math.min(H, 3.3);
  b.box(0, 0, 0, W, H, D, wall, false);
  // storefront
  const glass = p.glow > 0.35 ? '#C9A872' : pick(DARK_GLASS, r);
  b.box(0, 0.25, D / 2 + 0.03, W - 0.7, 2.35, 0.08, glass, true, p.glow > 0.35 ? 'lit' : 'glass');
  const mullions = Math.max(2, Math.round((W - 0.7) / 1.3));
  for (let i = 0; i <= mullions; i++) b.box(-(W - 0.7) / 2 + ((W - 0.7) * i) / mullions, 0.25, D / 2 + 0.08, 0.08, 2.35, 0.06, '#2A2F36');
  b.box(0, 0, D / 2 + 0.1, W - 0.5, 0.25, 0.2, '#4B4F55');
  // door
  b.box(W * 0.25, 0.25, D / 2 + 0.1, 0.95, 2.1, 0.05, pick(DOOR, r));
  // awning, striped
  const aw = pick(AWNING, r);
  const stripes = Math.max(3, Math.round((W - 0.3) / 0.55));
  const sw = (W - 0.3) / stripes;
  for (let i = 0; i < stripes; i++) {
    b.add('box', 'solid', -(W - 0.3) / 2 + sw * (i + 0.5), 2.6, D / 2 + 0.75, sw, 0.07, 1.45, i % 2 === 0 ? aw : '#F4EFE6', true, 0.38, 0);
  }
  // sign band
  b.box(0, 2.95, D / 2 + 0.08, W - 0.5, 0.6, 0.16, pick(SIGN, r));
  if (H > groundH + 1.5) {
    b.box(0, groundH - 0.12, 0, W + 0.12, 0.14, D + 0.12, TRIM);
    windowGrid(b, { cx: 0, cz: 0, w: W, d: D, y0: groundH, y1: H - 0.2, floorH: FLOOR, bay: 1.5, winW: 0.85, winH: 1.3, sides: true, frame: TRIM, sill: TRIM, dark: pick(DARK_GLASS, r) });
  }
  parapet(b, 0, 0, W, D, H, 0.45, 0.22, wall);
  b.box(0, H + 0.45, D / 2 - 0.11, W + 0.06, 0.08, 0.3, TRIM);
  rooftop(b, r, 0, 0, W, D, H, { ac: 1 + Math.floor(r() * 2), tank: r() < 0.5 });
}

function warehouse(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const wall = pick(METAL, r);
  const roofH = Math.min(1.6, H * 0.22);
  const Hb = H - roofH;
  b.box(0, 0, 0, W, Hb, D, wall, false);
  b.add('gable', 'solid', 0, Hb, 0, D + 0.3, roofH, W + 0.3, '#6F767C', false, 0, Math.PI / 2);
  // corrugation ribs
  const rib = new Array(Math.max(3, Math.floor(W / 0.7))).fill(0);
  rib.forEach((_, i) => b.box(-W / 2 + (W * (i + 0.5)) / rib.length, 0, D / 2 + 0.02, 0.07, Hb, 0.05, shade(wall, -0.12)));
  const sr = Math.max(3, Math.floor(D / 0.7));
  for (let i = 0; i < sr; i++) {
    const z = -D / 2 + (D * (i + 0.5)) / sr;
    b.box(-W / 2 - 0.02, 0, z, 0.05, Hb, 0.07, shade(wall, -0.12));
    b.box(W / 2 + 0.02, 0, z, 0.05, Hb, 0.07, shade(wall, -0.12));
  }
  // roller door with slats
  const dw = Math.min(W * 0.55, 3.6), dh = Math.min(Hb * 0.7, 3.2);
  b.box(-W * 0.12, 0, D / 2 + 0.06, dw + 0.3, dh + 0.25, 0.08, '#3B3F45');
  const slats = Math.floor(dh / 0.28);
  for (let i = 0; i < slats; i++) b.box(-W * 0.12, 0.05 + i * 0.28, D / 2 + 0.11, dw, 0.22, 0.04, i % 2 ? '#B4B8BC' : '#A2A7AC');
  // side door + loading dock
  b.box(W * 0.33, 0, D / 2 + 0.06, 0.9, 2.0, 0.06, pick(DOOR, r));
  b.box(-W * 0.12, 0, D / 2 + 0.6, dw + 0.8, 0.5, 1.1, '#8F8C86');
  // high strip windows
  windowGrid(b, { cx: 0, cz: 0, w: W, d: D, y0: Math.max(dh + 0.4, Hb - 1.2), y1: Hb - 0.1, floorH: 10, bay: 1.1, winW: 0.8, winH: 0.45, sides: true, dark: pick(DARK_GLASS, r) });
  // painted company band + roof skylights
  b.box(0, Hb - 0.25, D / 2 + 0.09, W, 0.25, 0.05, pick(AWNING, r));
  for (let i = 0; i < 3; i++) b.add('box', 'glass', 0, Hb + roofH * 0.3, -D / 2 + (D * (i + 0.5)) / 3, W * 0.25, 0.12, 0.9, '#9FB7C8', true);
  // vent on the ridge
  b.add('cyl', 'solid', 0, Hb + roofH - 0.1, -D * 0.2, 0.5, 0.6, 0.5, '#9CA3AA');
}

function midrise(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const brick = r() < 0.45;
  const wall = brick ? pick(BRICK, r) : r() < 0.5 ? pick(PAINT, r) : pick(PLASTER, r);
  const plinth = pick(CONCRETE, r);
  const groundH = Math.min(3.2, H * 0.4);
  b.box(0, 0, 0, W, H, D, wall, false);
  b.box(0, 0, 0, W + 0.1, groundH, D + 0.1, plinth);
  // ground floor: entrance with canopy, shopfront glass either side
  b.box(0, 0, D / 2 + 0.07, 1.4, 2.4, 0.06, pick(DOOR, r));
  b.box(0, 2.45, D / 2 + 0.55, 2.0, 0.12, 1.1, TRIM);
  if (W > 4.5) {
    b.box(-W * 0.3, 0.6, D / 2 + 0.07, W * 0.25, 1.6, 0.06, pick(DARK_GLASS, r), true, 'glass');
    b.box(W * 0.3, 0.6, D / 2 + 0.07, W * 0.25, 1.6, 0.06, pick(DARK_GLASS, r), true, 'glass');
  }
  const floors = windowGrid(b, { cx: 0, cz: 0, w: W, d: D, y0: groundH, y1: H - 0.3, floorH: FLOOR, bay: 1.45, winW: 0.8, winH: 1.45, sides: true, frame: brick ? TRIM : shade(wall, -0.18), sill: TRIM, dark: pick(DARK_GLASS, r) });
  const fh = (H - 0.3 - groundH) / floors;
  // floor ledges
  for (let f = 1; f < floors; f++) b.box(0, groundH + f * fh - 0.06, 0, W + 0.18, 0.12, D + 0.18, brick ? TRIM : shade(wall, -0.1));
  // balconies on the front, alternate bays
  if (floors >= 1 && r() < 0.8) {
    const cols = Math.max(1, Math.floor((W - 0.6) / 1.45));
    const step = (W - 0.6) / cols;
    const rail = r() < 0.5 ? '#9FB7C8' : '#2A2F36';
    const every = cols > 2 ? 2 : 1;
    for (let f = 0; f < floors; f++) {
      for (let c = (f % 2) * (every - 1); c < cols; c += every) {
        const u = -W / 2 + 0.3 + step * (c + 0.5);
        const y = groundH + f * fh;
        b.box(u, y, D / 2 + 0.45, step * 0.92, 0.12, 0.9, '#D8D2C6');
        b.add('box', rail === '#9FB7C8' ? 'glass' : 'solid', u, y + 0.12, D / 2 + 0.88, step * 0.92, 0.75, 0.05, rail, true);
      }
    }
  }
  // cornice
  b.box(0, H - 0.3, 0, W + 0.4, 0.3, D + 0.4, brick ? '#E8DFD0' : shade(wall, -0.15));
  parapet(b, 0, 0, W, D, H, 0.5, 0.2, brick ? wall : shade(wall, -0.05));
  rooftop(b, r, 0, 0, W, D, H, { tank: true, hut: true, ac: Math.floor(r() * 3) });
}

function office(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const glass = pick(GLASS, r);
  const frame = pick(FRAME, r);
  b.add('box', 'glass', 0, 0, 0, W, H, D, glass, false);
  const floors = Math.max(1, Math.floor(H / 3.2));
  const fh = H / floors;
  // spandrel bands, one per floor
  for (let f = 1; f <= floors; f++) b.box(0, f * fh - 0.35, 0, W + 0.06, 0.35, D + 0.06, frame);
  // vertical mullions front and sides
  const mc = Math.max(2, Math.round(W / 1.2));
  for (let i = 0; i <= mc; i++) b.box(-W / 2 + (W * i) / mc, 0, D / 2 + 0.03, 0.1, H, 0.06, frame);
  const ms = Math.max(2, Math.round(D / 1.2));
  for (let i = 0; i <= ms; i++) {
    const z = -D / 2 + (D * i) / ms;
    b.box(-W / 2 - 0.03, 0, z, 0.06, H, 0.1, frame);
    b.box(W / 2 + 0.03, 0, z, 0.06, H, 0.1, frame);
  }
  // offices behind the glass: lit panels per bay (data: replies)
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < mc; i++) {
      const u = -W / 2 + (W * (i + 0.5)) / mc;
      b.slot({ x: u, y: f * fh + 0.25, z: D / 2 + 0.015, sx: W / mc - 0.2, sy: fh - 0.7, sz: 0.02, dark: shade(glass, -0.08) });
    }
  }
  // lobby: darker recessed ground floor and a canopy
  b.box(0, 0, D / 2 + 0.07, Math.min(W - 1, 2.6), 2.5, 0.05, '#1D252E', true, 'glass');
  b.box(0, 2.6, D / 2 + 0.7, Math.min(W, 3.4), 0.16, 1.4, frame);
  b.box(0, 3.0 - 0.2, D / 2 + 1.36, Math.min(W, 3.4) - 0.4, 0.3, 0.06, pick(SIGN, r));
  // roof
  parapet(b, 0, 0, W, D, H, 0.6, 0.18, frame);
  b.box(0, H, -D * 0.1, W * 0.5, 1.1, D * 0.4, '#9EA4AA');
  rooftop(b, r, 0, 0, W, D, H, { ac: 2 });
  if (H > 11) b.add('cyl', 'solid', W * 0.25, H + 1.1, -D * 0.1, 0.12, 3.5, 0.12, '#C9CDD2');
}

function tower(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const stone = p.isLandmark ? LANDMARK_STONE : pick(r() < 0.5 ? CONCRETE : PLASTER, r);
  const glassy = !p.isLandmark && r() < 0.55;
  const glass = pick(GLASS, r);
  const accent = p.isLandmark ? GOLD : pick(FRAME, r);
  const podH = Math.min(6, Math.max(3, H * 0.25));
  const tiers = [
    { w: W, d: D, y0: 0, y1: podH },
    { w: W * 0.82, d: D * 0.82, y0: podH, y1: H * 0.74 },
    { w: W * 0.64, d: D * 0.64, y0: H * 0.74, y1: H },
  ];
  tiers.forEach((t, i) => {
    const isGlass = glassy && i > 0;
    b.add('box', isGlass ? 'glass' : 'solid', 0, t.y0, 0, t.w, t.y1 - t.y0, t.d, isGlass ? glass : stone, false);
    // ledge at the top of each tier
    b.box(0, t.y1 - 0.2, 0, t.w + 0.25, 0.22, t.d + 0.25, accent);
    if (isGlass) {
      const mc = Math.max(2, Math.round(t.w / 1.1));
      for (let k = 0; k <= mc; k++) b.box(-t.w / 2 + (t.w * k) / mc, t.y0, t.d / 2 + 0.03, 0.08, t.y1 - t.y0 - 0.2, 0.06, accent);
      const floors = Math.max(1, Math.floor((t.y1 - t.y0) / FLOOR));
      const fh = (t.y1 - t.y0) / floors;
      for (let f = 0; f < floors; f++) {
        b.box(0, t.y0 + (f + 1) * fh - 0.25, 0, t.w + 0.04, 0.18, t.d + 0.04, accent);
        for (let k = 0; k < mc; k++) b.slot({ x: -t.w / 2 + (t.w * (k + 0.5)) / mc, y: t.y0 + f * fh + 0.2, z: t.d / 2 + 0.015, sx: t.w / mc - 0.18, sy: fh - 0.6, sz: 0.02, dark: shade(glass, -0.08) });
      }
    } else {
      windowGrid(b, { cx: 0, cz: 0, w: t.w, d: t.d, y0: t.y0 + (i === 0 ? 0.4 : 0.1), y1: t.y1 - 0.25, floorH: FLOOR, bay: 1.25, winW: 0.75, winH: 1.5, sides: true, frame: accent, dark: pick(DARK_GLASS, r), doorGap: i === 0 ? 2.2 : 0 });
    }
  });
  // grand entrance
  b.box(0, 0, D / 2 + 0.07, 1.8, 2.8, 0.06, '#1D252E', true, 'glass');
  b.box(-1.1, 0, D / 2 + 0.25, 0.3, 3.2, 0.3, accent);
  b.box(1.1, 0, D / 2 + 0.25, 0.3, 3.2, 0.3, accent);
  b.box(0, 3.2, D / 2 + 0.25, 2.6, 0.3, 0.5, accent);
  // crown and spire
  const tw = W * 0.64, td = D * 0.64;
  if (p.isLandmark || r() < 0.5) {
    b.add('pyramid', 'solid', 0, H, 0, tw * 0.9, Math.min(4, tw * 0.8), td * 0.9, p.isLandmark ? GOLD : pick(ROOF, r));
  } else {
    parapet(b, 0, 0, tw, td, H, 0.7, 0.18, accent);
    rooftop(b, r, 0, 0, tw, td, H, { ac: 1 });
  }
  b.add('cyl', 'solid', 0, H, 0, 0.14, Math.min(6, 1.5 + H * 0.2), 0.14, '#D0D4D8');
}

/** One storey-stack of a thread tower: banded body; the top piece gets a crown. */
function segment(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const sr = prng(hashString(p.stackSeed ?? p.seed));
  const glass = pick(GLASS, sr);
  const accent = pick(FRAME, sr);
  b.add('box', 'glass', 0, 0, 0, W, H, D, glass, false);
  b.box(0, 0, 0, W + 0.3, 0.35, D + 0.3, accent);
  const floors = Math.max(1, Math.floor(H / FLOOR));
  const fh = H / floors;
  const mc = Math.max(2, Math.round(W / 1.1));
  for (let k = 0; k <= mc; k++) b.box(-W / 2 + (W * k) / mc, 0, D / 2 + 0.03, 0.08, H, 0.06, accent);
  for (let k = 0; k <= Math.max(2, Math.round(D / 1.1)); k++) {
    const z = -D / 2 + (D * k) / Math.max(2, Math.round(D / 1.1));
    b.box(-W / 2 - 0.03, 0, z, 0.06, H, 0.08, accent);
    b.box(W / 2 + 0.03, 0, z, 0.06, H, 0.08, accent);
  }
  for (let f = 0; f < floors; f++) {
    b.box(0, (f + 1) * fh - 0.2, 0, W + 0.04, 0.2, D + 0.04, accent);
    for (let k = 0; k < mc; k++) b.slot({ x: -W / 2 + (W * (k + 0.5)) / mc, y: f * fh + 0.4, z: D / 2 + 0.015, sx: W / mc - 0.18, sy: fh - 0.75, sz: 0.02, dark: shade(glass, -0.08) });
  }
  if (p.segment === 0) {
    b.box(0, 0, D / 2 + 0.07, Math.min(W - 0.8, 2.2), 2.6, 0.05, '#1D252E', true, 'glass');
    b.box(0, 2.7, D / 2 + 0.6, Math.min(W, 3), 0.16, 1.2, accent);
  }
  if (p.isTop) {
    b.box(0, H, 0, W * 0.6, 1.2, D * 0.6, accent);
    b.add('cyl', 'solid', 0, H + 1.2, 0, 0.14, 4, 0.14, '#D0D4D8');
  }
}

/** Replies to others: small kiosks and huts. */
function kiosk(b: Builder, r: () => number, p: PlanInput, W: number, D: number, H: number) {
  const wall = pick(PAINT, r);
  b.box(0, 0, 0, W, H, D, wall, false);
  const roof = pick(r() < 0.5 ? ROOF : AWNING, r);
  if (r() < 0.5) {
    b.add('gable', 'solid', 0, H, 0, W + 0.4, Math.min(1, W * 0.4), D + 0.4, roof, false);
  } else {
    b.box(0, H, 0, W + 0.4, 0.16, D + 0.4, roof, false);
  }
  // serving hatch and a little awning
  b.box(0, H * 0.4, D / 2 + 0.03, W * 0.7, H * 0.3, 0.06, pick(DARK_GLASS, r), true, 'glass');
  b.add('box', 'solid', 0, H * 0.72, D / 2 + 0.3, W * 0.8, 0.06, 0.6, roof, true, 0.3, 0);
  b.box(0, H * 0.35, D / 2 + 0.2, W * 0.75, 0.08, 0.35, '#8A6A4A');
  b.slot({ x: 0, y: H * 0.4, z: D / 2 + 0.06, sx: W * 0.5, sy: H * 0.25, sz: 0.02, dark: pick(DARK_GLASS, r) });
}

export function chooseArchetype(p: PlanInput, r: () => number): Archetype {
  if (p.kind === 'outbuilding') return 'kiosk';
  if (p.kind === 'spire') return 'segment';
  if (p.isLandmark) return 'tower';
  const H = p.height, W = p.width;
  const roll = r();
  // video posts carry a screen across the facade: keep their fronts flush
  if (p.kind === 'obelisk') return H > 12 && roll < 0.5 ? 'tower' : 'office';
  if (H < 5.5) {
    if (W >= 4.6 && roll < 0.25) return 'warehouse';
    return roll < 0.6 ? 'house' : 'shop';
  }
  if (H < 9) {
    if (roll < 0.3) return 'shop';
    if (roll < 0.45) return 'house';
    if (roll < 0.58 && W >= 4.4) return 'warehouse';
    if (roll < 0.85) return 'midrise';
    return 'office';
  }
  if (H < 13) return roll < 0.5 ? 'midrise' : roll < 0.8 ? 'office' : 'tower';
  return roll < 0.45 ? 'tower' : roll < 0.8 ? 'office' : 'midrise';
}

export function planBuilding(p: PlanInput, wantDetail = true): Plan {
  const r = prng(hashString(p.seed + '|bld'));
  const archetype = chooseArchetype(p, r);
  const b = new Builder(wantDetail);
  const W = p.width, D = p.depth, H = p.height;
  ({ house, shop, warehouse, midrise, office, tower, segment, kiosk })[archetype](b, r, p, W, D, H);
  b.finish(p.windows, p.glow, r);
  return { archetype, parts: b.parts };
}

/** lighten (amt > 0) or darken (amt < 0) a #rrggbb colour */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const rr = f((n >> 16) & 255), gg = f((n >> 8) & 255), bb = f(n & 255);
  return '#' + ((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1);
}
