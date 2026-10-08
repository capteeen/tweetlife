'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { DANCE_FLOOR, FLOOR_Y, WALK_IN, WALL, wallsOf, type WalkIn } from '@/lib/world/interiors';
import type { PlacedVenue } from '@/lib/life/venues';
import type { FigureAct } from './figureMoves';
import { Figure } from './Figure';
import { beat } from './clubAudio';
import { DistanceDetail } from './DistanceDetail';
import { useCountry } from './country';
import { COUNTRIES, type Country } from '@/lib/world/countries';
import { curfew, governmentOf, pct, todaysAddress } from '@/lib/life/government';

// Walk-in venues, open to the sky so the camera can follow you in: Club Moon (dance floor, DJ, moving
// lights, mirror ball), the Degen Lounge (bar, booths, slow lights), the gym (racks, benches, treadmills,
// mats), the Trenches Coin Shop (counter, live ticker, coin balloons) and the government house (desk, flags,
// podium with today's address, cabinet table, columns and a dome, all in the country's colours). Built in the
// venue's own frame, door at +z facing the city.

const FONT = '/fonts/inter-600.woff';
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

export function WalkInVenue({ v, near, onClick }: { v: PlacedVenue; near: boolean; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const k = WALK_IN[v.id];
  if (!k) return null;
  const look = SHELL[v.id] ?? SHELL.club;
  return (
    <group>
      <mesh position={[0, 0.1, 1.5]} receiveShadow>
        <boxGeometry args={[k.w + 3, 0.2, k.d + 6]} />
        <meshStandardMaterial color="#B9BCC2" roughness={1} />
      </mesh>
      <mesh position={[0, FLOOR_Y - 0.02, 0]} receiveShadow onClick={onClick}>
        <boxGeometry args={[k.w - WALL, 0.04, k.d - WALL]} />
        <meshStandardMaterial color={look.floor} roughness={0.85} />
      </mesh>
      <Shell k={k} wall={look.wall} trim={v.color} glow={near ? 1.4 : 0.8} onClick={onClick} />
      <Text font={FONT} position={[0, k.h + 0.55, k.d / 2 + 0.05]} fontSize={0.95} color={v.color} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#0B0E14">
        {v.name.toUpperCase()}
        <meshStandardMaterial color={v.color} emissive={v.color} emissiveIntensity={1.6} toneMapped={false} />
      </Text>
      <DistanceDetail shadowWithin={45} hideBeyond={110}>
        {v.id === 'club' && <Club k={k} />}
        {v.id === 'bar' && <Lounge k={k} />}
        {v.id === 'gym' && <Gym k={k} />}
        {v.id === 'exchange' && <CoinShop k={k} />}
        {v.id === 'capitol' && <Capitol k={k} />}
      </DistanceDetail>
    </group>
  );
}

const SHELL: Record<string, { wall: string; floor: string }> = {
  club: { wall: '#231833', floor: '#141018' },
  bar: { wall: '#2A1F3D', floor: '#3A2A22' },
  gym: { wall: '#E8ECEF', floor: '#3B4048' },
  exchange: { wall: '#10302A', floor: '#D9DED8' },
  capitol: { wall: '#EFEAE0', floor: '#D8D0C0' },
};

const FRONT_H = 1.3;

function Shell({ k, wall, trim, glow, onClick }: { k: WalkIn; wall: string; trim: string; glow: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const walls = useMemo(() => wallsOf(k), [k]);
  return (
    <group>
      {walls.map((r, i) => {
        // the street side is a low wall so you can see in from the road (and the camera can follow you in)
        const h = i >= 3 ? FRONT_H : k.h;
        return (
        <group key={i}>
          <mesh position={[r.x, FLOOR_Y + h / 2, r.z]} castShadow receiveShadow onClick={onClick}>
            <boxGeometry args={[r.w, h, r.d]} />
            <meshStandardMaterial color={wall} roughness={0.85} />
          </mesh>
          {/* neon along the top of every wall */}
          <mesh position={[r.x, FLOOR_Y + h + 0.06, r.z]}>
            <boxGeometry args={[r.w + 0.02, 0.12, r.d + 0.02]} />
            <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={glow} toneMapped={false} />
          </mesh>
        </group>
        );
      })}
      {/* posts either side of the door hold up the sign */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * (k.door / 2 + 0.75), FLOOR_Y + k.h / 2, k.d / 2 - WALL / 2]} castShadow>
          <boxGeometry args={[0.35, k.h, 0.35]} />
          <meshStandardMaterial color="#0B0E14" roughness={0.6} />
        </mesh>
      ))}
      {/* header over the door that carries the sign */}
      <mesh position={[0, FLOOR_Y + k.h + 0.55, k.d / 2 - WALL / 2]} castShadow>
        <boxGeometry args={[k.door + 2, 1.1, WALL]} />
        <meshStandardMaterial color="#0B0E14" roughness={0.6} />
      </mesh>
    </group>
  );
}

