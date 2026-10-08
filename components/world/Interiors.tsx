'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { FLOOR_Y, WALK_IN, WALL, wallsOf, type WalkIn } from '@/lib/world/interiors';
import type { PlacedVenue } from '@/lib/life/venues';
import type { FigureAct } from './figureMoves';
import type { HomePose } from './figurePoses';
import { JOBS } from '@/lib/life/jobs';
import { Figure } from './Figure';
import { beat } from './clubAudio';
import { DistanceDetail } from './DistanceDetail';
import { Capitol } from './Capitol';
import { useWorld } from './store';
import { AfroYard, BeachClub, ClubMoon, VelvetRoom, Warehouse } from './Clubs';

// Walk-in venues, open to the sky so the camera can follow you in: the five clubs (components/world/Clubs.tsx),
// the Degen Lounge (bar, booths, slow lights), the gym (racks, benches, treadmills, mats), the Trenches Coin Shop
// (counter, live ticker, coin balloons), the government house (desk, flags, podium with today's address,
// cabinet table, columns and a dome, all in the country's colours), and the workplaces: the Clinic (beds,
// patients, reception), the Hustle Hub job centre (the job board, advisers) and Devnet Labs (standing desks, code
// on every screen). Built in the venue's own frame, door at +z facing the city.

const FONT = '/fonts/inter-600.woff';

