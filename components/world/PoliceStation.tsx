'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { placeVenues } from '@/lib/life/venues';
import { CELL, CELL_TOP, OFFICERS, OFFICER_POSTS, venueToWorld, type Officer } from '@/lib/life/police';
import type { Block, CityGrid } from '@/lib/world/geometry';
import { surfaceY } from '@/lib/world/ground';
import { ARREST_FX_MS } from '@/components/life/crime';
import { useWorld } from './store';
import { Figure } from './Figure';
import type { FigureAct } from './figureMoves';
import type { HomePose } from './figurePoses';

// The police station's extras on top of its venue building (components/world/Venues.tsx): a light bar on the
// roof, the holding cell on the plaza, the AI officers at the door, and the officer who walks up to make an arrest.

const BAR = '#2A2F3A';

export function PoliceStation({ contentRadius, boundaryRadius, blocks, grid }: { contentRadius: number; boundaryRadius: number; blocks: Block[]; grid: CityGrid }) {
  const station = useMemo(() => placeVenues(contentRadius, boundaryRadius).find((v) => v.id === 'police') ?? null, [contentRadius, boundaryRadius]);
  if (!station) return null;
  return (
    <>
      <group position={[station.x, 0, station.z]} rotation={[0, station.rot, 0]}>
        <LightBar y={0.2 + station.h + 0.15} />
        <Cell />
        {/* POLICE stripe over the door */}
        <mesh position={[0, 3.55, station.d / 2 + 0.06]}>
          <boxGeometry args={[4.6, 0.5, 0.06]} />
          <meshStandardMaterial color="#F5F7FF" emissive="#BFD3FF" emissiveIntensity={0.35} />
        </mesh>
        {OFFICERS.map((o, i) => (
          <PostedOfficer key={o.id} o={o} post={OFFICER_POSTS[i % OFFICER_POSTS.length]} />
        ))}
      </group>
      <ArrestOfficer blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} station={station} />
    </>
  );
}

/** Red and blue, flashing in turn. */
function LightBar({ y }: { y: number }) {
  const red = useRef<THREE.MeshStandardMaterial>(null);
  const blue = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 3) % 2 === 0;
    if (red.current) red.current.emissiveIntensity = on ? 2.4 : 0.2;
    if (blue.current) blue.current.emissiveIntensity = on ? 0.2 : 2.4;
  });
  return (
    <group position={[0, y, 1.5]}>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[3.2, 0.25, 0.8]} />
        <meshStandardMaterial color="#1B1F2A" />
      </mesh>
      <mesh position={[-0.8, 0.38, 0]}>
        <boxGeometry args={[1.4, 0.3, 0.6]} />
        <meshStandardMaterial ref={red} color="#FF2D2D" emissive="#FF0000" toneMapped={false} />
      </mesh>
      <mesh position={[0.8, 0.38, 0]}>
        <boxGeometry args={[1.4, 0.3, 0.6]} />
        <meshStandardMaterial ref={blue} color="#2D6BFF" emissive="#0044FF" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The holding cell: a slab, a bench, bars on every side and a sign. Players inside are walked there by Player.tsx. */