const box = (p: [number, number, number], s: [number, number, number], color: string, extra?: Record<string, unknown>, key?: string | number) => (
  <mesh key={key} position={p} castShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} roughness={0.6} {...extra} />
  </mesh>
);

/** An NPC that plays one move forever. */
function Npc({ seed, act, position, rot = 0 }: { seed: string; act: FigureAct | null; position: [number, number, number]; rot?: number }) {
  const actRef = useRef<FigureAct | null>(act);
  const speed = useRef(0);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Figure seed={seed} actRef={actRef} speedRef={speed} dim />
    </group>
  );
}

// ------------------------------------------------------------------ Club Moon

const { n: N, tile: T, tileH, z: floorZ } = DANCE_FLOOR;
const FLOOR_COLORS = ['#FF2E88', '#00E5FF', '#FFD60A', '#7B2CFF', '#00F5A0', '#FF6B00'];

function Club({ k }: { k: WalkIn }) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const tileGeo = useMemo(() => new THREE.BoxGeometry(T - 0.06, tileH, T - 0.06), []);
  const beams = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const speakers = useRef<THREE.Group>(null);
  const lA = useRef<THREE.PointLight>(null);
  const lB = useRef<THREE.PointLight>(null);
  useEffect(() => {
    const m = tiles.current;
    if (!m) return;
    for (let i = 0; i < N * N; i++) {
      const x = (i % N) - (N - 1) / 2, z = Math.floor(i / N) - (N - 1) / 2;
      tmp.position.set(DANCE_FLOOR.x + x * T, DANCE_FLOOR.top - tileH / 2, floorZ + z * T);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => {
    const b = beat('club');
    const bar = Math.floor(b / 4);
    const pulse = Math.pow(1 - (b % 1), 3);
    const m = tiles.current;
    if (m) {
      for (let i = 0; i < N * N; i++) {
        const x = i % N, z = Math.floor(i / N);
        const on = (x + z + bar) % 3 === Math.floor(b) % 3 || ((x * 7 + z * 3 + Math.floor(b)) % 5 === 0);
        const c = FLOOR_COLORS[(x + z * 2 + bar) % FLOOR_COLORS.length];
        tmpColor.set(c).multiplyScalar(on ? 1.2 + pulse * 1.8 : 0.12);
        m.setColorAt(i, tmpColor);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (beams.current) {
      beams.current.children.forEach((g, i) => {
        const t = clock.elapsedTime * (0.7 + i * 0.13) + i;
        g.rotation.x = Math.sin(t) * 0.55;
        g.rotation.z = Math.cos(t * 1.3) * 0.55;
        const mat = ((g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial);
        mat.color.set(FLOOR_COLORS[(i + bar) % FLOOR_COLORS.length]);
        mat.opacity = 0.14 + pulse * 0.16;
      });
    }
    if (ball.current) ball.current.rotation.y = clock.elapsedTime * 0.8;
    if (speakers.current) speakers.current.children.forEach((s) => s.scale.setScalar(1 + pulse * 0.12));
    if (lA.current) {
      lA.current.color.set(FLOOR_COLORS[bar % FLOOR_COLORS.length]);
      lA.current.intensity = 8 + pulse * 22;
    }
    if (lB.current) {
      lB.current.color.set(FLOOR_COLORS[(bar + 3) % FLOOR_COLORS.length]);
      lB.current.intensity = 8 + (1 - pulse) * 14;
    }
  });
  const trussY = FLOOR_Y + k.h + 0.4;
  const backZ = -k.d / 2 + WALL;
  return (
    <group>
      <instancedMesh ref={tiles} args={[tileGeo, undefined, N * N]} frustumCulled={false}>
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.0} roughness={0.3} toneMapped={false} />
      </instancedMesh>
      {/* tiles lit from inside: the emissive comes from the instance colour */}
      <TileGlow tiles={tiles} />
      {/* DJ booth and decks */}
      {box([0, FLOOR_Y + 0.55, backZ + 1.4], [4, 1.1, 1.2], '#0F0F14', { metalness: 0.4 })}
      {box([0, FLOOR_Y + 1.12, backZ + 1.4], [4.1, 0.06, 1.25], '#FF2E88', { emissive: '#FF2E88', emissiveIntensity: 1.5, toneMapped: false })}
      {[-0.9, 0.9].map((x) => (
        <Deck key={x} position={[x, FLOOR_Y + 1.18, backZ + 1.4]} />
      ))}
      <Npc seed="dj-moon" act="dance" position={[0, FLOOR_Y, backZ + 0.55]} />
      {/* speakers */}
      <group ref={speakers}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (k.w / 2 - 1.2), FLOOR_Y, backZ + 0.8]}>
            {box([0, 1.1, 0], [1.4, 2.2, 1.1], '#111')}
            {[0.6, 1.6].map((y) => (
              <mesh key={y} position={[0, y, 0.56]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.4, 0.45, 0.06, 16]} />
                <meshStandardMaterial color="#2A2A2A" metalness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* side bar */}
      {box([-k.w / 2 + 1, FLOOR_Y + 0.55, 2.6], [1, 1.1, 4], '#3A1F4A')}
      {box([-k.w / 2 + 1, FLOOR_Y + 1.12, 2.6], [1.1, 0.06, 4.1], '#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 1.2, toneMapped: false })}
      {/* lighting truss over the floor */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([sx * 4, (FLOOR_Y + trussY) / 2, floorZ + sz * 4], [0.2, trussY - FLOOR_Y, 0.2], '#5A5F68', { metalness: 0.7 }, `${sx}${sz}`)))}
      {[-1, 1].map((s) => box([0, trussY, floorZ + s * 4], [8.2, 0.22, 0.22], '#5A5F68', { metalness: 0.7 }, `x${s}`))}
      {[-1, 1].map((s) => box([s * 4, trussY, floorZ], [0.22, 0.22, 8.2], '#5A5F68', { metalness: 0.7 }, `z${s}`))}
      {/* moving-head beams */}
      <group ref={beams}>
        {[-3, -1, 1, 3].flatMap((x) => [-4, 4].map((z) => (
          <group key={`${x}${z}`} position={[x, trussY - 0.1, floorZ + z]}>
            <mesh position={[0, -2.1, 0]}>
              <coneGeometry args={[0.9, 4.2, 16, 1, true]} />
              <meshBasicMaterial color="#FF2E88" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )))}
      </group>
      {/* mirror ball */}
      <mesh position={[0, trussY - 0.1, floorZ]} >
        <cylinderGeometry args={[0.02, 0.02, 0.8, 4]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      <mesh ref={ball} position={[0, trussY - 0.9, floorZ]} castShadow>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color="#E8E8F0" metalness={1} roughness={0.12} flatShading emissive="#8888AA" emissiveIntensity={0.4} />
      </mesh>
      <pointLight ref={lA} position={[-2, FLOOR_Y + 3, floorZ]} distance={14} decay={1.6} />
      <pointLight ref={lB} position={[2, FLOOR_Y + 3, floorZ]} distance={14} decay={1.6} />
      {/* the crowd */}
      <Npc seed="club-ada" act="dance" position={[-1.6, DANCE_FLOOR.top, floorZ - 0.8]} rot={0.4} />
      <Npc seed="club-tunde" act="dance" position={[1.4, DANCE_FLOOR.top, floorZ + 0.6]} rot={-0.6} />
      <Npc seed="club-zee" act="dance" position={[0.2, DANCE_FLOOR.top, floorZ - 2.2]} rot={3} />
      <Npc seed="club-bisola" act="selfie" position={[-k.w / 2 + 2.2, FLOOR_Y, 2]} rot={Math.PI / 2} />
    </group>
  );
}

/** The dance-floor tiles' material glows with their instance colour. */
function TileGlow({ tiles }: { tiles: React.RefObject<THREE.InstancedMesh> }) {
  useEffect(() => {
    const m = tiles.current;
    if (!m) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (shader) => {
      // use the per-instance colour as emissive too, so lit tiles read as lights at night
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * 0.9;\n#endif',
      );
    };
    mat.needsUpdate = true;
  }, [tiles]);
  return null;
}

function Deck({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 3.5;
  });
  return (
    <group position={position}>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.38, 0.38, 0.05, 20]} />
        <meshStandardMaterial color="#1A1A1A" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 12]} />
        <meshStandardMaterial color="#FFD60A" emissive="#FFD60A" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ Degen Lounge

