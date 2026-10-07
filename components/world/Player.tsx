'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Placed } from '@/lib/world/geometry';
import { useWorld } from './store';
import { BLOCK_D, ROAD, SIDEWALK } from '@/lib/world/geometry';
import { sticks } from './TouchSticks';
import { Figure } from './Figure';
import { Vehicle, riderOffset } from './Vehicle';
import { placeVenues } from '@/lib/life/venues';

// Third-person orbit-and-walk. WASD/arrows + mouse-drag on desktop, twin virtual sticks on mobile.
// The avatar is a low-poly figure; the camera orbits it. Structures push the player out softly.

const SPEED = 9;
const CAM_DIST = 11;
const CAM_HEIGHT = 4;

type Spawn = { x: number; z: number; rot: number; depth: number } | null;

// Without a deep link the visitor starts on the road north of the oldest block, facing the city centre.
const DEFAULT_SPAWN = { x: 0, z: -(BLOCK_D / 2 + SIDEWALK + ROAD / 2) };

type Obstacle = { x: number; z: number; w: number; d: number };

export function Player({ structures, boundaryRadius, contentRadius, spawn }: { structures: Placed[]; boundaryRadius: number; contentRadius: number; spawn: Spawn }) {
  const venues = useMemo(() => placeVenues(contentRadius), [contentRadius]);
  const obstacles = useMemo<Obstacle[]>(() => venues.map((v) => ({ x: v.x, z: v.z, w: v.w, d: v.d })), [venues]);
  const riding = useWorld((s) => s.riding);
  const teleport = useWorld((s) => s.teleport);
  const setTeleport = useWorld((s) => s.setTeleport);
  const setNearVenue = useWorld((s) => s.setNearVenue);
  const altitude = useRef(0);
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
  const look = useWorld((s) => s.life?.me?.look ?? null);

  // Spawn: stand a few units away from the deep-linked structure, facing it.
  useEffect(() => {
    if (!teleport) return;
    const free = freeSpotNear(structures, obstacles, teleport.x, teleport.z, boundaryRadius, 'walk');
    pos.current.set(free.x, 0, free.z);
    setTeleport(null);
  }, [teleport, structures, obstacles, boundaryRadius, setTeleport]);

  useEffect(() => {
    if (!spawn) return;
    // stand on the sidewalk in front of the building, camera behind so the building fills the view
    const face = spawn.rot === 0 ? 1 : -1;
    const free = freeSpotNear(structures, obstacles, spawn.x, spawn.z + face * (spawn.depth / 2 + 4.5), boundaryRadius, 'walk');
    pos.current.set(free.x, 0, free.z);
    yaw.current = Math.atan2(pos.current.x - spawn.x, pos.current.z - spawn.z);
  }, [spawn, structures, obstacles, boundaryRadius]);

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
      const vx = mx * c - mz * s;
      const vz = mx * s + mz * c;
      const mode: MoveMode = riding?.kind === 'plane' ? 'plane' : riding?.kind === 'boat' ? 'boat' : 'walk';
      const step = SPEED * (riding?.speed ?? 1) * d * Math.min(1, len);
      const nx = pos.current.x + vx * step, nz = pos.current.z + vz * step;
      // Slide-and-block: a step that would end inside a building is refused; try each axis alone so
      // walls can be followed. Nothing ever pushes the player, so nothing can trap them.
      if (!blockedAt(structures, obstacles, nx, nz, boundaryRadius, mode)) pos.current.set(nx, pos.current.y, nz);
      else if (!blockedAt(structures, obstacles, nx, pos.current.z, boundaryRadius, mode)) pos.current.x = nx;
      else if (!blockedAt(structures, obstacles, pos.current.x, nz, boundaryRadius, mode)) pos.current.z = nz;
      facing.current = Math.atan2(vx, vz);
    }
    // the jet climbs to cruising height; everything else sits on the ground (or the water)
    const targetAlt = riding?.kind === 'plane' ? 16 : 0;
    altitude.current += (targetAlt - altitude.current) * Math.min(1, d * 2);
    pos.current.y = altitude.current;
    // if a vehicle was put away mid-air or on the water, walk back to solid ground
    if (!riding && Math.hypot(pos.current.x, pos.current.z) > boundaryRadius - 1.5) {
      const r = Math.hypot(pos.current.x, pos.current.z);
      pos.current.x *= (boundaryRadius - 2) / r;
      pos.current.z *= (boundaryRadius - 2) / r;
    }
    if (group.current) {
      group.current.position.copy(pos.current);
      group.current.rotation.y = facing.current;
    }
    // venue proximity prompt
    if (state.clock.elapsedTime - lastPublish.current > 0.1) {
      let nearest: string | null = null, nd = 9;
      for (const v of venues) {
        const dist = Math.hypot(v.x - pos.current.x, v.z - pos.current.z) - v.w / 2;
        if (dist < nd) { nd = dist; nearest = v.id; }
      }
      if (nearest !== useWorld.getState().nearVenue) setNearVenue(nearest);
    }
    // camera orbit, pulled in when it would sit inside a building
    let dist = CAM_DIST * (riding?.kind === 'plane' ? 2.2 : riding ? 1.3 : 1);
    let cx = 0, cy = 0, cz = 0;
    for (; dist >= 2.5; dist -= 0.75) {
      cx = pos.current.x + Math.sin(yaw.current) * Math.cos(pitch.current) * dist;
      cz = pos.current.z + Math.cos(yaw.current) * Math.cos(pitch.current) * dist;
      cy = pos.current.y + 1.2 + Math.sin(pitch.current) * dist + CAM_HEIGHT * 0.2;
      if (!insideBuilding(structures, cx, cy, cz)) break;
    }
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.001, d));
    camera.lookAt(pos.current.x, pos.current.y + 1.3, pos.current.z);

    if (state.clock.elapsedTime - lastPublish.current > 0.1) {
      lastPublish.current = state.clock.elapsedTime;
      setPlayerPos({ x: pos.current.x, z: pos.current.z, yaw: facing.current });
    }
  });

  const ro = riderOffset(riding);
  return (
    <group ref={group}>
      {riding && <Vehicle item={riding} />}
      {ro.show && (
        <group position={[0, ro.y, 0]} scale={ro.scale}>
          <Figure seed={me?.handle ?? 'visitor'} look={me ? look : null} speedRef={speedRef} label={me ? `@${me.handle}` : undefined} labelColor="#BFE3FF" />
        </group>
      )}
      {!ro.show && me && (
        <Figure seed={me.handle} look={look} speedRef={speedRef} label={`@${me.handle}`} labelColor="#BFE3FF" dim />
      )}
    </group>
  );
}

