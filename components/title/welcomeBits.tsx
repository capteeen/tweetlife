'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Plane } from '@/components/world/Plane';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { prng } from '@/lib/world/seed';

// Pieces shared by the welcome page's two scenes (the hero city and the three countries): the speech-bubble
// island, bubble-shaped buildings with lit windows, trees, coins, clouds, and a plane flying with a contrail.

export const WHITE = '#F8FAFD';
export const GOLD = '#FFC83D';
export const GRASS = '#7DD36F';

/** A speech bubble outline: a circle with a tail, in the XY plane. */
export function bubbleShape(r: number, tailAt: number, tailLen: number) {
  const s = new THREE.Shape();
  const gap = 0.32;
  s.absarc(0, 0, r, tailAt + gap, tailAt - gap + Math.PI * 2, false);
  s.lineTo(Math.cos(tailAt - 0.12) * (r + tailLen), Math.sin(tailAt - 0.12) * (r + tailLen));
  s.closePath();
  return s;
}

/** A floating speech-bubble island: a thick white slab with a lawn on top. */
export function IslandBase({ r, tailAt = -0.75, top = GRASS, rim = WHITE, depth = 2.4 }: { r: number; tailAt?: number; top?: string; rim?: string; depth?: number }) {
  const base = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(bubbleShape(r, tailAt, r * 0.28), { depth, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.7, bevelSegments: 4, curveSegments: 64 });
    g.rotateX(Math.PI / 2); // shape XY -> XZ, extruded downward
    g.translate(0, -0.7, 0);
    return g;
  }, [r, tailAt, depth]);
  useLayoutEffect(() => () => base.dispose(), [base]);
  return (
    <group>
      <mesh geometry={base} receiveShadow>
        <meshStandardMaterial color={rim} roughness={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[r - 0.6, 72]} />
        <meshStandardMaterial color={top} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** A flat ring (a pavement, a road) lying on the ground, raised by `h` with a kerb edge. */
export function RingSlab({ inner, outer, h, y = 0, color, segments = 128 }: { inner: number; outer: number; h: number; y?: number; color: string; segments?: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: segments });
    g.rotateX(-Math.PI / 2); // up from y=0 to y=h
    return g;
  }, [inner, outer, h, segments]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position-y={y} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

let tail: THREE.ExtrudeGeometry | null = null;
const tailGeo = () => {
  if (tail) return tail;
  const s = new THREE.Shape();
  s.moveTo(0, 1.1);
  s.lineTo(1.0, 1.1);
  s.lineTo(-0.55, 0);
  s.closePath();
  tail = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 });
  tail.translate(0, 0, -0.25);
  return tail;
};

export type Block = { x: number; z: number; w: number; d: number; h: number; antenna?: boolean };
export const faceOut = (b: { x: number; z: number }) => Math.atan2(b.x, b.z || 0.001);

/** Storeys are tall enough for a person, and the door is taller than the people walking past it. */
export const STOREY = 1.15;
export const FIRST_ROW = 2.25;
export const DOOR = { w: 0.8, h: 1.6 };