function Lounge({ k }: { k: WalkIn }) {
  const ball = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const b = beat('lounge');
    if (ball.current) ball.current.rotation.y = clock.elapsedTime * 0.35;
    if (glow.current) glow.current.intensity = 6 + Math.pow(1 - (b % 1), 2) * 6;
  });
  const backZ = -k.d / 2 + WALL;
  const bottles = useMemo(() => {
    const cols = ['#2E7D32', '#8D6E63', '#F9A825', '#C62828', '#ECEFF1', '#4E342E'];
    const out: { x: number; y: number; c: string }[] = [];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) out.push({ x: -3.3 + i * 0.6, y: FLOOR_Y + 1.7 + row * 0.7, c: cols[(i + row * 2) % cols.length] });
    return out;
  }, []);
  return (
    <group>
      {/* back bar, shelves of bottles, neon */}
      {box([0, FLOOR_Y + 0.55, backZ + 1.6], [7.5, 1.1, 0.9], '#5D3A1A')}
      {box([0, FLOOR_Y + 1.13, backZ + 1.6], [7.7, 0.08, 1.05], '#C9A227', { metalness: 0.6, roughness: 0.3 })}
      {[0, 1].map((r) => box([0, FLOOR_Y + 1.45 + r * 0.7, backZ + 0.25], [7.8, 0.06, 0.4], '#3A2A22', undefined, r))}
      {bottles.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, backZ + 0.25]}>
          <cylinderGeometry args={[0.09, 0.11, 0.45, 8]} />
          <meshStandardMaterial color={b.c} roughness={0.2} metalness={0.1} transparent opacity={0.85} />
        </mesh>
      ))}
      {box([0, FLOOR_Y + 3.3, backZ + 0.05], [5, 0.1, 0.05], '#8338EC', { emissive: '#8338EC', emissiveIntensity: 2, toneMapped: false })}
      {[-2.4, -1.2, 0, 1.2, 2.4].map((x) => (
        <group key={x} position={[x, FLOOR_Y, backZ + 2.5]}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.8, 6]} />
            <meshStandardMaterial color="#888" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.1, 12]} />
            <meshStandardMaterial color="#8338EC" />
          </mesh>
        </group>
      ))}
      <Npc seed="lounge-barman" act={null} position={[0.8, FLOOR_Y, backZ + 0.9]} />
      {/* booths with candles */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (k.w / 2 - 1.5), FLOOR_Y, 1.4]}>
          {box([0, 0.3, 0], [2, 0.6, 3.2], '#6A1B9A')}
          {box([s * 0.85, 0.8, 0], [0.35, 1, 3.2], '#6A1B9A')}
          {box([-s * 1.4, 0.45, 0], [0.9, 0.9, 1.2], '#2B1B12')}
          <mesh position={[-s * 1.4, 1.0, 0]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#FFD089" emissive="#FFB347" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Npc seed="lounge-amaka" act="dance" position={[-0.6, FLOOR_Y, 1.8]} rot={0.3} />
      <mesh ref={ball} position={[0, FLOOR_Y + k.h - 0.4, 1]}>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial color="#E8E8F0" metalness={1} roughness={0.15} flatShading emissive="#6A4C93" emissiveIntensity={0.4} />
      </mesh>
      <pointLight ref={glow} color="#B46BFF" position={[0, FLOOR_Y + 3, 1]} distance={12} decay={1.6} />
    </group>
  );
}