function Cell() {
  const { lx, lz, w, d } = CELL;
  const bars = useMemo(() => {
    const out: [number, number][] = [];
    const step = 0.28;
    for (let x = -w / 2; x <= w / 2 + 0.01; x += step) out.push([x, -d / 2], [x, d / 2]);
    for (let z = -d / 2 + step; z < d / 2 - 0.01; z += step) out.push([-w / 2, z], [w / 2, z]);
    return out;
  }, [w, d]);
  return (
    <group position={[lx, 0, lz]} userData={{ seeThrough: true }}>
      <mesh position={[0, CELL_TOP / 2, 0]} receiveShadow>
        <boxGeometry args={[w + 0.3, CELL_TOP, d + 0.3]} />
        <meshStandardMaterial color="#8E939C" roughness={1} />
      </mesh>
      <mesh position={[0, 0.5, -d / 2 + 0.35]} castShadow>
        <boxGeometry args={[w - 0.4, 0.12, 0.5]} />
        <meshStandardMaterial color="#6B5640" roughness={0.9} />
      </mesh>
      {bars.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.45, z]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 2.5, 6]} />
          <meshStandardMaterial color={BAR} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {[-d / 2, d / 2].map((z) => (
        <mesh key={`t${z}`} position={[0, 2.72, z]}>
          <boxGeometry args={[w + 0.1, 0.1, 0.1]} />
          <meshStandardMaterial color={BAR} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {[-w / 2, w / 2].map((x) => (
        <mesh key={`s${x}`} position={[x, 2.72, 0]}>
          <boxGeometry args={[0.1, 0.1, d + 0.1]} />
          <meshStandardMaterial color={BAR} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 2.95, d / 2 + 0.02]}>
        <boxGeometry args={[1.6, 0.36, 0.05]} />
        <meshStandardMaterial color="#F5C542" />
      </mesh>
    </group>
  );
}

const STAND: HomePose = { base: 'stand', upper: 'cool', seat: 0 };

function PostedOfficer({ o, post }: { o: Officer; post: { lx: number; lz: number; rot: number } }) {
  const speed = useRef(0);
  const act = useRef<FigureAct | HomePose | null>(STAND);
  return (
    <group position={[post.lx, 0.2, post.lz]} rotation={[0, post.rot, 0]}>
      <Figure seed={`officer:${o.id}`} look={o.look} speedRef={speed} actRef={act} label={o.name} labelColor="#9EC1FF" />
    </group>
  );
}

/**
 * During an arrest: an officer comes out of the station to whoever is being arrested (you, or another player you
 * reported), stands at their side for the cuffing, and walks them off. Purely a show; the cell itself is server state.
 */
function ArrestOfficer({ blocks, grid, boundaryRadius, station }: { blocks: Block[]; grid: CityGrid; boundaryRadius: number; station: { x: number; z: number; rot: number; d: number } }) {
  const fx = useWorld((s) => s.arrestFx);
  const g = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const act = useRef<FigureAct | HomePose | null>(null);
  const light = useRef<THREE.PointLight>(null);
  const door = useMemo(() => venueToWorld(station, 0, station.d / 2 + 2), [station]);
  useFrame(({ clock }) => {
    const o = g.current;
    if (!o) return;
    const st = useWorld.getState();
    const f = st.arrestFx;
    const t = f ? (Date.now() - f.at) / ARREST_FX_MS : 2;
    o.visible = !!f && t < 1.3;
    if (!o.visible || !f) return;
    // who: you (follow your live position) or another player (follow theirs, else where they stood)
    const peer = f.who === 'me' ? null : Object.values(st.peers).find((p) => p.handle === f.who);
    const at = f.who === 'me' ? st.playerPos : peer ?? f;
    // arrive from the side of the target nearest the station, quickly
    const dx = door.x - at.x, dz = door.z - at.z;
    const len = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, t / 0.3);
    const from = { x: at.x + (dx / len) * 7, z: at.z + (dz / len) * 7 };
    const to = { x: at.x + (dx / len) * 0.35 + (-dz / len) * 1.05, z: at.z + (dz / len) * 0.35 + (dx / len) * 1.05 };
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    o.position.set(x, surfaceY(blocks, grid, x, z, boundaryRadius), z);
    o.rotation.y = Math.atan2(at.x - x, at.z - z);
    speed.current = k < 1 ? 0.9 : 0;
    act.current = k < 1 ? null : { base: 'stand', upper: 'pull', seat: 0 };
    if (light.current) {
      light.current.color.set(Math.floor(clock.elapsedTime * 4) % 2 ? '#FF2020' : '#2050FF');
      light.current.intensity = 14;
    }
  });
  if (!fx) return null;
  return (
    <group ref={g} visible={false}>
      <Figure seed="officer:arrest" look={OFFICERS[0].look} speedRef={speed} actRef={act} label={OFFICERS[0].name} labelColor="#9EC1FF" />
      <pointLight ref={light} position={[0, 3.2, 0]} distance={9} decay={2} />
    </group>
  );
}
