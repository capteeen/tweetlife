'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Builder } from './treeModels';

// Street furniture: a street light with name signs at every junction, and benches, litter bins, fire hydrants,
// planters and tree-pit grates along the sidewalks. Each kind is one merged, vertex-coloured model drawn as one
// InstancedMesh. The small ones are only drawn within `near` of the camera (they're a few pixels further out).
// At night the lamps light up and throw a warm pool of light on the road.

import type { LightSpot, PropKind, PropSpot } from '@/lib/world/scatter';
type PropItem = PropSpot;
type StreetLight = LightSpot;

const PHONE = typeof window !== 'undefined' && !!window.matchMedia?.('(any-pointer: coarse)').matches;
const NEAR = PHONE ? 30 : 45;

const flat = (hex: string, vary = 0.08) => {
  const c = new THREE.Color(hex);
  let i = 0;
  return (_c: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => {
    // a little light from above baked in, and a touch of per-face variation so flat parts don't look plastic
    const k = 0.92 + 0.08 * n.y + vary * (((i++ * 2654435761) >>> 0) % 100) / 100 - vary / 2;
    out.copy(c).multiplyScalar(k);
  };
};

function box(b: Builder, w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  b.add(g, false, flat(color));
}

function cyl(b: Builder, r0: number, r1: number, h: number, x: number, y: number, z: number, color: string, seg = 10, rotZ = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  b.add(g, false, flat(color, 0.04), true);
}

const IRON = '#2E3A33';
const WOOD = '#8A5A36';

const MODELS: Record<PropKind, () => THREE.BufferGeometry> = {
  bench: () => {
    // seat faces +z
    const b = new Builder();
    for (let k = 0; k < 3; k++) box(b, 1.7, 0.05, 0.11, 0, 0.46, -0.12 + k * 0.13, WOOD);
    for (let k = 0; k < 2; k++) box(b, 1.7, 0.11, 0.05, 0, 0.66 + k * 0.17, -0.26 - k * 0.03, WOOD, -0.18);
    for (const sx of [-0.72, 0.72]) {
      box(b, 0.06, 0.46, 0.06, sx, 0.23, 0.1, IRON);
      box(b, 0.06, 0.88, 0.06, sx, 0.44, -0.25, IRON);
      box(b, 0.06, 0.05, 0.42, sx, 0.62, -0.06, IRON);
      box(b, 0.06, 0.05, 0.42, sx, 0.4, -0.06, IRON);
    }
    return b.build();
  },
  bin: () => {
    const b = new Builder();
    cyl(b, 0.25, 0.27, 0.82, 0, 0.41, 0, '#2F4A3A', 14);
    cyl(b, 0.29, 0.28, 0.07, 0, 0.86, 0, '#26332C', 14);
    cyl(b, 0.12, 0.12, 0.02, 0, 0.9, 0, '#111111', 10);
    for (let k = 0; k < 3; k++) cyl(b, 0.255, 0.255, 0.035, 0, 0.18 + k * 0.25, 0, '#5C6B62', 14);
    return b.build();
  },
  hydrant: () => {
    const b = new Builder();
    const red = '#C8302C';
    cyl(b, 0.17, 0.17, 0.08, 0, 0.04, 0, '#8C2420', 10);
    cyl(b, 0.12, 0.11, 0.5, 0, 0.33, 0, red, 10);
    cyl(b, 0.14, 0.14, 0.05, 0, 0.6, 0, '#9E2622', 10);
    const dome = new THREE.SphereGeometry(0.12, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(0, 0.62, 0);
    b.add(dome, false, flat(red, 0.04), true);
    cyl(b, 0.03, 0.03, 0.06, 0, 0.76, 0, '#9E2622', 6);
    for (const s of [-1, 1]) cyl(b, 0.05, 0.05, 0.14, s * 0.15, 0.4, 0, '#E0DAD0', 8, Math.PI / 2);
    cyl(b, 0.07, 0.07, 0.12, 0, 0.42, 0.14, '#E0DAD0', 8);
    return b.build();
  },
  planter: () => {
    const b = new Builder();
    box(b, 1.2, 0.5, 1.2, 0, 0.25, 0, '#A7A49C');
    box(b, 1.28, 0.06, 1.28, 0, 0.5, 0, '#B9B6AE');
    box(b, 1.02, 0.04, 1.02, 0, 0.51, 0, '#4A3626');
    return b.build();
  },
  pit: () => {
    // tree-pit grate round a street tree: iron frame and bars over mulch
    const b = new Builder();
    box(b, 1.0, 0.02, 1.0, 0, 0.005, 0, '#3E2C1F');
    for (const s of [-1, 1]) {
      box(b, 1.1, 0.03, 0.06, 0, 0.015, s * 0.52, IRON);
      box(b, 0.06, 0.03, 1.1, s * 0.52, 0.015, 0, IRON);
    }
    for (let k = -3; k <= 3; k++) if (Math.abs(k) > 1) box(b, 0.035, 0.025, 1.0, k * 0.13, 0.015, 0, '#3C4740');
    return b.build();
  },
};

const models = new Map<string, THREE.BufferGeometry>();
const model = (k: string, make: () => THREE.BufferGeometry) => {
  let g = models.get(k);
  if (!g) models.set(k, (g = make()));
  return g;
};

let propMaterial: THREE.MeshStandardMaterial | null = null;
const material = () => (propMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));

const tmp = new THREE.Object3D();

function matrices(items: { x: number; y: number; z: number; yaw: number }[]) {
  const out = new Float32Array(items.length * 16);
  items.forEach((it, i) => {
    tmp.position.set(it.x, it.y, it.z);
    tmp.rotation.set(0, it.yaw, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    tmp.matrix.toArray(out, i * 16);
  });
  return out;
}

/** One kind of prop, drawn only near the camera. */
function NearProps({ kind, items, near }: { kind: PropKind; items: PropItem[]; near: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => model(kind, MODELS[kind]), [kind]);
  const all = useMemo(() => matrices(items), [items]);
  const last = useRef({ x: Infinity, z: Infinity });
  useEffect(() => {
    last.current.x = Infinity;
  }, [all]);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    const cx = camera.position.x, cz = camera.position.z;
    if (Math.hypot(cx - last.current.x, cz - last.current.z) < 2) return;
    last.current.x = cx;
    last.current.z = cz;
    const arr = m.instanceMatrix.array as Float32Array;
    let n = 0;
    const r2 = near * near;
    for (let i = 0; i < items.length; i++) {
      const dx = items[i].x - cx, dz = items[i].z - cz;
      if (dx * dx + dz * dz > r2) continue;
      arr.set(all.subarray(i * 16, i * 16 + 16), n * 16);
      n++;
    }
    m.count = n;
    m.visible = n > 0;
    m.instanceMatrix.needsUpdate = true;
  });
  // grates and planters are low and flat: they take shadows but cast none worth drawing
  const cast = kind === 'bench' || kind === 'bin' || kind === 'hydrant';
  return <instancedMesh ref={ref} args={[geo, material(), items.length]} castShadow={cast} receiveShadow frustumCulled={false} />;
}