// ------------------------------------------------------------------ Gym

function Gym({ k }: { k: WalkIn }) {
  const backZ = -k.d / 2 + WALL;
  const belts = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (bag.current) bag.current.rotation.z = Math.sin(clock.elapsedTime * 2.2) * 0.12;
    void belts;
  });
  const plate = (x: number, y: number, z: number, key: string) => (
    <mesh key={key} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.38, 0.38, 0.1, 16]} />
      <meshStandardMaterial color="#1A1A1A" roughness={0.6} />
    </mesh>
  );
  return (
    <group>
      {/* mirror wall */}
      {box([0, FLOOR_Y + 2, backZ + 0.05], [k.w - 1.2, 3, 0.05], '#BFD9E8', { metalness: 0.95, roughness: 0.05 })}
      {/* squat rack */}
      <group position={[-3.6, FLOOR_Y, backZ + 1.6]}>
        {[-1, 1].flatMap((sx) => [-0.5, 0.5].map((sz) => box([sx * 1.1, 1.3, sz], [0.12, 2.6, 0.12], '#2D6A4F', { metalness: 0.5 }, `${sx}${sz}`)))}
        {box([0, 1.5, 0.5], [2.8, 0.06, 0.06], '#CCCCCC', { metalness: 0.9, roughness: 0.2 })}
        {plate(-1.25, 1.5, 0.5, 'a')}
        {plate(1.25, 1.5, 0.5, 'b')}
      </group>
      {/* benches with barbells */}
      {[-0.4, 2.4].map((x) => (
        <group key={x} position={[x, FLOOR_Y, backZ + 2.2]}>
          {box([0, 0.45, 0], [0.5, 0.15, 1.8], '#1B1B1B')}
          {box([0, 0.22, 0.6], [0.1, 0.44, 0.1], '#555')}
          {box([0, 0.22, -0.6], [0.1, 0.44, 0.1], '#555')}
          {[-1, 1].map((s) => box([s * 0.45, 0.65, -0.55], [0.08, 1.3, 0.08], '#555', undefined, s))}
          {box([0, 1.25, -0.55], [2.2, 0.05, 0.05], '#CCCCCC', { metalness: 0.9, roughness: 0.2 })}
          {plate(-0.95, 1.25, -0.55, 'l')}
          {plate(0.95, 1.25, -0.55, 'r')}
        </group>
      ))}
      {/* dumbbell rack along the right wall */}
      <group position={[k.w / 2 - 1, FLOOR_Y, -1]}>
        {box([0, 0.5, 0], [0.7, 0.08, 4], '#333')}
        {box([0, 0.25, -1.9], [0.7, 0.5, 0.08], '#333')}
        {box([0, 0.25, 1.9], [0.7, 0.5, 0.08], '#333')}
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} position={[0, 0.64, -1.7 + i * 0.48]}>
            {box([0, 0, 0], [0.5, 0.05, 0.05], '#AAA', { metalness: 0.8 })}
            {box([-0.25, 0, 0], [0.1, 0.18 + i * 0.012, 0.18 + i * 0.012], '#2D6A4F')}
            {box([0.25, 0, 0], [0.1, 0.18 + i * 0.012, 0.18 + i * 0.012], '#2D6A4F')}
          </group>
        ))}
      </group>
      {/* treadmills facing the mirror */}
      <group ref={belts}>
        {[-4.2, -2.8].map((x) => (
          <group key={x} position={[x, FLOOR_Y, 2.4]}>
            {box([0, 0.15, 0], [0.9, 0.3, 2.2], '#2B2F36')}
            {box([0, 0.31, 0], [0.7, 0.02, 2], '#111')}
            {[-1, 1].map((s) => box([s * 0.42, 0.75, -1], [0.06, 1.2, 0.06], '#999', { metalness: 0.7 }, s))}
            {box([0, 1.35, -1], [0.9, 0.35, 0.15], '#2B2F36')}
            {box([0, 1.4, -0.92], [0.5, 0.18, 0.02], '#00E5FF', { emissive: '#00E5FF', emissiveIntensity: 1.2 })}
          </group>
        ))}
      </group>
      {/* yoga mats */}
      {['#FF5D8F', '#06D6A0', '#FFD166'].map((c, i) => box([1 + i * 1.3, FLOOR_Y + 0.02, 2.6], [0.9, 0.03, 2], c, undefined, c))}
      {/* punching bag */}
      <group ref={bag} position={[-k.w / 2 + 1.4, FLOOR_Y + k.h - 0.2, -1.5]}>
        {box([0, -0.5, 0], [0.04, 1, 0.04], '#777')}
        <mesh position={[0, -1.7, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 1.5, 12]} />
          <meshStandardMaterial color="#B71C1C" roughness={0.6} />
        </mesh>
      </group>
      <Npc seed="gym-coach" act="pushups" position={[0.4, FLOOR_Y, -0.2]} rot={Math.PI / 2} />
      <Npc seed="gym-kemi" act="stretch" position={[2.3, FLOOR_Y, 2.8]} rot={Math.PI} />
    </group>
  );
}

