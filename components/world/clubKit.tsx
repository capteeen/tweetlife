'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Figure } from './Figure';
import type { FigureAct } from './figureMoves';
import { FaceCamera } from './FaceCamera';
import { DistanceDetail } from './DistanceDetail';
import { FLOOR_Y, type DanceFloor } from '@/lib/world/interiors';

// Building blocks for the club interiors. A club has hundreds of props (stools, bottles, booths, palms), and every
// mesh is a draw call, so the static ones are merged into two meshes per club: one lit, one glowing. The moving
// ones (dance floors, beams, lasers, string lights) are instanced, one draw call each.

export { FLOOR_Y };
const FONT = '/fonts/inter-600.woff';

export type Shape = 'box' | 'cyl' | 'cone' | 'sphere';
/** One prop piece: centre, size (w, h, d; cylinders use w as the diameter), colour, rotation and shape. */
export type Part = { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number]; shape?: Shape };

const unit: Record<Shape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone: () => new THREE.CylinderGeometry(0, 0.5, 1, 8),
  sphere: () => new THREE.SphereGeometry(0.5, 10, 8),
};
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const col = new THREE.Color();

/** Merge parts into one geometry with vertex colours. */
export function mergeParts(parts: Part[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const geos = parts.map((pt) => {
    const g = unit[pt.shape ?? 'box']();
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    col.set(pt.c);
    const cs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cs.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    e.set(...(pt.r ?? [0, 0, 0]));
    m4.compose(new THREE.Vector3(...pt.p), q.setFromEuler(e), new THREE.Vector3(...pt.s));
    g.applyMatrix4(m4);
    return g.index ? g.toNonIndexed() : g;
  });
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return out;
}

/** A club's static props: `parts` lit and shaded, `glow` self-lit (neon, candles, LED strips). */
export function Kit({ parts, glow, roughness = 0.6 }: { parts: Part[]; glow?: Part[]; roughness?: number }) {
  const solid = useMemo(() => mergeParts(parts), [parts]);
  const lit = useMemo(() => mergeParts(glow ?? []), [glow]);
  useEffect(() => () => {
    solid?.dispose();
    lit?.dispose();
  }, [solid, lit]);
  return (
    <group>
      {solid && (
        <mesh geometry={solid} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={roughness} metalness={0.15} />
        </mesh>
      )}
      {lit && (
        <mesh geometry={lit}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- part helpers

export const box = (p: [number, number, number], s: [number, number, number], c: string, r?: [number, number, number]): Part => ({ p, s, c, r });
export const cyl = (p: [number, number, number], d: number, h: number, c: string, r?: [number, number, number]): Part => ({ p, s: [d, h, d], c, r, shape: 'cyl' });
export const ball = (p: [number, number, number], d: number, c: string): Part => ({ p, s: [d, d, d], c, shape: 'sphere' });
export const cone = (p: [number, number, number], d: number, h: number, c: string, r?: [number, number, number]): Part => ({ p, s: [d, h, d], c, r, shape: 'cone' });

/** A bar stool at floor level. */
export const stool = (x: number, z: number, seat: string): Part[] => [cyl([x, FLOOR_Y + 0.4, z], 0.08, 0.8, '#8A8F98'), cyl([x, FLOOR_Y + 0.82, z], 0.5, 0.08, seat), cyl([x, FLOOR_Y + 0.03, z], 0.4, 0.04, '#5A5F68')];

/** Shelves of bottles against a wall: `n` per shelf, `rows` shelves, centred on x along the given axis. */
export function bottleWall(cx: number, cz: number, len: number, rows: number, alongX: boolean, wood: string): Part[] {
  const cols = ['#2E7D32', '#8D6E63', '#F9A825', '#C62828', '#ECEFF1', '#4E342E', '#1565C0'];
  const out: Part[] = [];
  const n = Math.floor(len / 0.42);
  for (let r = 0; r < rows; r++) {
    const y = FLOOR_Y + 1.35 + r * 0.7;
    out.push(alongX ? box([cx, y, cz], [len, 0.06, 0.4], wood) : box([cx, y, cz], [0.4, 0.06, len], wood));
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 0.21 + i * 0.42;
      const h = 0.34 + ((i * 7 + r * 3) % 4) * 0.04;
      out.push(cyl(alongX ? [cx + t, y + 0.03 + h / 2, cz] : [cx, y + 0.03 + h / 2, cz + t], 0.17, h, cols[(i + r * 2) % cols.length]));
    }
  }
  return out;
}

/** A palm tree: segmented trunk and a crown of fronds. */
export function palm(x: number, z: number, h: number, seed = 0): Part[] {
  const out: Part[] = [];
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    out.push(cyl([x + Math.sin(t * 1.4 + seed) * 0.25 * t, FLOOR_Y + (i + 0.5) * (h / segs), z], 0.32 - t * 0.1, h / segs + 0.05, i % 2 ? '#8B6B4A' : '#7A5C3E'));
  }
  const top: [number, number, number] = [x + Math.sin(1.4 + seed) * 0.25, FLOOR_Y + h, z];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + seed;
    out.push(box([top[0] + Math.cos(a) * 1.1, top[1] - 0.25, top[2] + Math.sin(a) * 1.1], [2.4, 0.06, 0.55], k % 2 ? '#2E7D32' : '#3E9E44', [0, -a, -0.38]));
  }
  out.push(ball(top, 0.5, '#5D4A2E'));
  return out;
}

// ---------------------------------------------------------------- people

/** A regular who plays one move forever, with an optional name over their head (the resident DJ). */
/** How far away the clubs' people are still drawn. */
const NPC_RANGE = 42;

export function Npc({ seed, act, position, rot = 0, name, nameColor = '#FFFFFF' }: { seed: string; act: FigureAct | null; position: [number, number, number]; rot?: number; name?: string; nameColor?: string }) {
  const actRef = useRef<FigureAct | null>(act);
  const speed = useRef(0);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* a figure is a dozen draw calls, and the club's walls hide its crowd from the street anyway */}
      <DistanceDetail shadowWithin={18} hideBeyond={NPC_RANGE}>
        <Figure seed={seed} actRef={actRef} speedRef={speed} dim />
      </DistanceDetail>
      {name && (
        <FaceCamera position={[0, 2.25, 0]}>
          <Text font={FONT} fontSize={0.34} color={nameColor} outlineWidth={0.03} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
            {name}
          </Text>
        </FaceCamera>
      )}
    </group>
  );
}

/** A neon word on a wall, glowing in its colour. */
export function Neon({ text, position, rotation = [0, 0, 0], size = 0.8, color }: { text: string; position: [number, number, number]; rotation?: [number, number, number]; size?: number; color: string }) {
  return (
    <Text font={FONT} position={position} rotation={rotation} fontSize={size} anchorX="center" anchorY="middle" outlineWidth={size * 0.04} outlineColor="#0B0E14">
      {text}
      <meshBasicMaterial color={color} toneMapped={false} />
    </Text>
  );
}

// ---------------------------------------------------------------- lights, floors and effects (instanced)

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

/**
 * An LED dance floor: an n x m grid of tiles (or only those inside a circle) that light up in patterns on the beat.
 * `beat()` comes from the club's music clock so the floor and the sound agree.
 */
export function LedFloor({ floor, palette, beat }: { floor: DanceFloor; palette: string[]; beat: () => number }) {
  const { n, m, tile, round = false } = floor;
  const at = useMemo<[number, number]>(() => [floor.x, floor.z], [floor.x, floor.z]);
  const cells = useMemo(() => {
    const out: { i: number; j: number }[] = [];
    for (let j = 0; j < m; j++)
      for (let i = 0; i < n; i++) {
        const x = i - (n - 1) / 2, z = j - (m - 1) / 2;
        if (round && Math.hypot(x, z) > n / 2) continue;
        out.push({ i, j });
      }
    return out;
  }, [n, m, round]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(tile - 0.06, floor.tileH, tile - 0.06), [tile, floor.tileH]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    cells.forEach(({ i, j }, k) => {
      tmp.position.set(at[0] + (i - (n - 1) / 2) * tile, floor.top - floor.tileH / 2, at[1] + (j - (m - 1) / 2) * tile);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, at, n, m, tile, floor.top, floor.tileH]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const b = beat();
    const bar = Math.floor(b / 4);
    const pulse = Math.pow(1 - (b % 1), 3);
    const mode = bar % 3;
    const cx = (n - 1) / 2, cz = (m - 1) / 2;
    cells.forEach(({ i, j }, k) => {
      let on: boolean;
      if (mode === 0) on = (i + j + bar) % 3 === Math.floor(b) % 3 || (i * 7 + j * 3 + Math.floor(b)) % 5 === 0;
      else if (mode === 1) on = Math.floor(Math.hypot(i - cx, j - cz)) % 4 === Math.floor(b * 2) % 4; // rings out from the middle
      else on = (i + Math.floor(b * 2)) % n < 2 || (j + Math.floor(b)) % m < 1; // sweeps
      const c = palette[(i + j * 2 + bar) % palette.length];
      tmpColor.set(c).multiplyScalar(on ? 1.1 + pulse * 1.6 : 0.1);
      mesh.setColorAt(k, tmpColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, cells.length]} frustumCulled={false} receiveShadow>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

export type Beam = { p: [number, number, number]; len: number; width: number };

/**
 * Light beams: additive cones hanging from a rig (moving heads, par cans pointing up, lasers when thin). Each one
 * sways on its own, takes a palette colour that changes per bar, and brightens on the beat.
 */
export function Beams({ beams, palette, beat, sway = 0.55, speed = 1, up = false, strength = 0.32, flicker = false }: { beams: Beam[]; palette: string[]; beat: () => number; sway?: number; speed?: number; up?: boolean; strength?: number; flicker?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // unit cone with its tip at the origin, opening along -y (or +y when pointing up)
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0, 0.5, 1, 14, 1, true);
    g.translate(0, -0.5, 0);
    if (up) g.rotateX(Math.PI);
    return g;
  }, [up]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const b = beat();
    const bar = Math.floor(b / 4);
    const pulse = Math.pow(1 - (b % 1), 3);
    beams.forEach((bm, i) => {
      const t = clock.elapsedTime * speed * (0.7 + (i % 5) * 0.13) + i;
      tmp.position.set(...bm.p);
      tmp.rotation.set(Math.sin(t) * sway, 0, Math.cos(t * 1.3) * sway);
      tmp.scale.set(bm.width, bm.len, bm.width);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      const on = !flicker || (Math.floor(b * 2) + i) % 3 !== 0;
      tmpColor.set(palette[(i + bar) % palette.length]).multiplyScalar(on ? strength * (0.5 + pulse) : 0);
      mesh.setColorAt(i, tmpColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, beams.length]} frustumCulled={false}>
      <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

/** Small glowing bulbs (string lights, lanterns, strobes) that twinkle or flash with the music. */
export function Bulbs({ at, palette, size = 0.14, beat, mode = 'twinkle' }: { at: [number, number, number][]; palette: string[]; size?: number; beat: () => number; mode?: 'twinkle' | 'strobe' | 'chase' }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(0.5, 8, 6), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    at.forEach((p, i) => {
      tmp.position.set(...p);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(size);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [at, size]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const b = beat();
    at.forEach((_, i) => {
      let k: number;
      if (mode === 'strobe') k = (Math.floor(b * 4) + i) % 8 === 0 ? 3 : 0.05;
      else if (mode === 'chase') k = (i + Math.floor(b * 2)) % 6 === 0 ? 2.2 : 0.6;
      else k = 0.75 + 0.35 * Math.sin(clock.elapsedTime * 2.3 + i * 1.7);
      tmpColor.set(palette[i % palette.length]).multiplyScalar(k);
      mesh.setColorAt(i, tmpColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, at.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Bulbs hung in a sagging line between two points. */
export function sagLine(a: [number, number, number], b: [number, number, number], n: number, sag: number): [number, number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
  });
}

/** Vertical LED bars behind a stage that ripple in the palette on the beat. */
export function LedWall({ at, w, h, bars, palette, beat }: { at: [number, number, number]; w: number; h: number; bars: number; palette: string[]; beat: () => number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 0.08), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const b = beat();
    const bar = Math.floor(b / 4);
    const pulse = Math.pow(1 - (b % 1), 2);
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const lvl = 0.25 + 0.75 * Math.abs(Math.sin(clock.elapsedTime * 2 + i * 0.6 + bar)) * (0.5 + pulse * 0.5);
      tmp.position.set(at[0] - w / 2 + bw * (i + 0.5), at[1] + (h * lvl) / 2, at[2]);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(bw * 0.8, h * lvl, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      tmpColor.set(palette[(i + bar) % palette.length]).multiplyScalar(1.2 + pulse);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, bars]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Two spinning platters on the DJ's decks. */
export function Decks({ position, accent }: { position: [number, number, number]; accent: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    g.current?.children.forEach((c) => (c.rotation.y += dt * 3.5));
  });
  return (
    <group ref={g} position={position}>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.05, 16]} />
          <meshStandardMaterial color="#1A1A1A" emissive={accent} emissiveIntensity={0.15} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
