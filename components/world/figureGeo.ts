import * as THREE from 'three';
import type { Look } from '@/lib/life/look';

// Shared geometry, fabric textures and level-of-detail tags for the Figure and its clothes (FigureOutfit.tsx).

// Geometry is built once per distinct size and shared by every figure in the world.
const GEO = new Map<string, THREE.BufferGeometry>();
export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = make()));
  return g as T;
}
export const q = (n: number) => n.toFixed(3);
export const capsule = (r: number, len: number) => geo(`cap|${q(r)}|${q(len)}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
export const ball = () => geo('ball', () => new THREE.SphereGeometry(1, 16, 12));
export const smallBall = () => geo('ball-s', () => new THREE.SphereGeometry(1, 10, 8));
/** A flat ring lying in the XZ plane, for cuffs, collars and waistbands. */
export const ring = (r: number, tube: number) =>
  geo(`ring|${q(r)}|${q(tube)}`, () => new THREE.TorusGeometry(r, tube, 6, 20).rotateX(Math.PI / 2));

// Torso silhouette as radius over height (0 = waist, 1 = base of the neck): narrow waist, fuller chest, sloped shoulders.
// The female profile has fuller hips, a narrower waist and narrower shoulders.
const TORSO: Record<Look['body'], [number, number][]> = {
  male: [[0, 0.16], [0.12, 0.155], [0.35, 0.15], [0.6, 0.172], [0.8, 0.19], [0.9, 0.185], [0.97, 0.14], [1, 0.07]],
  female: [[0, 0.178], [0.12, 0.168], [0.38, 0.136], [0.6, 0.155], [0.8, 0.165], [0.9, 0.158], [0.97, 0.122], [1, 0.064]],
};
export function torsoR(body: Look['body'], t: number) {
  const P = TORSO[body];
  for (let i = 1; i < P.length; i++) {
    const [t0, r0] = P[i - 1], [t1, r1] = P[i];
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
  }
  return P[P.length - 1][1];
}
/** A lathe of the torso profile between t0 and t1, `inflate` pushes it out (for clothes over the body). */
export const torso = (body: Look['body'], t0: number, t1: number, inflate = 1) =>
  geo(`torso|${body}|${q(t0)}|${q(t1)}|${q(inflate)}`, () => {
    const pts: THREE.Vector2[] = [];
    const closeTop = t1 >= 1, closeBottom = t0 <= 0;
    if (closeBottom) pts.push(new THREE.Vector2(0.0001, t0));
    for (let i = 0; i <= 10; i++) {
      const t = t0 + ((t1 - t0) * i) / 10;
      pts.push(new THREE.Vector2(torsoR(body, t) * inflate, t));
    }
    if (closeTop) pts.push(new THREE.Vector2(0.0001, t1));
    return new THREE.LatheGeometry(pts, 18);
  });

/**
 * A piece of the torso surface between heights t0 and t1, spanning angles `from(t)`..`to(t)` around the body
 * (0 = the middle of the chest, π = the middle of the back). Drawn in the torso's own unscaled space, like `torso`.
 * Used for necklines, lapels, plackets and straps, whose width changes with height.
 */
export const torsoPatch = (key: string, body: Look['body'], t0: number, t1: number, from: (t: number) => number, to: (t: number) => number, inflate: number) =>
  geo(`patch|${key}|${body}|${q(inflate)}`, () => {
    const rows = 10, cols = 8;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const t = t0 + ((t1 - t0) * i) / rows;
      const r = torsoR(body, t) * inflate, a = from(t), b = to(t);
      for (let j = 0; j <= cols; j++) {
        const phi = a + ((b - a) * j) / cols;
        pos.push(r * Math.sin(phi), t, r * Math.cos(phi));
        uv.push(j / cols, i / rows);
      }
    }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j, b = a + cols + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });

/** Where a point on the torso surface sits in the chest's space (the torso is drawn scaled by W, torsoH, depth). */
export function onTorso(body: Look['body'], phi: number, t: number, inflate: number, W: number, torsoH: number, depth: number) {
  const r = torsoR(body, t) * inflate;
  return new THREE.Vector3(r * Math.sin(phi) * W, t * torsoH, r * Math.cos(phi) * depth);
}

/** A thin tube laid along the torso surface through [angle, height] points: chains and backpack straps. */
export const torsoTube = (key: string, body: Look['body'], pts: [number, number][], inflate: number, W: number, torsoH: number, depth: number, radius: number, closed = false) =>
  geo(`tube|${key}|${body}|${q(inflate)}|${q(W)}|${q(torsoH)}|${q(depth)}|${q(radius)}`, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([phi, t]) => onTorso(body, phi, t, inflate, W, torsoH, depth)), closed);
    return new THREE.TubeGeometry(curve, closed ? 48 : 24, radius, 5, closed);
  });

// Head as a lathe: round cranium tapering to the jaw and chin, so the face has no seams.
const HEAD: [number, number][] = [[-0.138, 0.0001], [-0.132, 0.03], [-0.115, 0.058], [-0.085, 0.083], [-0.045, 0.102], [0, 0.111], [0.045, 0.112], [0.085, 0.102], [0.115, 0.08], [0.135, 0.045], [0.142, 0.0001]];
export const headGeo = () =>
  geo('head', () => {
    const curve = new THREE.SplineCurve(HEAD.map(([y, r]) => new THREE.Vector2(r, y)));
    return new THREE.LatheGeometry(curve.getPoints(24), 20);
  });

/**
 * Hair or a hat: the head's own outline, pushed out and cut off at a hairline. `back` keeps only the back half (the nape).
 * `yMax` cuts the top off too, for a band such as a beanie's folded cuff.
 */
export const headShell = (yMin: number, inflate: number, back = false, yMax = 1) =>
  geo(`shell|${q(yMin)}|${q(inflate)}|${back}|${q(yMax)}`, () => {
    const curve = new THREE.SplineCurve(HEAD.map(([y, r]) => new THREE.Vector2(r, y)));
    const pts = curve.getPoints(48).filter((v) => v.y >= yMin && v.y <= yMax);
    return new THREE.LatheGeometry(
      pts.map((v) => new THREE.Vector2(Math.max(0.0001, v.x * inflate), v.y * (1 + (inflate - 1) * 0.6))),
      20,
      back ? Math.PI * 0.5 - 0.25 : 0,
      back ? Math.PI + 0.5 : Math.PI * 2,
    );
  });

// Fabric textures, drawn once on a canvas in greys near white so the chosen colour still shows through.
// Denim gets a diagonal twill, knits (beanies, cuffs, hoodie hems) get ribs.
const TEX = new Map<string, THREE.Texture>();
function fabric(key: string, draw: (c: CanvasRenderingContext2D, n: number) => void, repeat: [number, number]) {
  let t = TEX.get(key);
  if (t) return t;
  const n = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const c = canvas.getContext('2d')!;
  draw(c, n);
  t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}
export const denim = () =>
  fabric('denim', (c, n) => {
    c.fillStyle = '#E4E4E4';
    c.fillRect(0, 0, n, n);
    for (let i = -n; i < n * 2; i += 4) {
      c.strokeStyle = i % 8 === 0 ? '#FFFFFF' : '#CACACA';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + n, n);
      c.stroke();
    }
    // a few lighter flecks, like a worn wash
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(255,255,255,${0.25 + ((i * 37) % 10) / 25})`;
      c.fillRect((i * 29) % n, (i * 53) % n, 2, 1);
    }
  }, [6, 8]);
export const knit = () =>
  fabric('knit', (c, n) => {
    for (let x = 0; x < n; x++) {
      const k = 0.5 + 0.5 * Math.cos((x / n) * Math.PI * 2 * 8);
      const v = Math.round(200 + 55 * k);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(x, 0, 1, n);
    }
  }, [2, 1]);

// Level of detail. A figure is ~40 meshes up close, which is a lot of draw calls once a city has dozens of people in view.
// Beyond NEAR_D the face, hands and small details are hidden and only the body, legs and head cast shadows;
// beyond MID_D the shoes and neck go too and nothing casts a shadow. Meshes say how far they stay drawn with `userData`.
export const NEAR = { lod: 0 }; // drawn up close only
export const MID = { lod: 1 }; // drawn up close and at middle distance
export const MID_SHADOW = { lod: 2, shadow: 1 }; // always drawn, casts a shadow up to middle distance