// ------------------------------------------------------------------ Trenches Coin Shop

type BoardToken = { symbol: string; change24h: number | null; priceUsd: number };

function tickerTexture(tokens: BoardToken[]) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  const g = c.getContext('2d')!;
  g.fillStyle = '#04120E';
  g.fillRect(0, 0, 1024, 256);
  g.font = '800 44px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#06D6A0';
  g.fillText('TRENCHES · LIVE', 28, 48);
  const list = tokens.length ? tokens.slice(0, 8) : [{ symbol: 'BAGS', change24h: 4.2, priceUsd: 0 }];
  list.forEach((tk, i) => {
    const x = 28 + (i % 4) * 250, y = 128 + Math.floor(i / 4) * 80;
    const up = (tk.change24h ?? 0) >= 0;
    g.font = '700 36px Inter, system-ui, sans-serif';
    g.fillStyle = '#FFFFFF';
    g.fillText(`$${tk.symbol.slice(0, 7)}`, x, y);
    g.font = '600 30px Inter, system-ui, sans-serif';
    g.fillStyle = up ? '#2EE59D' : '#FF4D6D';
    g.fillText(`${up ? '▲' : '▼'} ${Math.abs(tk.change24h ?? 0).toFixed(1)}%`, x, y + 34);
  });
  t.needsUpdate = true;
  return t;
}

