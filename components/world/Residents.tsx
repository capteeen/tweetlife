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
import type { Block, CityGrid } from '@/lib/world/geometry';
import { surfaceY } from '@/lib/world/ground';
import { aroundRect, sidewalkLoop, type RectLoop } from '@/lib/world/sidewalks';
import type { FigureAct } from './figureMoves';

// Residents: ambient people whose count comes from followers_count, strolling round the blocks on the sidewalks
// (never through buildings, venues or traffic). Peers: the real visitors currently inside, from the presence room.

type Loop = RectLoop & { seed: string; speed: number; phase: number; dir: number };

export function Residents({ count, radius, handle, blocks, grid, boundaryRadius }: { count: number; radius: number; handle: string; blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const loops = useMemo<Loop[]>(() => {
    const rnd = seededFor(handle, 'residents');
    // round a block on its sidewalk; a world with no blocks yet gets a loop round the centre
    return Array.from({ length: count }, (_, i) => {
      const b = blocks.length ? blocks[Math.floor(rnd() * blocks.length)] : null;
      const r = Math.min(12, radius / 3);
      return {
        seed: `${handle}#resident${i}`,
        ...(b ? sidewalkLoop(b, grid) : { cx: 0, cz: 0, hw: r, hd: r }),
        speed: 0.9 + rnd() * 0.5,
        phase: rnd(),
        dir: rnd() < 0.5 ? 1 : -1,
      };
    });
  }, [count, radius, handle, blocks, grid]);
  if (count === 0) return null;
  return (
    <>
      {loops.map((l) => (
        <Resident key={l.seed} loop={l} blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} />
      ))}
    </>
  );
}

function Resident({ loop: l, blocks, grid, boundaryRadius }: { loop: Loop; blocks: Block[]; grid: CityGrid; boundaryRadius: number }) {
  const ref = useRef<THREE.Group>(null);
  const look = useMemo(() => residentLook(l.seed), [l.seed]);
  const per = 4 * (l.hw + l.hd);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const p = aroundRect(l, l.phase + (clock.elapsedTime * l.speed * l.dir) / per);
    g.position.set(p.x, surfaceY(blocks, grid, p.x, p.z, boundaryRadius), p.z);
    g.rotation.y = l.dir > 0 ? p.heading : p.heading + Math.PI;
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