const PLAYER_R = 0.35;

export type MoveMode = 'walk' | 'boat' | 'plane';
/** How far past the shore boats and planes may go (the water ring is wide). */
const WATER_RANGE = 140;

/** True when a player at (x, z) would overlap a building/venue footprint or leave the allowed area for this mode. */
function blockedAt(structures: Placed[], obstacles: Obstacle[], x: number, z: number, boundaryRadius: number, mode: MoveMode) {
  const r = Math.hypot(x, z);
  if (mode === 'walk' && r > boundaryRadius - 1.5) return true;
  if (mode !== 'walk' && r > boundaryRadius + WATER_RANGE) return true;
  if (mode === 'plane') return false;
  for (const o of obstacles) if (Math.abs(x - o.x) < o.w / 2 + PLAYER_R && Math.abs(z - o.z) < o.d / 2 + PLAYER_R) return true;
  for (const s of structures) {
    if (s.kind === 'lantern' || s.segment > 0) continue;
    if (Math.abs(x - s.x) < s.width / 2 + PLAYER_R && Math.abs(z - s.z) < s.depth / 2 + PLAYER_R) return true;
  }
  return false;
}

/** The nearest open spot to (x, z), searched in rings of half a unit. */
function freeSpotNear(structures: Placed[], obstacles: Obstacle[], x: number, z: number, boundaryRadius: number, mode: MoveMode) {
  if (!blockedAt(structures, obstacles, x, z, boundaryRadius, mode)) return { x, z };
  for (let r = 0.5; r <= 14; r += 0.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!blockedAt(structures, obstacles, px, pz, boundaryRadius, mode)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

/** Camera placement check: inside a building's volume. */
function insideBuilding(structures: Placed[], x: number, y: number, z: number) {
  for (const s of structures) {
    if (s.kind === 'lantern') continue;
    if (y > s.y + s.height + 0.5 || y < s.y) continue;
    if (Math.abs(x - s.x) < s.width / 2 + 0.6 && Math.abs(z - s.z) < s.depth / 2 + 0.6) return true;
  }
  return false;
}
