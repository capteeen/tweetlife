'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Placed } from '@/lib/world/geometry';
import { useWorld } from './store';
import { BLOCK_D, ROAD, SIDEWALK } from '@/lib/world/geometry';
import { sticks } from './TouchSticks';
import { Figure } from './Figure';

// Third-person orbit-and-walk. WASD/arrows + mouse-drag on desktop, twin virtual sticks on mobile.
// The avatar is a low-poly figure; the camera orbits it. Structures push the player out softly.

const SPEED = 9;
const CAM_DIST = 11;
const CAM_HEIGHT = 4;

type Spawn = { x: number; z: number; rot: number; depth: number } | null;

// Without a deep link the visitor starts on the road north of the oldest block, facing the city centre.
const DEFAULT_SPAWN = { x: 0, z: -(BLOCK_D / 2 + SIDEWALK + ROAD / 2) };

export function Player({ structures, boundaryRadius, spawn }: { structures: Placed[]; boundaryRadius: number; spawn: Spawn }) {
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(DEFAULT_SPAWN.x, 0, DEFAULT_SPAWN.z));
  const yaw = useRef(Math.PI); // camera orbit yaw; PI = camera north of the player, looking south into the city
  const pitch = useRef(0.62);
  const facing = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const setPlayerPos = useWorld((s) => s.setPlayerPos);
  const guestbookOpen = useWorld((s) => s.guestbookOpen);
  const chatOpen = useWorld((s) => s.chatOpen);
  const lastPublish = useRef(0);
  const speedRef = useRef(0);
  const me = useWorld((s) => s.me);

  // Spawn: stand a few units away from the deep-linked structure, facing it.
  useEffect(() => {
    if (!spawn) return;
    // stand on the sidewalk in front of the building, camera behind so the building fills the view
    const face = spawn.rot === 0 ? 1 : -1;
    pos.current.set(spawn.x, 0, spawn.z + face * (spawn.depth / 2 + 4.5));
    yaw.current = Math.atan2(pos.current.x - spawn.x, pos.current.z - spawn.z);
  }, [spawn]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch handled by sticks
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const pm = (e: PointerEvent) => {
      if (!drag.current || drag.current.id !== e.pointerId) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
      yaw.current -= dx * 0.005;
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.004, 0.12, 1.25);
    };
    const pu = () => (drag.current = null);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    let mx = 0, mz = 0;
    if (!guestbookOpen && !chatOpen) {
      const k = keys.current;
      if (k.KeyW || k.ArrowUp) mz -= 1;
      if (k.KeyS || k.ArrowDown) mz += 1;
      if (k.KeyA || k.ArrowLeft) mx -= 1;
      if (k.KeyD || k.ArrowRight) mx += 1;
      // touch sticks
      mx += sticks.left.x;
      mz += sticks.left.y;
      yaw.current -= sticks.right.x * 2.2 * d;
      pitch.current = THREE.MathUtils.clamp(pitch.current + sticks.right.y * 1.5 * d, 0.12, 1.25);
    }
    const len = Math.hypot(mx, mz);
    speedRef.current = Math.min(1, len);
    if (len > 0) {
      mx /= Math.max(1, len);
      mz /= Math.max(1, len);
      // move relative to camera yaw
      const s = Math.sin(yaw.current), c = Math.cos(yaw.current);
      const wx = mx * c - mz * s;
      const wz = mx * s + mz * c;
      // (camera looks along -yaw direction from behind the player)
      const vx = wx, vz = wz;
      pos.current.x += vx * SPEED * d * Math.min(1, len);
      pos.current.z += vz * SPEED * d * Math.min(1, len);
      facing.current = Math.atan2(vx, vz);
    }
    // keep inside the boundary
    const r = Math.hypot(pos.current.x, pos.current.z);
    const maxR = boundaryRadius - 1.5;
    if (r > maxR) {
      pos.current.x *= maxR / r;
      pos.current.z *= maxR / r;
    }
    // collision with buildings: axis-aligned footprints, push out along the shallowest axis
    for (const s of structures) {
      if (s.kind === 'lantern' || s.segment > 0) continue;
      const hx = s.width / 2 + 0.4, hz = s.depth / 2 + 0.4;
      const dx = pos.current.x - s.x, dz = pos.current.z - s.z;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px < pz) pos.current.x = s.x + Math.sign(dx || 1) * hx;
      else pos.current.z = s.z + Math.sign(dz || 1) * hz;
    }
    if (group.current) {
      group.current.position.copy(pos.current);
      group.current.rotation.y = facing.current;
    }
    // camera orbit, pulled in when it would sit inside a building
    let dist = CAM_DIST;
    let cx = 0, cy = 0, cz = 0;
    for (; dist >= 2.5; dist -= 0.75) {
      cx = pos.current.x + Math.sin(yaw.current) * Math.cos(pitch.current) * dist;
      cz = pos.current.z + Math.cos(yaw.current) * Math.cos(pitch.current) * dist;
      cy = 1.2 + Math.sin(pitch.current) * dist + CAM_HEIGHT * 0.2;
      if (!insideBuilding(structures, cx, cy, cz)) break;
    }
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.001, d));
    camera.lookAt(pos.current.x, 1.3, pos.current.z);

    if (state.clock.elapsedTime - lastPublish.current > 0.1) {
      lastPublish.current = state.clock.elapsedTime;
      setPlayerPos({ x: pos.current.x, z: pos.current.z, yaw: facing.current });
    }
  });

  return (
    <group ref={group}>
      <Figure seed={me?.handle ?? 'visitor'} speedRef={speedRef} label={me ? `@${me.handle}` : undefined} labelColor="#BFE3FF" />
    </group>
  );
}

function insideBuilding(structures: Placed[], x: number, y: number, z: number) {
  for (const s of structures) {
    if (s.kind === 'lantern') continue;
    if (y > s.y + s.height + 0.5 || y < s.y) continue;
    if (Math.abs(x - s.x) < s.width / 2 + 0.6 && Math.abs(z - s.z) < s.depth / 2 + 0.6) return true;
  }
  return false;
}