export function WalkInVenue({ v, near, onClick }: { v: PlacedVenue; near: boolean; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const country = useWorld((s) => s.country);
  const k = WALK_IN[v.id];
  if (!k) return null;
  const look = SHELL[v.id] ?? SHELL.club;
  return (
    <group>
      <mesh position={[0, 0.1, 1.5]} receiveShadow>
        <boxGeometry args={[k.w + 3, 0.2, k.d + 6]} />
        <meshStandardMaterial color="#B9BCC2" roughness={1} />
      </mesh>
      {!!v.approach && v.approach > 0.5 && (
        // the path from the ring road out to a club on the nightlife row: a boardwalk to the beach club
        <mesh position={[0, 0.09, k.d / 2 + 4.5 + v.approach / 2]} receiveShadow>
          <boxGeometry args={[3.4, 0.18, v.approach + 0.2]} />
          <meshStandardMaterial color={v.id === 'beach' ? '#B08B5E' : '#B9BCC2'} roughness={0.9} />
        </mesh>
      )}
      <mesh position={[0, FLOOR_Y - 0.02, 0]} receiveShadow onClick={onClick}>
        <boxGeometry args={[k.w - WALL, 0.04, k.d - WALL]} />
        <meshStandardMaterial color={look.floor} roughness={0.85} />
      </mesh>
      <Shell k={k} wall={look.wall} front={look.front ?? FRONT_H} trim={v.color} glow={near ? 1.4 : 0.8} onClick={onClick} />
      <Text font={FONT} position={[0, k.h + 0.55, k.d / 2 + 0.05]} fontSize={0.95} color={v.color} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#0B0E14">
        {v.name.toUpperCase()}
        <meshStandardMaterial color={v.color} emissive={v.color} emissiveIntensity={1.6} toneMapped={false} />
      </Text>
      <DistanceDetail shadowWithin={45} hideBeyond={110}>
        {v.id === 'club' && <ClubMoon k={k} country={country} />}
        {v.id === 'yard' && <AfroYard k={k} />}
        {v.id === 'warehouse' && <Warehouse k={k} />}
        {v.id === 'jazz' && <VelvetRoom k={k} />}
        {v.id === 'beach' && <BeachClub k={k} />}
        {v.id === 'bar' && <Lounge k={k} />}
        {v.id === 'gym' && <Gym k={k} />}
        {v.id === 'exchange' && <CoinShop k={k} />}
        {v.id === 'clinic' && <Clinic k={k} />}
        {v.id === 'hustle' && <JobCentre k={k} />}
        {v.id === 'tech' && <TechOffice k={k} />}
        {v.id === 'capitol' && <Capitol k={k} y={FLOOR_Y} />}
      </DistanceDetail>
    </group>
  );
}

/** Walls and floor per venue; `front` is the height of the street-side wall (low so you can see in). */
const SHELL: Record<string, { wall: string; floor: string; front?: number }> = {
  club: { wall: '#231833', floor: '#141018' },
  yard: { wall: '#C9B79C', floor: '#7A4E32', front: 1.0 },
  warehouse: { wall: '#5B5E63', floor: '#2B2C2F', front: 1.6 },
  jazz: { wall: '#1B1A3A', floor: '#3B2A20' },
  beach: { wall: '#C8A26B', floor: '#E8D3A2', front: 0.9 },
  bar: { wall: '#2A1F3D', floor: '#3A2A22' },
  gym: { wall: '#E8ECEF', floor: '#3B4048' },
  exchange: { wall: '#10302A', floor: '#D9DED8' },
  clinic: { wall: '#F4F7F6', floor: '#D6ECE6' },
  hustle: { wall: '#EDE9F7', floor: '#B9B4CC' },
  tech: { wall: '#1B2436', floor: '#C9CDD2' },
  capitol: { wall: '#EFEAE0', floor: '#D8D0C0' },
};

const FRONT_H = 1.3;

function Shell({ k, wall, front, trim, glow, onClick }: { k: WalkIn; wall: string; front: number; trim: string; glow: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const walls = useMemo(() => wallsOf(k), [k]);
  return (
    <group>
      {walls.map((r, i) => {
        // the street side is a low wall so you can see in from the road (and the camera can follow you in)
        const h = i >= 3 ? front : k.h;
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

/** An NPC that plays one move (or holds one pose) forever. */
function Npc({ seed, act, position, rot = 0 }: { seed: string; act: FigureAct | HomePose | null; position: [number, number, number]; rot?: number }) {
  const actRef = useRef<FigureAct | HomePose | null>(act);
  const speed = useRef(0);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Figure seed={seed} actRef={actRef} speedRef={speed} dim />
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

// ------------------------------------------------------------------ Clinic

const lie: HomePose = { base: 'lie', upper: 'nap', seat: 0.62 };
const waiting: HomePose = { base: 'chair', upper: 'phone', seat: 0.46 };

/** A hospital bed along z, head at the back wall: frame, mattress, pillow, a drip stand on its left. */
function Bed({ x, backZ }: { x: number; backZ: number }) {
  const z = backZ + 1.3;
  return (
    <group position={[x, FLOOR_Y, z]}>
      {box([0, 0.3, 0], [1.1, 0.12, 2.3], '#B0BEC5', { metalness: 0.5 })}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box([sx * 0.5, 0.15, sz * 1.05], [0.06, 0.3, 0.06], '#90A4AE', { metalness: 0.6 }, `${sx}${sz}`)))}
      {box([0, 0.48, 0], [1.0, 0.22, 2.2], '#FFFFFF', { roughness: 0.9 })}
      {box([0, 0.5, 0.35], [1.02, 0.24, 1.3], '#7FC8C8', { roughness: 0.9 })}
      {box([0, 0.66, -0.85], [0.7, 0.14, 0.4], '#FFFFFF', { roughness: 0.9 })}
      {box([0, 0.6, -1.17], [1.1, 0.9, 0.08], '#B0BEC5', { metalness: 0.5 })}
      {/* drip stand */}
      <group position={[-0.85, 0, -0.6]}>
        {box([0, 0.9, 0], [0.04, 1.8, 0.04], '#CFD8DC', { metalness: 0.7 })}
        {box([0, 1.65, 0], [0.18, 0.28, 0.06], '#E3F2FD', { transparent: true, opacity: 0.8 })}
      </group>
    </group>
  );
}

function Clinic({ k }: { k: WalkIn }) {
  const backZ = -k.d / 2 + WALL;
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = pulse.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 1.2 + Math.max(0, Math.sin(clock.elapsedTime * 6)) * 1.6;
  });
  return (
    <group>
      {/* red cross on the back wall */}
      {box([-1.25, FLOOR_Y + 3.1, backZ + 0.05], [1.2, 0.36, 0.06], '#E63946', { emissive: '#E63946', emissiveIntensity: 1.4, toneMapped: false })}
      {box([-1.25, FLOOR_Y + 3.1, backZ + 0.05], [0.36, 1.2, 0.06], '#E63946', { emissive: '#E63946', emissiveIntensity: 1.4, toneMapped: false })}
      {/* two beds, a privacy curtain between them, a patient in each */}
      <Bed x={-3.4} backZ={backZ} />
      <Bed x={0.9} backZ={backZ} />
      {box([-1.25, FLOOR_Y + 1.1, backZ + 1.4], [0.05, 2.0, 2.6], '#A7D7D7', { transparent: true, opacity: 0.85 })}
      {box([-1.25, FLOOR_Y + 2.15, backZ + 1.4], [0.06, 0.06, 2.7], '#90A4AE', { metalness: 0.6 })}
      <Npc seed="clinic-patient-a" act={lie} position={[-3.4, FLOOR_Y, backZ + 2.25]} />
      <Npc seed="clinic-patient-b" act={lie} position={[0.9, FLOOR_Y, backZ + 2.25]} />
      <Npc seed="clinic-nurse" act="examine" position={[-2.05, FLOOR_Y, backZ + 1.6]} rot={-Math.PI / 2} />
      {/* heart monitor by bed two */}
      <group position={[2.1, FLOOR_Y, backZ + 0.35]}>
        {box([0, 0.6, 0], [0.12, 1.2, 0.12], '#90A4AE', { metalness: 0.6 })}
        {box([0, 1.35, 0], [0.7, 0.5, 0.12], '#263238')}
        <mesh ref={pulse} position={[0, 1.35, 0.07]}>
          <planeGeometry args={[0.55, 0.06]} />
          <meshStandardMaterial color="#2EE59D" emissive="#2EE59D" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>
      {/* reception desk by the door, a receptionist behind it */}
      <group position={[-3.6, FLOOR_Y, 1.9]}>
        {box([0, 0.55, 0], [3, 1.1, 0.7], '#FFFFFF')}
        {box([0, 1.12, 0], [3.1, 0.06, 0.8], '#5FB3B3')}
        {box([0.7, 1.35, -0.1], [0.6, 0.4, 0.05], '#1B2436')}
      </group>
      <Npc seed="clinic-reception" act="type" position={[-3.2, FLOOR_Y, 1.1]} />
      {/* medicine cabinet on the left wall */}
      <group position={[-k.w / 2 + WALL + 0.25, FLOOR_Y, -1.2]}>
        {box([0, 1.2, 0], [0.45, 2.2, 1.8], '#ECEFF1')}
        {[0.6, 1.2, 1.8].map((y) => box([0.24, y, 0], [0.04, 0.04, 1.6], '#B0BEC5', undefined, y))}
        {[-0.6, -0.2, 0.2, 0.6].map((zz, i) => box([0.2, 1.3 + (i % 2) * 0.6, zz], [0.12, 0.2, 0.14], ['#E63946', '#1D9BF0', '#FFD166', '#06D6A0'][i], undefined, `p${i}`))}
      </group>
      {/* waiting chairs along the right wall */}
      {[0.6, 1.8, 3.0].map((zz) => (
        <group key={zz} position={[k.w / 2 - 1.0, FLOOR_Y, zz]}>
          {box([0, 0.44, 0], [0.6, 0.08, 0.6], '#5FB3B3')}
          {box([0.28, 0.75, 0], [0.06, 0.6, 0.6], '#5FB3B3')}
          {box([0, 0.22, 0], [0.5, 0.44, 0.06], '#90A4AE')}
        </group>
      ))}
      <Npc seed="clinic-waiting" act={waiting} position={[k.w / 2 - 1.15, FLOOR_Y, 1.8]} rot={-Math.PI / 2} />
      {/* a potted plant, because every clinic has one */}
      <group position={[k.w / 2 - 1, FLOOR_Y, backZ + 0.7]}>
        {box([0, 0.3, 0], [0.5, 0.6, 0.5], '#ECEFF1')}
        <mesh position={[0, 0.95, 0]} castShadow>
          <icosahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#4FA653" flatShading />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Hustle Hub job centre

function jobBoardTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1B1430';
  g.fillRect(0, 0, 1024, 384);
  g.font = '800 46px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#FFD166';
  g.fillText('NOW HIRING', 32, 46);
  g.font = '600 26px Inter, system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('Apply at the desk or in the Jobs app', 360, 48);
  JOBS.forEach((j, i) => {
    const x = 24 + (i % 4) * 250, y = 100 + Math.floor(i / 4) * 140;
    g.fillStyle = j.uniform;
    g.globalAlpha = 0.35;
    g.fillRect(x, y, 234, 124);
    g.globalAlpha = 1;
    g.font = '44px system-ui, sans-serif';
    g.fillText(j.emoji, x + 12, y + 40);
    g.fillStyle = '#FFFFFF';
    g.font = '700 26px Inter, system-ui, sans-serif';
    g.fillText(j.title.replace('Airport ground crew', 'Ground crew'), x + 12, y + 84);
    g.fillStyle = '#2EE59D';
    g.font = '600 22px Inter, system-ui, sans-serif';
    g.fillText(`${j.pay}+ bags a shift`, x + 12, y + 110);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function JobCentre({ k }: { k: WalkIn }) {
  const backZ = -k.d / 2 + WALL;
  const tex = useMemo(() => (typeof document === 'undefined' ? null : jobBoardTexture()), []);
  useEffect(() => () => tex?.dispose(), [tex]);
  const seat: HomePose = { base: 'chair', upper: 'idle', seat: 0.46 };
  return (
    <group>
      {/* the job board */}
      {box([0, FLOOR_Y + 2.75, backZ + 0.04], [7.8, 7.6 * 0.375 + 0.2, 0.06], '#0B0E14')}
      <mesh position={[0, FLOOR_Y + 2.75, backZ + 0.08]}>
        <planeGeometry args={[7.6, 7.6 * 0.375]} />
        <meshStandardMaterial map={tex ?? undefined} emissive="#FFFFFF" emissiveMap={tex ?? undefined} emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      {/* two adviser desks, an adviser at each, an applicant across from one */}
      {[-3, 3].map((x) => (
        <group key={x} position={[x, FLOOR_Y, -1.6]}>
          {box([0, 0.5, 0], [2.4, 0.08, 1.0], '#F4F1DE')}
          {box([0, 0.25, -0.45], [2.4, 0.5, 0.06], '#8338EC')}
          {box([0.5, 0.75, -0.25], [0.6, 0.42, 0.05], '#1B2436')}
          {box([-0.5, 0.56, 0.1], [0.3, 0.04, 0.4], '#FFFFFF')}
          {/* applicant chair */}
          {box([0, 0.44, 1.0], [0.55, 0.08, 0.55], '#6B7280')}
          {box([0, 0.75, 1.27], [0.55, 0.6, 0.06], '#6B7280')}
        </group>
      ))}
      <Npc seed="hub-adviser-a" act="type" position={[-3, FLOOR_Y, -2.45]} />
      <Npc seed="hub-adviser-b" act="type" position={[3, FLOOR_Y, -2.45]} />
      <Npc seed="hub-applicant" act={seat} position={[-3, FLOOR_Y, -0.55]} rot={Math.PI} />
      {/* take-a-number kiosk and a queue rope */}
      <group position={[k.w / 2 - 1.2, FLOOR_Y, 2.6]}>
        {box([0, 0.65, 0], [0.5, 1.3, 0.4], '#8338EC')}
        {box([0, 1.15, 0.21], [0.36, 0.26, 0.02], '#FFD166', { emissive: '#FFD166', emissiveIntensity: 1, toneMapped: false })}
      </group>
      {[-1.5, 0, 1.5].map((x) => (
        <group key={x} position={[x, FLOOR_Y, 1.4]}>
          {box([0, 0.45, 0], [0.08, 0.9, 0.08], '#C9A227', { metalness: 0.8 })}
          {box([0, 0.02, 0], [0.3, 0.04, 0.3], '#C9A227', { metalness: 0.8 })}
        </group>
      ))}
      {box([-0.75, FLOOR_Y + 0.8, 1.4], [1.5, 0.05, 0.05], '#B71C1C')}
      {box([0.75, FLOOR_Y + 0.8, 1.4], [1.5, 0.05, 0.05], '#B71C1C')}
      {/* the bus stop for the city loop, out front */}
      <group position={[k.w / 2 + 0.8, FLOOR_Y, k.d / 2 + 2]}>
        {box([0, 1.3, 0], [0.1, 2.6, 0.1], '#1F4E79')}
        {box([0, 2.5, 0], [0.7, 0.5, 0.06], '#1F4E79')}
        <Text font={FONT} position={[0, 2.5, 0.04]} fontSize={0.2} color="#FFFFFF" anchorX="center" anchorY="middle">
          🚌 LOOP
        </Text>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Devnet Labs (tech office)

function codeTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0D1117';
  g.fillRect(0, 0, 256, 160);
  const cols = ['#79C0FF', '#FF7B72', '#D2A8FF', '#7EE787', '#FFA657', '#C9D1D9'];
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let line = 0; line < 12; line++) {
    let x = 10 + Math.floor(rnd() * 3) * 14;
    const y = 10 + line * 12;
    while (x < 230 && rnd() > 0.15) {
      const w = 10 + rnd() * 40;
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(x, y, w, 6);
      x += w + 6;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function deployTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0B1A33';
  g.fillRect(0, 0, 1024, 256);
  g.textBaseline = 'middle';
  g.font = '800 64px Inter, system-ui, sans-serif';
  g.fillStyle = '#3A86FF';
  g.fillText('DEVNET LABS', 36, 80);
  g.font = '600 34px Inter, system-ui, sans-serif';
  g.fillStyle = '#7EE787';
  g.fillText('● all systems go', 36, 170);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('deploys today: 42 · tests: green', 400, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function TechOffice({ k }: { k: WalkIn }) {
  const backZ = -k.d / 2 + WALL;
  const screens = useMemo(() => (typeof document === 'undefined' ? [] : [0, 1, 2].map((i) => codeTexture(i + 1))), []);
  const banner = useMemo(() => (typeof document === 'undefined' ? null : deployTexture()), []);
  useEffect(() => () => [...screens, banner].forEach((t) => t?.dispose()), [screens, banner]);
  const beanbag: HomePose = { base: 'chair', upper: 'phone', seat: 0.32 };
  return (
    <group>
      {/* status screen on the back wall */}
      <mesh position={[0, FLOOR_Y + 3.3, backZ + 0.06]}>
        <planeGeometry args={[6, 1.5]} />
        <meshStandardMaterial map={banner ?? undefined} emissive="#FFFFFF" emissiveMap={banner ?? undefined} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* a row of standing desks facing the back wall, two monitors each */}
      {[-3.2, 0, 3.2].map((x, i) => (
        <group key={x} position={[x, FLOOR_Y, backZ + 1.6]}>
          {box([0, 1.02, 0], [2.2, 0.06, 0.8], '#E8DCC8')}
          {[-1, 1].map((sx) => box([sx * 0.95, 0.5, 0], [0.08, 1.0, 0.6], '#2B2F36', undefined, sx))}
          {[-0.45, 0.45].map((mx) => (
            <group key={mx} position={[mx, 1.42, -0.2]}>
              {box([0, -0.2, 0], [0.06, 0.3, 0.06], '#2B2F36')}
              {box([0, 0.1, -0.02], [0.82, 0.5, 0.04], '#111')}
              <mesh position={[0, 0.1, 0.01]}>
                <planeGeometry args={[0.76, 0.44]} />
                <meshStandardMaterial map={screens[i] ?? undefined} emissive="#FFFFFF" emissiveMap={screens[i] ?? undefined} emissiveIntensity={0.8} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {box([0, 1.07, 0.15], [0.6, 0.03, 0.2], '#1B1B1B')}
        </group>
      ))}
      <Npc seed="devnet-dev-a" act="type" position={[0, FLOOR_Y, backZ + 2.45]} rot={Math.PI} />
      <Npc seed="devnet-dev-b" act="type" position={[3.2, FLOOR_Y, backZ + 2.45]} rot={Math.PI} />
      {/* whiteboard on the left wall */}
      <group position={[-k.w / 2 + WALL + 0.05, FLOOR_Y + 1.7, 1.6]} rotation={[0, Math.PI / 2, 0]}>
        {box([0, 0, 0], [3, 1.4, 0.05], '#FFFFFF')}
        {[[-0.8, 0.3, '#E63946'], [0.2, 0.1, '#1D9BF0'], [-0.3, -0.3, '#06D6A0']].map(([x, y, c]) => box([x as number, y as number, 0.03], [1.1, 0.06, 0.01], c as string, undefined, c as string))}
      </group>
      {/* beanbags and a coffee bar by the door */}
      {[[-2.2, 2.6, '#FF5D8F'], [-0.6, 3.2, '#FFD166']].map(([x, z, c]) => (
        <mesh key={c as string} position={[x as number, FLOOR_Y + 0.25, z as number]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.55, 14, 10]} />
          <meshStandardMaterial color={c as string} roughness={0.9} />
        </mesh>
      ))}
      <Npc seed="devnet-beanbag" act={beanbag} position={[-2.2, FLOOR_Y, 2.6]} rot={0.6} />
      <group position={[k.w / 2 - 1.1, FLOOR_Y, 2.2]}>
        {box([0, 0.55, 0], [0.9, 1.1, 2.4], '#3A86FF')}
        {box([0, 1.12, 0], [1.0, 0.06, 2.5], '#E8DCC8')}
        {box([0, 1.4, -0.6], [0.4, 0.5, 0.4], '#2B2F36')}
        <mesh position={[0, 1.2, 0.4]}>
          <cylinderGeometry args={[0.06, 0.05, 0.14, 10]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      </group>
      {/* neon on the right wall */}
      <Text font={FONT} position={[k.w / 2 - WALL - 0.05, FLOOR_Y + 3.0, -1.5]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.55} color="#3A86FF" anchorX="center" anchorY="middle">
        SHIP IT
        <meshStandardMaterial color="#3A86FF" emissive="#3A86FF" emissiveIntensity={2} toneMapped={false} />
      </Text>
    </group>
  );
}
