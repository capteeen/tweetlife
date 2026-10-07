'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Placed } from '@/lib/world/geometry';
import { useWorld } from './store';
import { sticks } from './TouchSticks';
import { Figure } from './Figure';

// Third-person orbit-and-walk. WASD/arrows + mouse-drag on desktop, twin virtual sticks on mobile.
// The avatar is a low-poly figure; the camera orbits it. Structures push the player out softly.

const SPEED = 7;
const CAM_DIST = 6.5;
const CAM_HEIGHT = 3.2;

export function Player({ structures, boundaryRadius, spawn }: { structures: Placed[]; boundaryRadius: number; spawn: { x: number; z: number } | null }) {
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(spawn?.x ?? 0, 0, spawn?.z ?? 0));
  const yaw = useRef(0); // camera orbit yaw
  const pitch = useRef(0.3);
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
    const a = Math.atan2(spawn.z, spawn.x) + 0.6;
    pos.current.set(spawn.x + Math.cos(a) * 5, 0, spawn.z + Math.sin(a) * 5);
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
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.004, 0.05, 1.1);
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
      pitch.current = THREE.MathUtils.clamp(pitch.current + sticks.right.y * 1.5 * d, 0.05, 1.1);
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
    // soft collision with structures
    for (const s of structures) {
      if (s.kind === 'lantern') continue;
      const dx = pos.current.x - s.x, dz = pos.current.z - s.z;
      const rr = s.width * 0.6 + 0.45;
      const dist = Math.hypot(dx, dz);
      if (dist < rr && dist > 0.0001) {
        pos.current.x = s.x + (dx / dist) * rr;
        pos.current.z = s.z + (dz / dist) * rr;
      }
    }
    if (group.current) {
      group.current.position.copy(pos.current);
      group.current.rotation.y = facing.current;
    }
    // camera orbit
    const cx = pos.current.x + Math.sin(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cz = pos.current.z + Math.cos(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cy = 1.6 + Math.sin(pitch.current) * CAM_DIST + CAM_HEIGHT * 0.2;
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
