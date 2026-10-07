'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { seededFor } from '@/lib/world/seed';
import { useWorld } from './store';
import { Figure } from './Figure';

// Residents: ambient people whose count comes from followers_count, wandering on seeded loops.
// Peers: the real visitors currently inside, from the presence room.

export function Residents({ count, radius, handle }: { count: number; radius: number; handle: string }) {
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
        <Resident key={l.seed} loop={l} radius={radius} />
      ))}
    </>
  );
}

function Resident({ loop: l, radius }: { loop: { seed: string; cx: number; cz: number; r: number; speed: number; phase: number; dir: number }; radius: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const a = l.phase + clock.elapsedTime * l.speed * l.dir;
    const x = l.cx + Math.cos(a) * l.r, z = l.cz + Math.sin(a) * l.r;
    const rr = Math.hypot(x, z);
    const k = rr > radius - 2 ? (radius - 2) / rr : 1;
    g.position.set(x * k, 0, z * k);
    // face the direction of travel (tangent of the circle)
    const tx = -Math.sin(a) * l.dir, tz = Math.cos(a) * l.dir;
    g.rotation.y = Math.atan2(tx, tz);
  });
  return (
    <group ref={ref}>
      <Figure seed={l.seed} alwaysWalk dim />
    </group>
  );
}

export function Peers() {
  const peers = useWorld((s) => s.peers);
  const me = useWorld((s) => s.me);
  const list = Object.values(peers).filter((p) => p.id !== me?.id && Date.now() - p.at < 15000);
  return (
    <>
      {list.map((p) => (
        <Peer key={p.id} peer={p} />
      ))}
    </>
  );
}

function Peer({ peer }: { peer: { id: string; handle: string; x: number; z: number; yaw: number } }) {
  const ref = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const last = useRef({ x: peer.x, z: peer.z, t: performance.now() });
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // smooth toward the last reported position; derive walk speed from motion
    g.position.x += (peer.x - g.position.x) * 0.2;
    g.position.z += (peer.z - g.position.z) * 0.2;
    g.rotation.y = peer.yaw;
    const now = performance.now();
    const dt = Math.max(1, now - last.current.t) / 1000;
    const v = Math.hypot(peer.x - last.current.x, peer.z - last.current.z) / dt;
    last.current = { x: peer.x, z: peer.z, t: now };
    speed.current = Math.min(1, v / 6);
  });
  return (
    <group ref={ref} position={[peer.x, 0, peer.z]}>
      <Figure seed={peer.handle} speedRef={speed} label={`@${peer.handle}`} />
    </group>
  );
}
