'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { seededFor } from '@/lib/world/seed';
import { useWorld } from './store';
import { Figure } from './Figure';
import { Vehicle, riderOffset } from './Vehicle';
import { Balloons, HAND, useSlumpRef } from './Balloons';
import { ITEMS } from '@/lib/life/market';
import type { Peer as PeerT } from './store';
import { residentLook } from '@/lib/life/look';
import { useLookOf } from '@/components/life/useLook';
import { groundHeightAt, surfaceY, type Block, type CityGrid } from '@/lib/world/geometry';
import type { FigureAct } from './figureMoves';

// Residents: ambient people whose count comes from followers_count, wandering on seeded loops.
// Peers: the real visitors currently inside, from the presence room.

export function Residents({ count, radius, handle, blocks, grid }: { count: number; radius: number; handle: string; blocks: Block[]; grid: CityGrid }) {
  const loops = useMemo(() => {
    const rnd = seededFor(handle, 'residents');
    return Array.from({ length: count }, (_, i) => ({
      seed: `${handle}#resident${i}`,
      cx: (rnd() - 0.5) * radius * 1.4,
      cz: (rnd() - 0.5) * radius * 1.4,
      r: 3 + rnd() * 10,
      speed: 0.08 + rnd() * 0.1,
      phase: rnd() * Math.PI * 2,
      dir: rnd() < 0.5 ? 1 : -1,
    }));
  }, [count, radius, handle]);
  if (count === 0) return null;
  return (
    <>
      {loops.map((l) => (
        <Resident key={l.seed} loop={l} radius={radius} blocks={blocks} grid={grid} />
      ))}
    </>
  );
}

function Resident({ loop: l, radius, blocks, grid }: { loop: { seed: string; cx: number; cz: number; r: number; speed: number; phase: number; dir: number }; radius: number; blocks: Block[]; grid: CityGrid }) {
  const ref = useRef<THREE.Group>(null);
  const look = useMemo(() => residentLook(l.seed), [l.seed]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const a = l.phase + clock.elapsedTime * l.speed * l.dir;
    const x = l.cx + Math.cos(a) * l.r, z = l.cz + Math.sin(a) * l.r;
    const rr = Math.hypot(x, z);
    const k = rr > radius - 2 ? (radius - 2) / rr : 1;
    g.position.set(x * k, groundHeightAt(blocks, grid, x * k, z * k), z * k);
    // face the direction of travel (tangent of the circle)
    const tx = -Math.sin(a) * l.dir, tz = Math.cos(a) * l.dir;
    g.rotation.y = Math.atan2(tx, tz);
  });
  return (
    <group ref={ref}>
      <Figure seed={l.seed} look={look} alwaysWalk dim />
    </group>
  );
}

export function Peers({ blocks, grid, boundaryRadius }: { blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const peers = useWorld((s) => s.peers);
  const me = useWorld((s) => s.me);
  const list = Object.values(peers).filter((p) => p.id !== me?.id && Date.now() - p.at < 15000);
  return (
    <>
      {list.map((p) => (
        <Peer key={p.id} peer={p} blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} />
      ))}
    </>
  );
}

function Peer({ peer, blocks, grid, boundaryRadius }: { peer: PeerT; blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const ref = useRef<THREE.Group>(null);
  const selectPeer = useWorld((s) => s.selectPeer);
  const item = peer.ride ? ITEMS.find((i) => i.id === peer.ride) ?? null : null;
  const ro = riderOffset(item);
  const speed = useRef(0);
  const act = useRef<FigureAct | null>(null);
  const look = useLookOf(peer.handle);
  const hand = useRef<THREE.Object3D>(null);
  const slumpRef = useSlumpRef(peer.handle);
  const last = useRef({ x: peer.x, z: peer.z, t: performance.now() });
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // smooth toward the last reported position; derive walk speed from motion
    g.position.x += (peer.x - g.position.x) * 0.2;
    g.position.z += (peer.z - g.position.z) * 0.2;
    const floor = surfaceY(blocks, grid, g.position.x, g.position.z, boundaryRadius);
    g.position.y += ((item?.kind === 'plane' ? 16 : floor) - g.position.y) * (item?.kind === 'plane' ? 0.05 : 0.3);
    g.rotation.y = peer.yaw;
    const now = performance.now();
    const dt = Math.max(1, now - last.current.t) / 1000;
    const v = Math.hypot(peer.x - last.current.x, peer.z - last.current.z) / dt;
    last.current = { x: peer.x, z: peer.z, t: now };
    speed.current = Math.min(1, v / 6);
    act.current = item ? null : peer.act ?? null;
  });
  return (
    <group
      ref={ref}
      position={[peer.x, 0, peer.z]}
      onClick={(e) => {
        e.stopPropagation();
        selectPeer(peer);
      }}
    >
      {item && <Vehicle item={item} />}
      <group position={[0, ro.y, 0]} scale={ro.scale}>
        <Figure seed={peer.handle} look={look} speedRef={speed} actRef={act} slumpRef={slumpRef} label={`@${peer.handle}`} dim={!ro.show} />
        <object3D ref={hand} position={HAND} />
      </group>
      <Balloons handle={peer.handle} hand={hand} scale={ro.scale} visible={ro.show} />
    </group>
  );
}
