'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Block, CityGrid, Placed } from '@/lib/world/geometry';
import { useWorld } from './store';
import { BLOCK_D, BLOCK_W, SIDEWALK, SIDEWALK_TOP, surfaceY } from '@/lib/world/geometry';
import { sticks } from './TouchSticks';
import { Figure } from './Figure';
import { Vehicle, riderOffset } from './Vehicle';
import { Balloons, HAND, useSlumpRef } from './Balloons';
import { placeVenues } from '@/lib/life/venues';
import { SPRINT_MIN_GAS, SPRINT_MULT, paceFor, tiredness, walkCost } from '@/lib/life/activities';
import { lifeActions } from '@/components/life/useLife';
import type { FigureAct } from './figureMoves';
import { airportLayout, airportSolids, along, onLand, type Airport } from '@/lib/world/layout';
import { RideVehicle, rideCamera, rideRider } from './RideVehicle';
import { worldWalls } from '@/lib/world/interiors';
import { carItem } from '@/components/life/travel';
import { playerSound } from '@/lib/audio/state';
import { lookFor } from '@/lib/life/look';

// Third-person orbit-and-walk. WASD/arrows + mouse-drag on desktop, twin virtual sticks on mobile.
// The avatar is a low-poly figure; the camera orbits it. Structures push the player out softly.
// On foot, walking burns gas (Shift sprints, faster and hungrier); a tired player slows down and slouches.

const SPEED = 9;
const CAM_DIST = 11;
const CAM_HEIGHT = 4;

type Spawn = { x: number; z: number; rot: number; depth: number } | null;

// Without a deep link the visitor starts on the sidewalk at the north-east corner of the oldest block, with the
// camera out over the open crossing looking back at them and the city behind: never in a lane, never behind a tower.
const DEFAULT_SPAWN = { x: BLOCK_W / 2 + SIDEWALK / 2, z: -(BLOCK_D / 2 + SIDEWALK / 2) };
const DEFAULT_YAW = (Math.PI * 3) / 4;

/** w/d along the obstacle's own axes; `rot` turns it like a venue (walls of walk-in venues). */
type Obstacle = { x: number; z: number; w: number; d: number; rot?: number };