function CoinShop({ k }: { k: WalkIn }) {
  const backZ = -k.d / 2 + WALL;
  const [tokens, setTokens] = useState<BoardToken[]>([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/life/trenches')
      .then((r) => r.json())
      .then((b) => alive && setTokens((b.tokens ?? []).filter((t: { chain: string }) => t.chain === 'solana')))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const tex = useMemo(() => (typeof document === 'undefined' ? null : tickerTexture(tokens)), [tokens]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const balloons = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    balloons.current?.children.forEach((b, i) => {
      b.position.y = FLOOR_Y + 3 + Math.sin(clock.elapsedTime * 1.3 + i) * 0.18;
    });
  });
  const cols = tokens.length ? tokens.slice(0, 6).map((t) => ((t.change24h ?? 0) >= 0 ? '#2EE59D' : '#FF4D6D')) : ['#2EE59D', '#FF4D6D', '#2EE59D', '#FFD60A', '#2EE59D', '#FF4D6D'];
  return (
    <group>
      {/* the big board */}
      <mesh position={[0, FLOOR_Y + 2.6, backZ + 0.06]}>
        <planeGeometry args={[k.w - 2, (k.w - 2) / 4]} />
        <meshStandardMaterial map={tex ?? undefined} emissive="#FFFFFF" emissiveMap={tex ?? undefined} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* counter with tills and coin stacks */}
      {box([0, FLOOR_Y + 0.55, backZ + 2.2], [k.w - 3, 1.1, 0.9], '#0B3B2E')}
      {box([0, FLOOR_Y + 1.13, backZ + 2.2], [k.w - 2.9, 0.08, 1.05], '#06D6A0', { emissive: '#06D6A0', emissiveIntensity: 0.7, toneMapped: false })}
      {[-2.5, 2.5].map((x) => (
        <group key={x} position={[x, FLOOR_Y + 1.17, backZ + 2.2]}>
          {box([0, 0.18, 0], [0.7, 0.36, 0.5], '#222')}
          {box([0, 0.45, -0.1], [0.6, 0.3, 0.04], '#06D6A0', { emissive: '#06D6A0', emissiveIntensity: 1 })}
        </group>
      ))}
      {[-0.8, 0, 0.8].map((x, i) => (
        <mesh key={x} position={[x, FLOOR_Y + 1.17 + (0.15 + i * 0.08) / 2, backZ + 2.2]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.15 + i * 0.08, 16]} />
          <meshStandardMaterial color="#FFD60A" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      <Npc seed="coinshop-cashier" act={null} position={[1.2, FLOOR_Y, backZ + 1.1]} />
      {/* coin balloons, green for up and red for down on today's board */}
      <group ref={balloons}>
        {cols.map((c, i) => (
          <group key={i} position={[-3 + i * 1.2, FLOOR_Y + 3, 1.6 + (i % 2) * 0.8]}>
            <mesh>
              <sphereGeometry args={[0.38, 16, 12]} />
              <meshStandardMaterial color={c} roughness={0.25} emissive={c} emissiveIntensity={0.25} />
            </mesh>
            <mesh position={[0, -1.1, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 1.5, 3]} />
              <meshStandardMaterial color="#DDD" />
            </mesh>
          </group>
        ))}
      </group>
      {/* a little queue */}
      <Npc seed="coinshop-degen" act="selfie" position={[-2.5, FLOOR_Y, 0.6]} rot={Math.PI} />
    </group>
  );
}

// ------------------------------------------------------------------ Government house

const MARBLE = '#F4F0E8';
const GOLD = '#C9A227';
const WOOD = '#5A3B25';

const logoCache = new Map<string, THREE.Texture>();
/** The coin's official logo (Country.logo, an SVG) drawn onto a canvas texture, or null while it loads. */
function useLogo(src: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(() => logoCache.get(src) ?? null);
  useEffect(() => {
    const hit = logoCache.get(src);
    if (hit) return void setTex(hit);
    let live = true;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      logoCache.set(src, t);
      if (live) setTex(t);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return tex;
}

/** The logo on a square, transparent around its shape. */
function Logo({ c, size, position }: { c: Country; size: number; position: [number, number, number] }) {
  const tex = useLogo(c.logo);
  if (!tex) return null;
  return (
    <mesh position={position}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.05} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={0.35} toneMapped={false} />
    </mesh>
  );
}

/** A flag on a pole: the coin's two colours with its logo. */
function Flag({ c, position, dir = 1 }: { c: Country; position: [number, number, number]; dir?: 1 | -1 }) {
  const cloth = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 1.3 + position[0]) * 0.12;
  });
  return (
    <group position={position}>
      {box([0, 1.25, 0], [0.08, 2.5, 0.08], GOLD, { metalness: 0.7, roughness: 0.3 })}
      <mesh position={[0, 2.55, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.25} />
      </mesh>
      <group ref={cloth} position={[dir * 0.04, 2.05, 0]}>
        {box([dir * 0.55, 0.18, 0], [1.1, 0.36, 0.03], c.theme.primary)}
        {box([dir * 0.55, -0.18, 0], [1.1, 0.36, 0.03], c.theme.secondary)}
        <mesh position={[dir * 0.55, 0, 0.02]}>
          <circleGeometry args={[0.24, 24]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.32} position={[dir * 0.55, 0, 0.03]} />
      </group>
    </group>
  );
}

function Column({ position, h }: { position: [number, number, number]; h: number }) {
  return (
    <group position={position}>
      {box([0, 0.15, 0], [0.9, 0.3, 0.9], MARBLE)}
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, h - 0.4, 14]} />
        <meshStandardMaterial color={MARBLE} roughness={0.5} />
      </mesh>
      {box([0, h - 0.1, 0], [0.9, 0.25, 0.9], MARBLE)}
    </group>
  );
}

