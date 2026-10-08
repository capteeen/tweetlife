import * as THREE from 'three';
import { prng } from '@/lib/world/seed';

// Surface detail for the ground: asphalt grain with patches and cracks, paving slabs with grout, mottled grass.
// Each is a small tileable grey texture painted once on a canvas and multiplied over the surface's own colour in
// world space (so a stretched slab or a ring road tiles evenly, and lush/dry/sand tints still come through).
// No extra draw calls: it only changes the materials the ground already uses.

export type Detail = 'asphalt' | 'paving' | 'grass';

const SIZE = 256;
/** world units one tile covers */
const TILE: Record<Detail, number> = { asphalt: 7, paving: 2.4, grass: 5 };

const gray = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

/** Draw `fn` at the tile and its wrapped neighbours so marks crossing an edge continue on the other side. */
function wrapped(fn: (ox: number, oy: number) => void) {
  for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) fn(ox, oy);
}

function blobs(g: CanvasRenderingContext2D, rnd: () => number, n: number, r0: number, r1: number, v0: number, v1: number, a: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = r0 + rnd() * (r1 - r0), v = v0 + rnd() * (v1 - v0);
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, gray(v, a));
      grad.addColorStop(1, gray(v, 0));
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
}

function speckle(g: CanvasRenderingContext2D, rnd: () => number, n: number, v0: number, v1: number, a = 1, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = gray(v0 + rnd() * (v1 - v0), a);
    g.fillRect(Math.floor(rnd() * SIZE), Math.floor(rnd() * SIZE), size, size);
  }
}

function crack(g: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, len: number, v: number) {
  let a = rnd() * Math.PI * 2;
  const pts: [number, number][] = [[x, y]];
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 0.9;
    const [px, py] = pts[pts.length - 1];
    pts.push([px + Math.cos(a) * 6, py + Math.sin(a) * 6]);
  }
  wrapped((ox, oy) => {
    g.strokeStyle = gray(v, 0.8);
    g.lineWidth = 1.2;
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
    g.stroke();
  });
}

function paint(kind: Detail, g: CanvasRenderingContext2D) {
  const rnd = prng(kind.length * 977 + 13);
  g.fillStyle = gray(128);
  g.fillRect(0, 0, SIZE, SIZE);
  if (kind === 'asphalt') {
    blobs(g, rnd, 26, 25, 70, 112, 142, 0.35);
    // a patched rectangle, a little darker and smoother
    const px = rnd() * SIZE, py = rnd() * SIZE, pw = 50 + rnd() * 40, ph = 30 + rnd() * 30;
    wrapped((ox, oy) => {
      g.fillStyle = gray(110, 0.6);
      g.fillRect(px + ox, py + oy, pw, ph);
      g.strokeStyle = gray(96, 0.5);
      g.strokeRect(px + ox, py + oy, pw, ph);
    });
    speckle(g, rnd, 9000, 92, 168, 0.55);
    speckle(g, rnd, 600, 175, 205, 0.6);
    for (let i = 0; i < 3; i++) crack(g, rnd, rnd() * SIZE, rnd() * SIZE, 10 + Math.floor(rnd() * 14), 70);
  } else if (kind === 'paving') {
    const n = 4, cell = SIZE / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = gray(118 + rnd() * 22);
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    blobs(g, rnd, 10, 10, 30, 105, 125, 0.35); // stains
    speckle(g, rnd, 5000, 100, 160, 0.4);
    g.fillStyle = gray(80);
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * cell - 1.5, 0, 3, SIZE);
      g.fillRect(0, i * cell - 1.5, SIZE, 3);
    }
    g.fillStyle = gray(150, 0.5); // bevel catching the light
    for (let i = 0; i < n; i++) {
      g.fillRect(i * cell + 2, 0, 1, SIZE);
      g.fillRect(0, i * cell + 2, SIZE, 1);
    }
    crack(g, rnd, cell * 1.5, cell * 2.4, 4, 90);
  } else {
    blobs(g, rnd, 30, 30, 80, 100, 152, 0.45);
    blobs(g, rnd, 50, 6, 16, 88, 112, 0.5); // clover and bare patches
    for (let i = 0; i < 5200; i++) {
      // grass blades: short strokes, mostly upright in the texture, light and dark
      const x = rnd() * SIZE, y = rnd() * SIZE, l = 2 + rnd() * 4, a = -Math.PI / 2 + (rnd() - 0.5) * 1.4;
      g.strokeStyle = gray(rnd() < 0.5 ? 150 + rnd() * 40 : 85 + rnd() * 30, 0.55);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
}

const textures = new Map<Detail, THREE.Texture>();
function detailTexture(kind: Detail) {
  let t = textures.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  paint(kind, c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  textures.set(kind, t);
  return t;
}

/** Patch a standard material so its colour is multiplied by `kind`'s detail, sampled in world space. */
export function withDetail<M extends THREE.MeshStandardMaterial>(m: M, kind: Detail, strength = 1): M {
  if (typeof document === 'undefined') return m;
  const tex = detailTexture(kind);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex };
    shader.uniforms.uDetailK = { value: new THREE.Vector2(1 / TILE[kind], strength) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 dw = vec4( transformed, 1.0 );
  vec3 dn = objectNormal;
#ifdef USE_INSTANCING
  dw = instanceMatrix * dw;
  dn = mat3( instanceMatrix ) * dn;
#endif
  vDetailPos = ( modelMatrix * dw ).xyz;
  vDetailN = normalize( mat3( modelMatrix ) * dn );
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform vec2 uDetailK;\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 duv = abs( vDetailN.y ) > 0.5 ? vDetailPos.xz : vec2( vDetailPos.x + vDetailPos.z, vDetailPos.y );
  vec3 dt = texture2D( uDetail, duv * uDetailK.x ).rgb * 2.0;
  diffuseColor.rgb *= mix( vec3( 1.0 ), dt, uDetailK.y );
}`,
      );
  };
  m.customProgramCacheKey = () => 'detail';
  return m;
}