export function Player({ structures, blocks, grid, boundaryRadius, contentRadius, spawn }: { structures: Placed[]; blocks: Block[]; grid: CityGrid; boundaryRadius: number; contentRadius: number; spawn: Spawn }) {
  const venues = useMemo(() => placeVenues(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);
  const airport = useMemo(() => airportLayout(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);
  const obstacles = useMemo<Obstacle[]>(
    () => [...venues.flatMap((v) => (v.walkIn ? worldWalls(v) : [{ x: v.x, z: v.z, w: v.w, d: v.d }])), ...airportSolids(airport)],
    [venues, airport],
  );
  const trip = useWorld((s) => s.trip);
  const setTrip = useWorld((s) => s.setTrip);
  const riding = useWorld((s) => s.riding);
  const teleport = useWorld((s) => s.teleport);
  const setTeleport = useWorld((s) => s.setTeleport);
  const setNearVenue = useWorld((s) => s.setNearVenue);
  const altitude = useRef(0);
  const ground = useRef<number | null>(null);
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(DEFAULT_SPAWN.x, 0, DEFAULT_SPAWN.z));
  const yaw = useRef(DEFAULT_YAW); // camera orbit yaw; PI = camera north of the player, looking south into the city
  const pitch = useRef(0.45);
  const facing = useRef(DEFAULT_YAW); // face the camera on arrival
  const { scene } = useThree();
  const blockers = useRef<{ list: THREE.Mesh[]; at: number }>({ list: [], at: -1 });
  // how far back the camera may sit right now: pulled in at once when something blocks the view, eased back out
  const camDist = useRef(CAM_DIST);
  const camFrame = useRef(0);
  const camFree = useRef(CAM_DIST);
  const keys = useRef<Record<string, boolean>>({});
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const setPlayerPos = useWorld((s) => s.setPlayerPos);
  const guestbookOpen = useWorld((s) => s.guestbookOpen);
  const chatOpen = useWorld((s) => s.chatOpen);
  const lastPublish = useRef(0);
  const speedRef = useRef(0);
  const me = useWorld((s) => s.me);
  const chosenLook = useWorld((s) => s.life?.me?.look ?? null);
  // on a job shift you wear a work shirt in the job's colours (lib/life/jobs.ts)
  const uniform = useWorld((s) => s.shift?.uniform ?? null);
  const look = useMemo(() => {
    if (!uniform || !me) return chosenLook;
    return { ...(chosenLook ?? lookFor(me.handle)), shirt: uniform, pattern: 'solid' as const };
  }, [chosenLook, uniform, me]);
  const hand = useRef<THREE.Object3D>(null);
  const slumpRef = useSlumpRef(me?.handle ?? '');
  const actRef = useRef<FigureAct | null>(null);
  const tiredRef = useRef(0);
  // distance on foot not yet reported to the server
  const walked = useRef({ walk: 0, sprint: 0, sending: false });

  // Spawn: stand a few units away from the deep-linked structure, facing it.
  // the default spot can still have a lot or a venue on it in a small world: step to the nearest open ground
  const placed = useRef(false);
  useEffect(() => {
    // once: a world still building reloads its structures every few seconds, and that mustn't yank you back here
    if (spawn || placed.current) return;
    placed.current = true;
    // TODO(countries): when each country is its own city, spawn in the home city of
    // useWorld.getState().life?.me?.citizen.country (lib/life/citizen.ts) instead of DEFAULT_SPAWN here.
    const free = freeSpotNear(structures, obstacles, DEFAULT_SPAWN.x, DEFAULT_SPAWN.z, boundaryRadius, 'walk', airport);
    pos.current.set(free.x, 0, free.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures, obstacles, boundaryRadius, airport]);

  useEffect(() => {
    if (!teleport) return;
    const free = freeSpotNear(structures, obstacles, teleport.x, teleport.z, boundaryRadius, 'walk', airport);
    pos.current.set(free.x, 0, free.z);
    setTeleport(null);
  }, [teleport, structures, obstacles, boundaryRadius, setTeleport, airport]);

  useEffect(() => {
    if (!spawn) return;
    // stand on the sidewalk in front of the building (not out in the lane), camera behind so the building fills the view
    const face = spawn.rot === 0 ? 1 : -1;
    let front = spawn.depth / 2 + 4.5;
    for (let t = spawn.depth / 2 + 1; t <= spawn.depth / 2 + 9; t += 0.5) {
      const z = spawn.z + face * t;
      if (surfaceY(blocks, grid, spawn.x, z, boundaryRadius) === SIDEWALK_TOP && !blockedAt(structures, obstacles, spawn.x, z, boundaryRadius, 'walk', airport)) {
        front = t + 0.5;
        break;
      }
    }
    const free = freeSpotNear(structures, obstacles, spawn.x, spawn.z + face * front, boundaryRadius, 'walk', airport);
    pos.current.set(free.x, 0, free.z);
    yaw.current = Math.atan2(pos.current.x - spawn.x, pos.current.z - spawn.z);
  }, [spawn, structures, obstacles, boundaryRadius, airport, blocks, grid]);

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
    // a key released while the tab was in the background never sends keyup; drop everything held so the player doesn't keep walking
    const release = () => {
      keys.current = {};
      drag.current = null;
    };
    const vis = () => document.hidden && release();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    let mx = 0, mz = 0;
    // on a ride: follow the route, then step off at the nearest open spot
    const tr = useWorld.getState().trip;
    if (tr) {
      const t = (performance.now() - tr.startedAt) / 1000 / tr.duration;
      const p = along(tr.path, t);
      if (t >= 1) {
        const free = freeSpotNear(structures, obstacles, p.x, p.z, boundaryRadius, 'walk', airport);
        pos.current.set(free.x, pos.current.y, free.z);
        setTrip(null);
      } else {
        pos.current.set(p.x, pos.current.y, p.z);
        // turn smoothly into corners
        let dh = p.heading - facing.current;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        facing.current += dh * Math.min(1, d * 8);
      }
      speedRef.current = tr.mode === 'walk' ? 1 : 0;
    }
    if (!tr && !guestbookOpen && !chatOpen) {
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
    if (!tr) speedRef.current = Math.min(1, len);
    const st = useWorld.getState();
    const gas = st.life?.me?.gas;
    const onFoot = !riding && gas != null;
    tiredRef.current = onFoot ? tiredness(gas) : 0;
    // an activity plays until it ends or you walk off
    if (st.doing && (len > 0.05 || riding || Date.now() > st.doing.until)) st.setDoing(null);
    // on shift, standing at your station, you do the job's move
    actRef.current = st.doing && !riding ? st.doing.id : st.shift?.act && !tr && !riding && len < 0.05 ? st.shift.act : null;
    let sprinting = false;
    if (len > 0) {
      mx /= Math.max(1, len);
      mz /= Math.max(1, len);
      // move relative to camera yaw
      const s = Math.sin(yaw.current), c = Math.cos(yaw.current);
      const vx = mx * c - mz * s;
      const vz = mx * s + mz * c;
      const mode: MoveMode = riding?.kind === 'plane' ? 'plane' : riding?.kind === 'boat' ? 'boat' : 'walk';
      const sprint = onFoot && !!(keys.current.ShiftLeft || keys.current.ShiftRight) && gas >= SPRINT_MIN_GAS;
      sprinting = sprint;
      const pace = onFoot ? paceFor(gas) * (sprint ? SPRINT_MULT : 1) : 1;
      const step = SPEED * (riding?.speed ?? 1) * pace * d * Math.min(1, len);
      const nx = pos.current.x + vx * step, nz = pos.current.z + vz * step;
      const before = { x: pos.current.x, z: pos.current.z };
      // Slide-and-block: a step that would end inside a building is refused; try each axis alone so
      // walls can be followed. Nothing ever pushes the player, so nothing can trap them.
      if (!blockedAt(structures, obstacles, nx, nz, boundaryRadius, mode, airport)) pos.current.set(nx, pos.current.y, nz);
      else if (!blockedAt(structures, obstacles, nx, pos.current.z, boundaryRadius, mode, airport)) pos.current.x = nx;
      else if (!blockedAt(structures, obstacles, pos.current.x, nz, boundaryRadius, mode, airport)) pos.current.z = nz;
      facing.current = Math.atan2(vx, vz);
      if (onFoot) {
        const moved = Math.hypot(pos.current.x - before.x, pos.current.z - before.z);
        if (sprint) walked.current.sprint += moved;
        else walked.current.walk += moved;
      }
    }
    // every whole gas walked off goes to the server (it never pays anything back, so a lost report only helps you)
    const w = walked.current;
    if (!w.sending && walkCost(w.walk, w.sprint) >= 1) {
      const sent = { walk: w.walk, sprint: w.sprint };
      w.walk = 0;
      w.sprint = 0;
      w.sending = true;
      lifeActions.walk(sent.walk, sent.sprint).catch(() => {}).finally(() => (w.sending = false));
    }
    // the jet climbs to cruising height; everything else sits on the ground (or the water)
    const targetAlt = riding?.kind === 'plane' && !tr ? 16 : 0;
    altitude.current += (targetAlt - altitude.current) * Math.min(1, d * 2);
    // stand on whatever surface is underfoot (road, sidewalk, block, lot); quick ease so curbs read as a step
    const floor = surfaceY(blocks, grid, pos.current.x, pos.current.z, boundaryRadius);
    ground.current = ground.current === null ? floor : ground.current + (floor - ground.current) * Math.min(1, d * 20);
    pos.current.y = altitude.current + ground.current;
    // if a vehicle was put away mid-air or on the water, walk back to solid ground
    if (!riding && !tr && !onLand(pos.current.x, pos.current.z, contentRadius, boundaryRadius, airport)) {
      const r = Math.hypot(pos.current.x, pos.current.z);
      pos.current.x *= (boundaryRadius - 2) / r;
      pos.current.z *= (boundaryRadius - 2) / r;
    }
    if (group.current) {
      group.current.position.copy(pos.current);
      group.current.rotation.y = facing.current;
    }
    // for footsteps, breathing and the 3D listener (components/audio)
    Object.assign(playerSound, { x: pos.current.x, y: pos.current.y, z: pos.current.z, speed: speedRef.current, sprint: sprinting, tired: tiredRef.current, onFoot: !riding && (!tr || tr.mode === 'walk'), surface: null });
    // venue proximity prompt
    if (state.clock.elapsedTime - lastPublish.current > 0.1) {
      let nearest: string | null = null, nd = 9;
      for (const v of venues) {
        const dist = Math.hypot(Math.max(0, Math.abs(v.x - pos.current.x) - v.w / 2), Math.max(0, Math.abs(v.z - pos.current.z) - v.d / 2));
        if (dist < nd) { nd = dist; nearest = v.id; }
      }
      if (tr) nearest = null; // no "Enter" prompts for places you pass on a ride
      if (nearest !== useWorld.getState().nearVenue) setNearVenue(nearest);
    }
    // turn to face your work, and swing the camera round to a requested view (your face, at your station on shift)
    if (st.faceAim != null && !tr) {
      let df = st.faceAim - facing.current;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      facing.current += df * Math.min(1, d * 6);
      if (Math.abs(df) < 0.02 || len > 0.05) st.setFaceAim(null);
    }
    if (st.camAim != null) {
      let dy = st.camAim.yaw - yaw.current;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const dp = st.camAim.pitch - pitch.current;
      yaw.current += dy * Math.min(1, d * 3);
      pitch.current += dp * Math.min(1, d * 3);
      if (Math.abs(dy) < 0.02 && Math.abs(dp) < 0.02) st.setCamAim(null);
    }
    // camera orbit, pulled in when it would sit inside a building or when anything (a tower, a tree, a venue wall)
    // stands between it and the player
    let dist = CAM_DIST * (tr && tr.mode !== 'walk' ? rideCamera(tr.mode) : riding?.kind === 'plane' ? 2.2 : riding ? 1.3 : st.shift && !tr ? 0.6 : 1);
    const dir = new THREE.Vector3(Math.sin(yaw.current) * Math.cos(pitch.current), Math.sin(pitch.current), Math.cos(yaw.current) * Math.cos(pitch.current));
    const head = new THREE.Vector3(pos.current.x, pos.current.y + 1.3, pos.current.z);
    for (; dist >= 2.5; dist -= 0.75) {
      const cx = pos.current.x + dir.x * dist, cz = pos.current.z + dir.z * dist;
      const cy = pos.current.y + 1.2 + dir.y * dist + CAM_HEIGHT * 0.2;
      if (!insideBuilding(structures, cx, cy, cz)) break;
    }
    // line of sight from the head back to the camera, several times a second; the list of things that could
    // block it is gathered from the scene once a second
    if (camFrame.current++ % 4 === 0) {
      const b = blockers.current;
      if (state.clock.elapsedTime - b.at > 1) {
        b.list = gatherBlockers(scene, group.current);
        b.at = state.clock.elapsedTime;
      }
      const hit = clearDistance(b.list, head, dir, dist);
      camFree.current = hit >= dist ? dist : Math.max(1.6, hit - 0.6);
    }
    const want = Math.min(dist, camFree.current);
    camDist.current = want < camDist.current ? want : camDist.current + (want - camDist.current) * Math.min(1, d * 1.5);
    const cd = camDist.current;
    const cx = pos.current.x + dir.x * cd, cz = pos.current.z + dir.z * cd;
    const cy = pos.current.y + 1.2 + dir.y * cd + CAM_HEIGHT * 0.2 * Math.min(1, cd / CAM_DIST);
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.001, d));
    camera.lookAt(pos.current.x, pos.current.y + 1.3, pos.current.z);

    if (state.clock.elapsedTime - lastPublish.current > 0.1) {
      lastPublish.current = state.clock.elapsedTime;
      setPlayerPos({ x: pos.current.x, z: pos.current.z, yaw: facing.current });
    }
  });

  // on a ride, the ride replaces whatever you were driving
  const tripCar = trip?.mode === 'own' ? carItem(trip.itemId) : null;
  const shown = trip ? (trip.mode === 'walk' ? null : tripCar) : riding;
  const ro = trip && trip.mode !== 'walk' && !tripCar ? rideRider(trip.mode) : riderOffset(shown);
  return (
    <group ref={group}>
      {shown && <Vehicle item={shown} />}
      {trip && trip.mode !== 'walk' && trip.mode !== 'own' && <RideVehicle mode={trip.mode} />}
      {ro.show && (
        <group position={[0, ro.y, 0]} scale={ro.scale}>
          <Figure seed={me?.handle ?? 'visitor'} look={me ? look : null} speedRef={speedRef} actRef={actRef} tiredRef={tiredRef} slumpRef={slumpRef} label={me ? `@${me.handle}` : undefined} labelColor="#BFE3FF" />
          <object3D ref={hand} position={HAND} />
        </group>
      )}
      {me && <Balloons handle={me.handle} hand={hand} scale={ro.scale} visible={ro.show} />}
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
function blockedAt(structures: Placed[], obstacles: Obstacle[], x: number, z: number, boundaryRadius: number, mode: MoveMode, airport: Airport) {
  const r = Math.hypot(x, z);
  if (mode === 'walk' && !onLand(x, z, 0, boundaryRadius, airport)) return true;
  if (mode !== 'walk' && r > boundaryRadius + WATER_RANGE) return true;
  if (mode === 'plane') return false;
  for (const o of obstacles) {
    let dx = x - o.x, dz = z - o.z;
    if (o.rot) {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    if (Math.abs(dx) < o.w / 2 + PLAYER_R && Math.abs(dz) < o.d / 2 + PLAYER_R) return true;
  }
  for (const s of structures) {
    if (s.kind === 'lantern' || s.segment > 0) continue;
    if (Math.abs(x - s.x) < s.width / 2 + PLAYER_R && Math.abs(z - s.z) < s.depth / 2 + PLAYER_R) return true;
  }
  return false;
}

/** The nearest open spot to (x, z), searched in rings of half a unit. */
function freeSpotNear(structures: Placed[], obstacles: Obstacle[], x: number, z: number, boundaryRadius: number, mode: MoveMode, airport: Airport) {
  if (!blockedAt(structures, obstacles, x, z, boundaryRadius, mode, airport)) return { x, z };
  for (let r = 0.5; r <= 14; r += 0.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!blockedAt(structures, obstacles, px, pz, boundaryRadius, mode, airport)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

const tmpM = new THREE.Matrix4();
const tmpW = new THREE.Matrix4();
const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
const tmpInv = new THREE.Matrix4();
const tmpLin = new THREE.Matrix3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/** Meshes that could stand between the camera and the player: visible, solid, not the player's own figure, vehicle,
 *  balloons or name tag. Instanced sets bigger than a city's worth of props are building detail, which the masses cover. */
function gatherBlockers(scene: THREE.Scene, self: THREE.Object3D | null) {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o === self) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const mat = m.material as THREE.Material | THREE.Material[];
      const see = !Array.isArray(mat) && ((mat.transparent && mat.opacity < 0.6) || (mat as { isTroikaTextMaterial?: boolean }).isTroikaTextMaterial);
      const inst = m as THREE.InstancedMesh;
      if (!see && !(inst.isInstancedMesh && inst.count > 1500)) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        out.push(m);
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
  return out;
}

/** Where the segment from `o` along `d` first enters the box, or Infinity. A box the head is already inside (the sky,
 *  the ground, a room you're standing in) doesn't count, and neither does anything smaller than about a person. */
function enters(b: THREE.Box3, o: THREE.Vector3, d: THREE.Vector3) {
  if (b.containsPoint(o)) return Infinity;
  b.getSize(tmpSize);
  if (Math.max(tmpSize.x, tmpSize.y, tmpSize.z) < 1.2) return Infinity;
  let t0 = 0, t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-6) {
      if (o[k] < b.min[k] || o[k] > b.max[k]) return Infinity;
      continue;
    }
    let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Distance from the head to the first thing in the way of the camera, or `max` when the view is clear.
 *  Boxes, not triangles: cheap enough to run a few times a second over the whole city. */
function clearDistance(list: THREE.Mesh[], head: THREE.Vector3, dir: THREE.Vector3, max: number) {
  let best = max;
  for (const m of list) {
    const geo = m.geometry.boundingBox;
    if (!geo) continue;
    const inst = m as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, tmpM);
        tmpW.multiplyMatrices(m.matrixWorld, tmpM);
        best = Math.min(best, enters(tmpBox.copy(geo).applyMatrix4(tmpW), head, dir));
      }
    } else {
      // in the mesh's own frame, so a turned wall or counter (inside a venue that faces the centre) blocks only
      // where it really is, not across its whole world-aligned box
      tmpInv.copy(m.matrixWorld).invert();
      tmpO.copy(head).applyMatrix4(tmpInv);
      tmpD.copy(dir).applyMatrix3(tmpLin.setFromMatrix4(tmpInv));
      best = Math.min(best, enters(geo, tmpO, tmpD));
    }
  }
  return best;
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