export function StreetProps({ items, near = NEAR }: { items: PropItem[]; near?: number }) {
  const byKind = useMemo(() => {
    const m = new Map<PropKind, PropItem[]>();
    for (const it of items) (m.get(it.kind) ?? m.set(it.kind, []).get(it.kind)!).push(it);
    return [...m.entries()];
  }, [items]);
  return (
    <group>
      {byKind.map(([k, list]) => (
        <NearProps key={k} kind={k} items={list} near={near} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- street lights and name signs

const POLE_H = 6.2;
const ARM = 2.2;

function poleModel() {
  // pole at the origin, arm reaching out along +x to the lamp head
  const b = new Builder();
  const grey = '#4A5058';
  cyl(b, 0.2, 0.17, 0.6, 0, 0.3, 0, '#3E434A', 10);
  cyl(b, 0.11, 0.075, POLE_H, 0, POLE_H / 2, 0, grey, 10);
  const arm = new THREE.CylinderGeometry(0.045, 0.06, ARM, 6);
  arm.rotateZ(-Math.PI / 2 + 0.08);
  arm.translate(ARM / 2, POLE_H - 0.15, 0);
  b.add(arm, false, flat(grey, 0.04), true);
  box(b, 0.75, 0.16, 0.34, ARM + 0.1, POLE_H - 0.02, 0, '#5A6068');
  box(b, 0.4, 0.08, 0.06, 0.25, POLE_H - 0.42, 0, grey); // bracket for the arm
  return b.build();
}

function lensModel() {
  const g = new THREE.BoxGeometry(0.56, 0.05, 0.26);
  g.translate(ARM + 0.1, POLE_H - 0.12, 0);
  return g;
}

function bladeModel() {
  // a double-sided name blade, 1.5 x 0.32, centred on the pole axis
  return new THREE.BoxGeometry(1.5, 0.32, 0.03);
}

const STREETS = ['Main St', 'Market St', 'Oak St', 'Pine St', 'Maple St', 'Cedar St', 'Elm St', 'Lake St', 'Park St', 'Hill St', 'Union St', 'Grand St', 'Bay St', 'Spring St', 'Mill St', 'Court St'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const COLS = 4, ROWS = 32;

/** Street names on green blades, all in one atlas: cell `street` for the x-running roads, 32 + `avenue` for the others. */
function signAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 2048;
  const g = c.getContext('2d')!;
  const cw = c.width / COLS, ch = c.height / ROWS;
  const cell = (idx: number, text: string) => {
    const x = (idx % COLS) * cw, y = Math.floor(idx / COLS) * ch;
    g.fillStyle = '#1F6B45';
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = '#F2F2EE';
    g.lineWidth = 4;
    g.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
    g.fillStyle = '#F7F7F2';
    g.font = '700 36px Inter, Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + cw / 2, y + ch / 2 + 2, cw - 24);
  };
  for (let i = 0; i < 64; i++) cell(i, STREETS[i % STREETS.length] + (i >= STREETS.length ? ` ${Math.floor(i / STREETS.length) + 1}` : ''));
  for (let i = 0; i < 64; i++) cell(64 + i, `${ordinal(i + 1)} Ave`);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function signMaterial(atlas: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.5, metalness: 0.1 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = vec2( ( mod( aCell, ${COLS}.0 ) + uv.x ) / ${COLS}.0, 1.0 - ( floor( aCell / ${COLS}.0 ) + 1.0 - uv.y ) / ${ROWS}.0 );
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'street-sign';
  return m;
}

/** Light pool on the ground: a soft warm disc, added on top of whatever is below. */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,0.85)');
  grad.addColorStop(0.45, 'rgba(255,190,120,0.35)');
  grad.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function StreetLights({ items, night }: { items: StreetLight[]; night: boolean }) {
  const pole = useRef<THREE.InstancedMesh>(null);
  const lens = useRef<THREE.InstancedMesh>(null);
  const blade = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<THREE.InstancedMesh>(null);
  const poleGeo = useMemo(() => model('pole', poleModel), []);
  const lensGeo = useMemo(() => model('lens', lensModel), []);
  const bladeGeo = useMemo(() => {
    const g = bladeModel();
    const cells = new Float32Array(items.length * 2);
    items.forEach((it, i) => {
      cells[i * 2] = it.street % 64;
      cells[i * 2 + 1] = 64 + (it.avenue % 64);
    });
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    return g;
  }, [items]);
  const atlas = useMemo(() => signAtlas(), []);
  const bladeMat = useMemo(() => signMaterial(atlas), [atlas]);
  const poolTex = useMemo(() => poolTexture(), []);
  useEffect(
    () => () => {
      atlas.dispose();
      poolTex.dispose();
    },
    [atlas, poolTex],
  );
  useEffect(() => {
    const p = pole.current, l = lens.current, b = blade.current;
    if (!p || !l || !b) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, it.y, it.z);
      tmp.rotation.set(0, it.yaw, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      p.setMatrixAt(i, tmp.matrix);
      l.setMatrixAt(i, tmp.matrix);
      // one blade along each road: the x-running street low, the avenue above it
      // blades hang off the pole towards the junction, not skewered through their middle
      tmp.position.set(it.x + Math.sign(Math.cos(it.yaw)) * 0.82, it.y + 3.05, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      b.setMatrixAt(i * 2, tmp.matrix);
      tmp.position.set(it.x, it.y + 3.4, it.z - Math.sign(Math.sin(it.yaw)) * 0.82);
      tmp.rotation.set(0, Math.PI / 2, 0);
      tmp.updateMatrix();
      b.setMatrixAt(i * 2 + 1, tmp.matrix);
    });
    p.instanceMatrix.needsUpdate = l.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
    const q = pool.current;
    if (q) {
      items.forEach((it, i) => {
        const r = ARM + 0.1;
        tmp.position.set(it.x + Math.cos(it.yaw) * r, 0.11, it.z - Math.sin(it.yaw) * r);
        tmp.rotation.set(-Math.PI / 2, 0, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        q.setMatrixAt(i, tmp.matrix);
      });
      q.instanceMatrix.needsUpdate = true;
    }
  }, [items, night, bladeGeo]);
  if (!items.length) return null;
  return (
    <group>
      <instancedMesh ref={pole} args={[poleGeo, material(), items.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={lens} args={[lensGeo, undefined, items.length]} frustumCulled={false}>
        <meshStandardMaterial color={night ? '#FFE2B0' : '#D8DCE0'} emissive="#FFC57A" emissiveIntensity={night ? 3.2 : 0} roughness={0.3} toneMapped={!night} />
      </instancedMesh>
      <instancedMesh ref={blade} args={[bladeGeo, bladeMat, items.length * 2]} castShadow frustumCulled={false} />
      {night && (
        <instancedMesh ref={pool} args={[undefined, undefined, items.length]} frustumCulled={false} renderOrder={1}>
          <planeGeometry args={[9, 9]} />
          <meshBasicMaterial map={poolTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.55} />
        </instancedMesh>
      )}
    </group>
  );
}