/** A white rounded tower with the logo's speech-bubble tail at its foot, a door with an awning, and a roof. */
export function BubbleBuilding({ b, color = WHITE, glow = '#DCEBFA', awning = '#2F8FEA', roof = true }: { b: Block; color?: string; glow?: string; awning?: string; roof?: boolean }) {
  const rot = faceOut(b);
  const mat = <meshStandardMaterial color={color} roughness={0.45} emissive={glow} emissiveIntensity={0.35} />;
  const kind = Math.abs(Math.round(b.x * 7 + b.z * 3)) % 3;
  return (
    <group position={[b.x, 0, b.z]} rotation-y={rot}>
      <RoundedBox args={[b.w, b.h, b.d]} radius={Math.min(0.55, b.w * 0.2)} smoothness={3} position-y={b.h / 2 + 0.25} castShadow receiveShadow>
        {mat}
      </RoundedBox>
      <mesh geometry={tailGeo()} position={[-b.w / 2 + 0.25, 0.02, b.d / 2 - 0.45]} castShadow>
        {mat}
      </mesh>
      <RoundedBox args={[DOOR.w, DOOR.h, 0.2]} radius={0.08} smoothness={2} position={[0.25, DOOR.h / 2 + 0.12, b.d / 2]}>
        <meshStandardMaterial color="#F4A62A" roughness={0.5} />
      </RoundedBox>
      {/* a little awning over the door */}
      <mesh position={[0.25, DOOR.h + 0.3, b.d / 2 + 0.3]} rotation-x={0.35} castShadow>
        <boxGeometry args={[DOOR.w + 0.5, 0.06, 0.65]} />
        <meshStandardMaterial color={awning} roughness={0.6} />
      </mesh>
      {roof && !b.antenna && kind === 0 && (
        // a water tank on legs
        <group position={[-b.w * 0.18, b.h + 0.25, -b.d * 0.12]}>
          <mesh position-y={0.75} castShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.7, 12]} />
            <meshStandardMaterial color="#C98B5A" roughness={0.8} />
          </mesh>
          <mesh position-y={1.18}>
            <coneGeometry args={[0.4, 0.22, 12]} />
            <meshStandardMaterial color="#9A6B43" roughness={0.8} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.22, 0.2, 0]}>
              <boxGeometry args={[0.05, 0.4, 0.05]} />
              <meshStandardMaterial color="#8A94A3" />
            </mesh>
          ))}
        </group>
      )}
      {roof && !b.antenna && kind !== 0 && (
        // air conditioning units and a roof garden
        <group position-y={b.h + 0.25}>
          {[0, 1].map((i) => (
            <mesh key={i} position={[(i - 0.5) * b.w * 0.42, 0.18, -b.d * 0.2]} castShadow>
              <boxGeometry args={[0.5, 0.36, 0.42]} />
              <meshStandardMaterial color="#DCE3EC" roughness={0.6} />
            </mesh>
          ))}
          {kind === 2 && (
            <mesh position={[0, 0.12, b.d * 0.22]}>
              <boxGeometry args={[b.w * 0.55, 0.24, b.d * 0.28]} />
              <meshStandardMaterial color="#5DBB5A" roughness={0.9} />
            </mesh>
          )}
        </group>
      )}
      {b.antenna && (
        <group position-y={b.h + 0.25}>
          <mesh position-y={0.5}>
            <cylinderGeometry args={[0.05, 0.07, 1, 6]} />
            <meshStandardMaterial color="#DDE4EC" />
          </mesh>
          <mesh position-y={1.1}>
            <sphereGeometry args={[0.2, 14, 10]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.35} metalness={0.3} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Every window of every building in one instanced mesh; most glow, a few are dark. */
export function Windows({ blocks, lit = '#FFD54A', dark = '#CFE3F6', seed = 7 }: { blocks: Block[]; lit?: string; dark?: string; seed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => {
    const out: { m: THREE.Matrix4; on: boolean }[] = [];
    const rnd = prng(seed);
    const o = new THREE.Object3D();
    const parent = new THREE.Object3D();
    for (const b of blocks) {
      parent.position.set(b.x, 0, b.z);
      parent.rotation.set(0, faceOut(b), 0);
      parent.updateMatrix();
      const rows = Math.max(1, Math.floor((b.h - 1.7) / STOREY));
      for (let face = 0; face < 4; face++) {
        const span = face % 2 === 0 ? b.w : b.d;
        const depth = face % 2 === 0 ? b.d : b.w;
        const cols = Math.max(1, Math.floor((span - 0.7) / 0.72));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const u = (c - (cols - 1) / 2) * 0.72;
            const off = depth / 2 + 0.01;
            const a = (face * Math.PI) / 2;
            o.position.set(Math.cos(a) * u + Math.sin(a) * off, FIRST_ROW + r * STOREY, -Math.sin(a) * u + Math.cos(a) * off);
            o.rotation.set(0, a, 0);
            o.updateMatrix();
            out.push({ m: parent.matrix.clone().multiply(o.matrix), on: rnd() > 0.18 });
          }
        }
      }
    }
    return out;
  }, [blocks, seed]);
  useLayoutEffect(() => {
    const m = ref.current!;
    const c = new THREE.Color();
    list.forEach((w, i) => {
      m.setMatrixAt(i, w.m);
      m.setColorAt(i, c.set(w.on ? lit : dark));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [list, lit, dark]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <boxGeometry args={[0.44, 0.6, 0.08]} />
      <meshBasicMaterial color="#FFFFFF" />
    </instancedMesh>
  );
}

export type TreeSpot = { x: number; z: number; s: number; tint: number };
const LEAVES = ['#3FAE4F', '#4CC25A', '#62CF5E'];

/** Round low-poly trees, all in two instanced meshes. */
export function TreeField({ spots, leaves = LEAVES }: { spots: TreeSpot[]; leaves?: string[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((t, i) => {
      o.position.set(t.x, 0.45 * t.s, t.z);
      o.scale.setScalar(t.s);
      o.rotation.set(0, t.tint * 6, 0);
      o.updateMatrix();
      trunks.current!.setMatrixAt(i, o.matrix);
      o.position.set(t.x, 1.35 * t.s, t.z);
      o.updateMatrix();
      crowns.current!.setMatrixAt(i, o.matrix);
      crowns.current!.setColorAt(i, c.set(leaves[Math.floor(t.tint * leaves.length) % leaves.length]));
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
    if (crowns.current!.instanceColor) crowns.current!.instanceColor.needsUpdate = true;
  }, [spots, leaves]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.9, 6]} />
        <meshStandardMaterial color="#9A6B43" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} castShadow>
        <icosahedronGeometry args={[0.75, 1]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  );
}

export function Coin({ position, scale = 1 }: { position?: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.32, 0.32, 0.09, 24]} />
        <meshStandardMaterial color={GOLD} emissive="#FFB300" emissiveIntensity={0.35} metalness={0.35} roughness={0.3} />
      </mesh>
      {/* a raised rim on both faces (a torus already lies face-on, like the coin) */}
      {[-0.05, 0.05].map((z) => (
        <mesh key={z} position-z={z}>
          <torusGeometry args={[0.22, 0.025, 6, 24]} />
          <meshStandardMaterial color="#F2A100" metalness={0.4} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

let puff: THREE.SphereGeometry | null = null;
const puffGeo = () => (puff ??= new THREE.SphereGeometry(1, 18, 12));

/** Puffy clouds on a slow turn, far enough out that they never come between the camera and the island. */
export function Clouds({ count = 9, rMin = 62, rSpread = 18, seed = 3 }: { count?: number; rMin?: number; rSpread?: number; seed?: number }) {
  const clouds = useMemo(() => {
    const rnd = prng(seed);
    // a few sit below the island, so it reads as floating
    return Array.from({ length: count }, (_, i) => ({
      a: (i / count) * Math.PI * 2 + rnd() * 0.4,
      r: rMin + rnd() * rSpread,
      y: i % 3 === 2 ? -16 - rnd() * 8 : 2 + rnd() * 16,
      s: 3.2 + rnd() * 2.4,
      puffs: Array.from({ length: 4 + Math.floor(rnd() * 3) }, (_, k) => [k * 1.1 - 1.8 + rnd() * 0.4, rnd() * 0.5, (rnd() - 0.5) * 0.9, 0.9 + rnd() * 0.7] as const),
    }));
  }, [count, rMin, rSpread, seed]);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += Math.min(dt, 0.1) * 0.012;
  });
  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <group key={i} position={[Math.sin(c.a) * c.r, c.y, Math.cos(c.a) * c.r]} rotation-y={c.a} scale={c.s}>
          {c.puffs.map(([x, y, z, s], k) => (
            <mesh key={k} geometry={puffGeo()} position={[x, y, z]} scale={[s, s * 0.8, s]}>
              <meshStandardMaterial color="#FFFFFF" roughness={1} emissive="#F2F8FF" emissiveIntensity={0.7} />
            </mesh>
          ))}
          {/* a flat, slightly bluer underside */}
          <mesh geometry={puffGeo()} position={[0, -0.35, 0]} scale={[3.2, 0.35, 1.1]}>
            <meshStandardMaterial color="#E6F1FC" roughness={1} emissive="#DCEBFA" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export type FlightPose = { x: number; y: number; z: number; heading: number; pitch: number; bank: number };

// the airliner's cheat lines and its windows plus cockpit glass, each merged into one mesh
let cheat: THREE.BufferGeometry | null = null;
let glass: THREE.BufferGeometry | null = null;
const cheatGeo = () => (cheat ??= mergeGeometries([-1, 1].map((side) => new THREE.BoxGeometry(0.04, 0.16, 9.6).translate(side * 0.86, 1.45, 0.4)))!);
const glassGeo = () =>
  (glass ??= mergeGeometries([
    ...[-1, 1].flatMap((side) => Array.from({ length: 14 }, (_, i) => new THREE.BoxGeometry(0.03, 0.16, 0.2).translate(side * 0.875, 1.82, -3.6 + i * 0.62))),
    new THREE.BoxGeometry(0.95, 0.22, 0.5).rotateX(-0.5).translate(0, 1.95, 5.75),
  ])!);

const TRAIL = 70;
const TRAIL_EVERY = 0.03;

/**
 * The game's airliner (components/world/Plane.tsx) in flight: `fly(t)` says where it is at time t. A cheat line
 * and windows in the livery colour dress it up, and its engines leave a contrail that spreads and fades.
 */
export function FlyingPlane({ fly, country, tint, scale = 1 }: { fly: (t: number) => FlightPose; country?: CountryId; tint?: string; scale?: number }) {
  const livery = country ? COUNTRIES[country].theme.primary : tint ?? '#1D9BF0';
  const plane = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const st = useRef({ samples: [] as { p: THREE.Vector3; t: number }[], last: -1, now: 0 });
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), v: new THREE.Vector3() }), []);
  useFrame((_, dt) => {
    const s = st.current;
    s.now += Math.min(dt, 0.1);
    const pose = fly(s.now);
    const g = plane.current;
    if (!g) return;
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(pose.pitch, pose.heading, pose.bank, 'YXZ');
    g.updateMatrix();
    // drop two puffs (one per engine) every so often
    if (s.now - s.last > TRAIL_EVERY) {
      s.last = s.now;
      for (const side of [-1, 1]) {
        s.samples.push({ p: tmp.v.set(side * 2.6 * scale, -0.8 * scale, -0.6 * scale).applyMatrix4(g.matrix).clone(), t: s.now });
      }
      while (s.samples.length > TRAIL * 2) s.samples.shift();
    }
    const m = trail.current;
    if (!m) return;
    const life = TRAIL * TRAIL_EVERY;
    s.samples.forEach((sm, i) => {
      const age = (s.now - sm.t) / life; // 0 new .. 1 gone
      const k = Math.max(0, Math.min(1, age * 5)) * Math.max(0, 1 - age);
      tmp.o.position.copy(sm.p);
      tmp.o.scale.setScalar(Math.max(0.001, (0.3 + age * 0.6) * k * scale));
      tmp.o.updateMatrix();
      m.setMatrixAt(i, tmp.o.matrix);
    });
    m.count = s.samples.length;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <group ref={plane} matrixAutoUpdate={false}>
        <group position-y={-1.6 * scale} scale={scale}>
          <Plane kind="airliner" country={country} tint={tint} flying />
          {/* cheat line, windows and the cockpit glass */}
          <mesh geometry={cheatGeo()}>
            <meshStandardMaterial color={livery} roughness={0.5} />
          </mesh>
          <mesh geometry={glassGeo()}>
            <meshStandardMaterial color="#26344A" roughness={0.2} metalness={0.3} />
          </mesh>
        </group>
      </group>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.6} transparent opacity={0.45} depthWrite={false} roughness={1} />
      </instancedMesh>
    </group>
  );
}