/** The government house: the president's desk under the seal, flags, a podium with today's address on the
 *  screen behind it, the cabinet table, a portico of columns and a dome in the country's colours. */
function Capitol({ k }: { k: WalkIn }) {
  const country = useCountry();
  const c = COUNTRIES[country];
  const g = governmentOf(country);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const address = todaysAddress(country, now);
  const closed = curfew(now).on;
  const back = -k.d / 2 + WALL;
  const y = FLOOR_Y;
  const seal = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (seal.current) (seal.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 1.5) * 0.25;
  });
  return (
    <group>
      {/* red carpet from the door to the desk, in the country's colour */}
      {box([0, y + 0.02, 1.2], [1.8, 0.03, k.d - 4.6], c.theme.primary, { roughness: 1 })}
      {box([0, y + 0.025, 1.2], [1.3, 0.03, k.d - 4.6], c.theme.ink, { roughness: 1 })}

      {/* the president's desk, chair and the seal on the back wall */}
      <group position={[0, y, -4.2]}>
        {box([0, 0.75, 0], [3.2, 0.1, 1.1], WOOD)}
        {box([0, 0.37, 0.45], [3.2, 0.74, 0.1], WOOD)}
        {box([-1.45, 0.37, 0], [0.25, 0.74, 1.0], WOOD)}
        {box([1.45, 0.37, 0], [0.25, 0.74, 1.0], WOOD)}
        {box([0, 0.38, 0.51], [1.0, 0.4, 0.02], c.theme.primary, { emissive: c.theme.primary, emissiveIntensity: 0.4 })}
        {box([-0.9, 0.86, -0.1], [0.5, 0.06, 0.35], '#F4F1DE')}
        {box([0.9, 0.95, -0.2], [0.6, 0.35, 0.04], '#0B0E14')}
        {box([0.9, 0.95, -0.17], [0.54, 0.29, 0.01], c.theme.secondary, { emissive: c.theme.secondary, emissiveIntensity: 0.6 })}
      </group>
      <group position={[0, y, -5.15]}>
        {box([0, 0.66, 0], [0.8, 0.12, 0.7], '#2A1A10')}
        {box([0, 1.1, -0.33], [0.8, 0.9, 0.1], '#2A1A10')}
        {box([0, 0.33, 0], [0.12, 0.66, 0.12], '#1A1A1A')}
      </group>
      <group position={[0, y + 3.2, back + 0.06]}>
        <mesh ref={seal} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.05, 1.05, 0.08, 40]} />
          <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} emissive={c.theme.primary} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[0.85, 40]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.78} position={[0, 0.12, 0.07]} />
        <Text font={FONT} position={[0, -0.5, 0.07]} fontSize={0.11} color="#FFFFFF" anchorX="center" anchorY="middle" maxWidth={1.4} textAlign="center">
          {`REPUBLIC OF ${c.name.toUpperCase()}`}
        </Text>
      </group>
      <Text font={FONT} position={[0, y + 4.75, back + 0.05]} fontSize={0.24} color={WOOD} anchorX="center" anchorY="middle">
        {`"${c.motto}"`}
      </Text>
      <Flag c={c} position={[-1.9, y, -5.7]} dir={-1} />
      <Flag c={c} position={[1.9, y, -5.7]} />

      {/* the podium, and today's address on the big screen behind it */}
      <group position={[-4.6, y, -2.5]} rotation={[0, 0.25, 0]}>
        {box([0, 0.55, 0], [0.9, 1.1, 0.6], WOOD)}
        {box([0, 1.12, -0.05], [1.0, 0.06, 0.7], WOOD)}
        {box([0, 0.65, 0.31], [0.55, 0.4, 0.02], GOLD, { metalness: 0.6, roughness: 0.3 })}
        {box([0.2, 1.35, -0.1], [0.03, 0.4, 0.03], '#1A1A1A')}
      </group>
      <group position={[-5.1, y + 3.0, back + 0.08]}>
        {box([0, 0, 0], [4.8, 2.6, 0.1], '#0B0E14')}
        {box([0, 0, 0.06], [4.6, 2.4, 0.02], c.theme.ink, { emissive: c.theme.ink, emissiveIntensity: 0.4 })}
        {box([0, 0.98, 0.075], [4.6, 0.44, 0.01], c.theme.primary, { emissive: c.theme.primary, emissiveIntensity: 0.8, toneMapped: false })}
        <mesh position={[-2.0, 0.98, 0.085]}>
          <circleGeometry args={[0.19, 24]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.26} position={[-2.0, 0.98, 0.09]} />
        <Text font={FONT} position={[0.15, 0.98, 0.09]} fontSize={0.19} color="#FFFFFF" anchorX="center" anchorY="middle">
          {closed ? 'CURFEW · NEPA HAS TAKEN LIGHT' : `TODAY'S ADDRESS · PRESIDENT ${c.president.toUpperCase()}`}
        </Text>
        <Text font={FONT} position={[0, 0.0, 0.09]} fontSize={0.2} lineHeight={1.25} color="#FFFFFF" anchorX="center" anchorY="middle" maxWidth={4.2} textAlign="center">
          {`"${address.text}"`}
        </Text>
        <Text font={FONT} position={[0, -0.95, 0.09]} fontSize={0.16} color={c.theme.accent} anchorX="center" anchorY="middle" maxWidth={4.4}>
          {`TRADE TAX ${pct(g.rules.tradeTax)} · STIPEND ${g.rules.stipend} BAGS A DAY`}
        </Text>
      </group>
      {/* benches for the town hall */}
      {[0.6, 2.4].map((z) =>
        [-1, 1].map((s) => (
          <group key={`${z}${s}`} position={[s * 3.4 - 1.2, y, z]}>
            {box([0, 0.42, 0], [2.6, 0.1, 0.55], WOOD)}
            {box([0, 0.75, 0.25], [2.6, 0.55, 0.08], WOOD)}
            {box([-1.15, 0.2, 0], [0.12, 0.4, 0.5], '#2A1A10')}
            {box([1.15, 0.2, 0], [0.12, 0.4, 0.5], '#2A1A10')}
          </group>
        )),
      )}

      {/* cabinet table and chairs */}
      <group position={[4.6, y, -1.5]}>
        {box([0, 0.74, 0], [1.9, 0.08, 3.6], WOOD)}
        {box([0, 0.36, 0], [0.5, 0.72, 2.6], '#2A1A10')}
        {[-1.2, 0, 1.2].map((z) => box([0, 0.8, z], [0.5, 0.04, 0.35], '#F4F1DE', undefined, z))}
        {[[-1.15, -0.9], [1.15, 0.5], [-1.15, 0.9], [1.15, -0.9], [-1.15, -0.0], [1.15, 0.0]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            {box([0, 0.55, 0], [0.6, 0.1, 0.6], c.theme.secondary === '#1E2026' ? '#3A3D45' : c.theme.secondary)}
            {box([x < 0 ? -0.28 : 0.28, 0.95, 0], [0.08, 0.8, 0.6], c.theme.secondary === '#1E2026' ? '#3A3D45' : c.theme.secondary)}
            {box([0, 0.27, 0], [0.08, 0.55, 0.08], '#1A1A1A')}
          </group>
        ))}
        <Text font={FONT} position={[0, 2.6, -2.4]} fontSize={0.28} color={WOOD} anchorX="center" anchorY="middle">
          CABINET
        </Text>
      </group>

      {/* marble columns at the front corners, and a dome over the back */}
      {[-1, 1].map((s) => <Column key={s} position={[s * (k.w / 2 - 0.3), y, k.d / 2 + 0.6]} h={k.h + 0.4} />)}
      <group position={[0, y + k.h, back - 0.4]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[2.3, 2.3, 1.2, 28]} />
          <meshStandardMaterial color={MARBLE} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.2, 0]} castShadow>
          <sphereGeometry args={[2.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={c.theme.primary} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 3.7, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.3} />
        </mesh>
        {box([0.35, 4.05, 0], [0.7, 0.4, 0.03], c.theme.secondary)}
      </group>
      {/* honour guards at the door */}
      {[-1, 1].map((s) => (
        <Npc key={s} seed={`guard:${country}:${s}`} act={null} position={[s * (k.door / 2 + 0.7), y, k.d / 2 + 1.9]} />
      ))}
      <pointLight position={[0, y + 3.6, -3]} intensity={closed ? 0 : 12} distance={12} color="#FFE8B0" />
    </group>
  );
}

