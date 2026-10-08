'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { Figure, lookFor } from '@/components/world/Figure';
import { CAR_PARTS, carMaterial, carParts } from '@/components/world/carModels';
import type { FigureAct } from '@/components/world/figureMoves';
import { prng } from '@/lib/world/seed';
import { BubbleBuilding, Clouds, Coin, FlyingPlane, IslandBase, RingSlab, TreeField, Windows, type FlightPose } from './welcomeBits';
import {
  BENCHES, BUILDINGS, BUS_STOP, CAR_LANES, CROSSINGS, CROSSING_HALF, FOUNTAIN, IDLERS, INNER_TREES, ISLAND_R, K, LAMPS_IN, LAMPS_OUT,
  LANE_SPLIT, OUTER_TREES, OUTER_WALK_OUT, PLAZA_R, ROAD_IN, ROAD_OUT, SHELTER, WAIT_IN_R, angleDiff, polar,
} from './welcomeLayout';
import { carPose, createSim, crosserPose, stepSim, walkAmountFor, walkerPose, type Car as SimCar } from './welcomeSim';

// The welcome page's backdrop: a little city on a floating speech-bubble island, in the brand style (white
// bubble-buildings with glowing yellow windows on sky blue). Cars keep right and stop for people at the zebra
// crossings, the bus pulls in at its stop, people stroll the plaza with coin balloons on strings, a plane circles
// with a contrail, and the camera slowly orbits. Traffic and people come from a small simulation
// (welcomeSim.ts, checked by scripts/check-welcome-scene.ts) so nobody walks through anybody. Everything is
// generated here (no models or textures to download).

const SKY_BLUE = '#3BA9F5';
const ROAD = '#5D6676';
const PAVEMENT = '#EEF1F5';
const PAVE = 0.1; // pavements stand this far above the road
const ROAD_Y = 0.03;
const AWNINGS = ['#2F8FEA', '#FF6B6B', '#FFC83D', '#35C28A', '#7C5CFF'];

/** shared with the plane, so it flies higher on the near side and never blocks the city */
const view = { azimuth: 0, aspect: 1.6 };

export function WelcomeScene({ paused, onReady, reducedMotion }: { paused: boolean; onReady: () => void; reducedMotion: boolean }) {
  return (
    <Canvas
      flat
      shadows
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 35, near: 1, far: 500, position: [0, 20, 48] }}
      onCreated={() => requestAnimationFrame(() => requestAnimationFrame(onReady))}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <hemisphereLight args={['#EAF6FF', '#9CCB8E', 1.9]} />
      <directionalLight
        position={[16, 30, 12]}
        intensity={1.9}
        color="#FFF6E4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-21}
        shadow-camera-right={21}
        shadow-camera-top={21}
        shadow-camera-bottom={-21}
        shadow-bias={-0.0008}
      />
      <CameraRig reducedMotion={reducedMotion} />
      <group position={[0, -2, 0]}>
        <IslandBase r={ISLAND_R} />
        <Streets />
        {BUILDINGS.map((b, i) => (
          <BubbleBuilding key={i} b={b} awning={AWNINGS[i % AWNINGS.length]} />
        ))}
        <Windows blocks={BUILDINGS} />
        <TreeField spots={TREES} />
        <Lamps />
        <Benches />
        <Fountain />
        <BusShelter />
        <Town />
        <Idlers />
        <Floaters />
        <Birds />
      </group>
      <FlyingPlane fly={circling} tint="#1D9BF0" scale={0.48} />
      <Clouds />
    </Canvas>
  );
}

// The canvas takes no pointer events (so the page scrolls over it on phones); the camera leans toward the
// mouse from a window listener instead.
const pointer = { x: 0, y: 0 };

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, []);
  const cam = camera as THREE.PerspectiveCamera;
  const look = useMemo(() => new THREE.Vector3(), []);
  const smooth = useRef({ x: 0, y: 0, t: 0 });
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    cam.fov = aspect < 0.9 ? 48 : 34;
    // desktop: the city sits to the right of the headline; phone: centred, a little low, between headline and buttons
    if (aspect >= 1.15) cam.setViewOffset(size.width, size.height, -size.width * 0.23, 0, size.width, size.height);
    else cam.setViewOffset(size.width, size.height, 0, -size.height * 0.02, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [cam, size.width, size.height]);
  useFrame((_, dt) => {
    const aspect = size.width / size.height;
    const s = smooth.current;
    s.t += Math.min(dt, 0.1);
    s.x += (pointer.x - s.x) * 0.04;
    s.y += (pointer.y - s.y) * 0.04;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // keep about 35 units of the island across the screen on desktop, about 27 on a phone
    const fit = aspect >= 0.9 ? 66 : 13.5 / (tanHalf * aspect);
    const a = 0.6 + s.t * (reducedMotion ? 0 : 0.045) + s.x * 0.12;
    view.azimuth = a;
    view.aspect = aspect;
    const elev = 0.5 + s.y * 0.04;
    cam.position.set(Math.sin(a) * fit * Math.cos(elev), fit * Math.sin(elev), Math.cos(a) * fit * Math.cos(elev));
    look.set(0, aspect >= 0.9 ? -0.6 : 0.4, 0);
    cam.lookAt(look);
  });
  return null;
}

/**
 * The plane's loop: round the island against the camera's turn, banking into the turn. It climbs out of
 * the top of the frame as it passes the camera and comes down lower behind the city, so it is never a big
 * shape in front of everything. Phones show more sky, so there it climbs higher.
 */
function circling(t: number): FlightPose {
  const R = 26, w = -0.16;
  const a = 5.3 + t * w; // starts out to one side, then passes low behind the city
  const swing = view.aspect < 0.9 ? 12 : 8;
  const base = view.aspect < 0.9 ? 19 : 17;
  const y = base + swing * Math.cos(a - view.azimuth);
  const climb = -swing * Math.sin(a - view.azimuth) * (w - 0.045); // dy/dt, with the camera's own turn
  return { x: Math.sin(a) * R, y, z: Math.cos(a) * R, heading: a - Math.PI / 2, pitch: -Math.atan2(climb, R * Math.abs(w)), bank: 0.32 };
}

const TREES = [
  ...INNER_TREES.map(([x, z], i) => ({ x, z, s: 0.65 + ((i * 37) % 10) / 40, tint: ((i * 53) % 10) / 10 })),
  ...OUTER_TREES,
];

/** Pavements, road, lane markings, zebra crossings and paths into the plaza. */
function Streets() {
  const marks = useMemo(() => {
    const out: { x: number; z: number; rot: number; w: number; d: number; color: 0 | 1 }[] = [];
    const nearCrossing = (a: number, r: number, gap: number) => CROSSINGS.some((c) => Math.abs(angleDiff(a, c)) * r < gap);
    // the yellow centre line, dashed, broken at the crossings
    const n = 56;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (nearCrossing(a, LANE_SPLIT, CROSSING_HALF + 1.6)) continue;
      out.push({ ...polar(a, LANE_SPLIT), rot: a, w: 0.1, d: 0.62, color: 1 });
    }
    // zebra bars run along the road, side by side across it
    for (const at of CROSSINGS) {
      for (let r = ROAD_IN + 0.35; r < ROAD_OUT - 0.2; r += 0.62) out.push({ ...polar(at, r), rot: at, w: 0.32, d: CROSSING_HALF * 2, color: 0 });
      // a stop line before the crossing in each lane, on the side the traffic comes from
      for (const lane of CAR_LANES) {
        const a = at - (lane.dir * (CROSSING_HALF + 0.35)) / lane.r;
        out.push({ ...polar(a, lane.r), rot: a + Math.PI / 2, w: 0.14, d: 1.75, color: 0 });
      }
    }
    return out;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    marks.forEach((k, i) => {
      o.position.set(k.x, ROAD_Y + 0.006, k.z);
      o.rotation.set(0, k.rot + Math.PI / 2, 0); // box depth (z) along the road
      o.scale.set(k.w, 1, k.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(k.color ? '#FFD23F' : '#FFFFFF'));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [marks]);
  return (
    <group>
      <RingSlab inner={ROAD_IN} outer={ROAD_OUT} h={ROAD_Y} color={ROAD} />
      <RingSlab inner={PLAZA_R} outer={ROAD_IN} h={PAVE} color={PAVEMENT} />
      <RingSlab inner={ROAD_OUT} outer={OUTER_WALK_OUT} h={PAVE} color={PAVEMENT} />
      {/* white edge lines along both kerbs */}
      {[ROAD_IN + 0.18, ROAD_OUT - 0.18].map((r) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position-y={ROAD_Y + 0.005}>
          <ringGeometry args={[r - 0.05, r + 0.05, 128]} />
          <meshBasicMaterial color="#F4F6F9" />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, marks.length]}>
        <boxGeometry args={[1, 0.012, 1]} />
        <meshBasicMaterial color="#FFFFFF" />
      </instancedMesh>
      {/* paved paths from each crossing into the plaza, and a square round the fountain */}
      {CROSSINGS.map((at) => {
        const mid = (WAIT_IN_R - 0.6 + PLAZA_R) / 2;
        const p = polar(at, mid);
        return (
          <mesh key={at} position={[p.x, PAVE / 2, p.z]} rotation-y={at} receiveShadow>
            <boxGeometry args={[1.6, PAVE, PLAZA_R - WAIT_IN_R + 0.7]} />
            <meshStandardMaterial color={PAVEMENT} roughness={0.9} />
          </mesh>
        );
      })}
      <mesh position={[FOUNTAIN.x, PAVE / 2, FOUNTAIN.z]} receiveShadow>
        <cylinderGeometry args={[2.0, 2.0, PAVE, 40]} />
        <meshStandardMaterial color={PAVEMENT} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Street lamps along both pavements: a pole and a warm glowing globe. */
function Lamps() {
  const spots = useMemo(() => [...LAMPS_IN, ...LAMPS_OUT].map((l) => polar(l.a, l.r)), []);
  const poles = useRef<THREE.InstancedMesh>(null);
  const globes = useRef<THREE.InstancedMesh>(null);
  const poleGeo = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.045, 0.06, 2.3, 6).translate(0, 1.15, 0);
    const foot = new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8).translate(0, 0.08, 0);
    const cap = new THREE.CylinderGeometry(0.16, 0.05, 0.1, 8).translate(0, 2.55, 0);
    return mergeGeometries([pole, foot, cap])!;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      o.position.set(p.x, PAVE, p.z);
      o.updateMatrix();
      poles.current!.setMatrixAt(i, o.matrix);
      o.position.set(p.x, PAVE + 2.42, p.z);
      o.updateMatrix();
      globes.current!.setMatrixAt(i, o.matrix);
    });
    poles.current!.instanceMatrix.needsUpdate = true;
    globes.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={poles} args={[poleGeo, undefined, spots.length]} castShadow>
        <meshStandardMaterial color="#5B6B80" roughness={0.5} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={globes} args={[undefined, undefined, spots.length]}>
        <sphereGeometry args={[0.15, 12, 8]} />
        <meshStandardMaterial color="#FFF3C8" emissive="#FFE08A" emissiveIntensity={0.9} />
      </instancedMesh>
    </group>
  );
}

/** Park benches on the outer pavement, facing the road. */
function Benches() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const parts = [
      new THREE.BoxGeometry(1.1, 0.07, 0.36).translate(0, 0.4, 0),
      new THREE.BoxGeometry(1.1, 0.3, 0.06).translate(0, 0.62, -0.17),
      ...[-0.45, 0.45].map((x) => new THREE.BoxGeometry(0.06, 0.4, 0.34).translate(x, 0.2, 0)),
    ];
    return mergeGeometries(parts)!;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    BENCHES.forEach((b, i) => {
      const p = polar(b.a, b.r);
      o.position.set(p.x, PAVE, p.z);
      o.rotation.set(0, b.a + Math.PI, 0);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, BENCHES.length]} castShadow>
      <meshStandardMaterial color="#C98B5A" roughness={0.8} />
    </instancedMesh>
  );
}

/** A round fountain with water arcing out of the top bowl. */
function Fountain() {
  const drops = useRef<THREE.InstancedMesh>(null);
  const N = 18;
  const t = useRef(0);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.1);
    const m = drops.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const u = (t.current * 0.9 + (i % 3) / 3) % 1;
      const a = (i / N) * Math.PI * 2;
      const r = 0.25 + u * 0.42;
      o.position.set(Math.sin(a) * r, 1.12 + 0.55 * u - 0.9 * u * u, Math.cos(a) * r);
      o.scale.setScalar(0.05 + 0.02 * (1 - u));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[FOUNTAIN.x, PAVE, FOUNTAIN.z]}>
      <mesh position-y={0.2} castShadow receiveShadow>
        <cylinderGeometry args={[FOUNTAIN.r, FOUNTAIN.r + 0.06, 0.4, 32]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
      <mesh position-y={0.401} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[FOUNTAIN.r - 0.1, 32]} />
        <meshStandardMaterial color="#6CC4FA" emissive="#3BA9F5" emissiveIntensity={0.35} roughness={0.15} />
      </mesh>
      <mesh position-y={0.7}>
        <cylinderGeometry args={[0.1, 0.14, 0.7, 10]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
      <mesh position-y={1.08}>
        <cylinderGeometry args={[0.3, 0.12, 0.14, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
      <instancedMesh ref={drops} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#BFE6FF" emissive="#8FD3FF" emissiveIntensity={0.5} />
      </instancedMesh>
    </group>
  );
}

/** The bus stop: a glass shelter with a bench and a sign. */
function BusShelter() {
  const glass = <meshStandardMaterial color="#BFE3FF" transparent opacity={0.45} roughness={0.1} />;
  const frame = <meshStandardMaterial color="#5B6B80" roughness={0.5} metalness={0.4} />;
  const sign = polar(BUS_STOP + 0.04, 14.25);
  return (
    <group>
      <group position={[SHELTER.x, PAVE, SHELTER.z]} rotation-y={SHELTER.rot}>
        {/* the open side faces the road (+z) */}
        <mesh position={[0, 1.95, 0]} castShadow>
          <boxGeometry args={[SHELTER.w + 0.2, 0.08, SHELTER.d + 0.3]} />
          <meshStandardMaterial color="#2F8FEA" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.05, -SHELTER.d / 2]}>
          <boxGeometry args={[SHELTER.w, 1.5, 0.04]} />
          {glass}
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[(s * SHELTER.w) / 2, 0.98, -SHELTER.d / 2]}>
              <boxGeometry args={[0.07, 1.95, 0.07]} />
              {frame}
            </mesh>
            <mesh position={[(s * SHELTER.w) / 2, 1.05, 0]}>
              <boxGeometry args={[0.04, 1.5, SHELTER.d]} />
              {glass}
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.42, -SHELTER.d / 2 + 0.2]}>
          <boxGeometry args={[SHELTER.w - 0.3, 0.07, 0.32]} />
          <meshStandardMaterial color="#C98B5A" roughness={0.8} />
        </mesh>
      </group>
      <group position={[sign.x, PAVE, sign.z]} rotation-y={BUS_STOP + Math.PI}>
        <mesh position-y={1.1}>
          <cylinderGeometry args={[0.035, 0.035, 2.2, 6]} />
          {frame}
        </mesh>
        <mesh position-y={2.05}>
          <boxGeometry args={[0.42, 0.42, 0.05]} />
          <meshStandardMaterial color="#2F8FEA" emissive="#2F8FEA" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 2.05, 0.03]}>
          <boxGeometry args={[0.24, 0.16, 0.02]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>
    </group>
  );
}

function Vehicle({ car, tail }: { car: SimCar; tail: THREE.Material }) {
  const parts = useMemo(() => carParts(car.model), [car.model]);
  const mats = useMemo(() => Object.fromEntries(CAR_PARTS.map((p) => [p, p === 'tail' ? tail : carMaterial(p, car.paint)])), [car.paint, tail]);
  return (
    <group>
      {CAR_PARTS.map((p) => (parts[p] ? <mesh key={p} geometry={parts[p]!} material={mats[p]} castShadow={p === 'paint'} /> : null))}
    </group>
  );
}

const STRING = 1.15; // balloon string length
const COIN_R = 0.26;

type Balloon = { p: THREE.Vector3; v: THREE.Vector3; ready: boolean; seed: number };

/**
 * The traffic and the people walking: steps the simulation, poses cars and figures from it, and flies the coin
 * balloons. A balloon is a point pulled up by its gas and pushed by the breeze and air drag, held by a string
 * of fixed length tied to the walker's right hand, so it trails behind when they walk and bobs when they stop.
 */
function Town() {
  const sim = useMemo(() => createSim(), []);
  const cars = useRef<(THREE.Group | null)[]>([]);
  const tails = useMemo(() => sim.cars.map(() => carMaterial('tail') as THREE.MeshStandardMaterial), [sim]);
  const people = useMemo(() => [...sim.walkers.map((w) => ({ seed: w.seed, balloon: w.balloon })), ...sim.crossers.map((c) => ({ seed: c.seed, balloon: false }))], [sim]);
  const heights = useMemo(
    () =>
      people.map((p) => {
        const look = lookFor(p.seed);
        return look.height * (look.body === 'female' ? 0.96 : 1);
      }),
    [people],
  );
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const hands = useMemo(() => people.map(() => ({ current: null as THREE.Group | null })), [people]);
  const speeds = useMemo(() => people.map(() => ({ current: 0 })), [people]);
  const balloons = useMemo<Balloon[]>(() => people.map((_, i) => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), ready: false, seed: i * 1.7 })), [people]);
  const coins = useRef<(THREE.Group | null)[]>([]);
  const strings = useMemo(
    () => people.map(() => new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3)), new THREE.LineBasicMaterial({ color: '#FFFFFF' }))),
    [people],
  );
  const root = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ h: new THREE.Vector3(), d: new THREE.Vector3(), w: new THREE.Vector3(), side: new THREE.Vector3() }), []);
  const clock = useRef({ acc: 0, t: 0 });

  useFrame((_, frameDt) => {
    const dt = Math.min(frameDt, 0.1);
    const c = clock.current;
    c.acc += dt;
    c.t += dt;
    const STEP = 1 / 60;
    while (c.acc >= STEP) (stepSim(sim, STEP), (c.acc -= STEP));

    sim.cars.forEach((car, i) => {
      const g = cars.current[i];
      if (!g) return;
      const p = carPose(car);
      g.position.set(p.x, ROAD_Y, p.z);
      g.rotation.y = p.rot;
      tails[i].emissiveIntensity = car.braking ? 3.4 : 0.8;
    });
    const poses = [...sim.walkers.map(walkerPose), ...sim.crossers.map(crosserPose)];
    const v = [...sim.walkers.map((w) => w.v), ...sim.crossers.map((x) => x.v)];
    poses.forEach((p, i) => {
      const g = bodies.current[i];
      if (!g) return;
      const r = Math.hypot(p.x, p.z);
      // down off the kerb onto the road and back up again (dropped kerbs at the crossings)
      const onRoad = Math.min(1, Math.max(0, Math.min(r - ROAD_IN + 0.15, ROAD_OUT + 0.15 - r) / 0.3));
      g.position.set(p.x, PAVE + (ROAD_Y - PAVE) * onRoad, p.z);
      g.rotation.y = p.rot;
      speeds[i].current = walkAmountFor(v[i], heights[i], K);
    });

    // balloons, after the bodies have moved this frame
    const parent = root.current;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    people.forEach((person, i) => {
      if (!person.balloon) return;
      const hand = hands[i].current;
      const coin = coins.current[i];
      if (!hand || !coin) return;
      const b = balloons[i];
      hand.getWorldPosition(tmp.h);
      parent.worldToLocal(tmp.h);
      if (!b.ready) (b.p.copy(tmp.h).y += STRING), (b.ready = true);
      const sub = 3;
      for (let k = 0; k < sub; k++) {
        const h = dt / sub;
        const s = c.t + b.seed;
        tmp.w.set(Math.sin(s * 0.7) * 0.35 + Math.sin(s * 1.9) * 0.12, 0, Math.cos(s * 0.55) * 0.3);
        // lift, plus drag towards the breeze
        b.v.x += (tmp.w.x - b.v.x) * 1.4 * h;
        b.v.y += (2.6 - b.v.y * 1.4) * h;
        b.v.z += (tmp.w.z - b.v.z) * 1.4 * h;
        b.p.addScaledVector(b.v, h);
        // the string never stretches: pull back onto it and cancel any speed away from the hand
        tmp.d.subVectors(b.p, tmp.h);
        const len = tmp.d.length();
        if (len > STRING) {
          tmp.d.multiplyScalar(1 / len);
          b.p.copy(tmp.h).addScaledVector(tmp.d, STRING);
          const away = b.v.dot(tmp.d);
          if (away > 0) b.v.addScaledVector(tmp.d, -away);
        }
      }
      coin.position.set(b.p.x, b.p.y + COIN_R, b.p.z);
      // the string, with a little sag when it goes slack
      tmp.d.subVectors(b.p, tmp.h);
      const slack = Math.max(0, STRING - tmp.d.length());
      tmp.side.set(tmp.d.z, 0, -tmp.d.x).normalize();
      const pos = strings[i].geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < 8; k++) {
        const u = k / 7;
        const sag = Math.sin(u * Math.PI) * slack * 0.6;
        pos.setXYZ(k, tmp.h.x + tmp.d.x * u + tmp.side.x * sag, tmp.h.y + tmp.d.y * u - sag * 0.5, tmp.h.z + tmp.d.z * u + tmp.side.z * sag);
      }
      pos.needsUpdate = true;
      strings[i].geometry.computeBoundingSphere();
    });
  });

  return (
    <group ref={root}>
      {sim.cars.map((car, i) => (
        <group key={i} ref={(el) => void (cars.current[i] = el)} scale={K}>
          <Vehicle car={car} tail={tails[i]} />
        </group>
      ))}
      {people.map((p, i) => (
        <group key={p.seed} ref={(el) => void (bodies.current[i] = el)} scale={K}>
          <Figure seed={p.seed} speedRef={speeds[i]} handRef={p.balloon ? hands[i] : undefined} />
        </group>
      ))}
      {people.map((p, i) =>
        p.balloon ? (
          <group key={p.seed + '-balloon'}>
            <primitive object={strings[i]} />
            <group ref={(el) => void (coins.current[i] = el)}>
              <Billboard>
                <Coin scale={0.8} />
              </Billboard>
            </group>
          </group>
        ) : null,
      )}
    </group>
  );
}

/** People standing about: one waiting for the bus, two taking a selfie at the fountain. */
function Idlers() {
  const acts = useMemo(() => IDLERS.map((p) => ({ current: p.act as FigureAct | null })), []);
  return (
    <group>
      {IDLERS.map((p, i) => (
        <group key={p.seed} position={[p.x, PAVE, p.z]} rotation-y={p.rot} scale={K}>
          <Figure seed={p.seed} actRef={acts[i]} />
        </group>
      ))}
    </group>
  );
}

const heartGeo = (() => {
  let g: THREE.ExtrudeGeometry | null = null;
  return () => {
    if (g) return g;
    const s = new THREE.Shape();
    s.moveTo(0, -0.35);
    s.bezierCurveTo(-0.05, -0.28, -0.42, -0.05, -0.42, 0.14);
    s.bezierCurveTo(-0.42, 0.34, -0.2, 0.42, 0, 0.24);
    s.bezierCurveTo(0.2, 0.42, 0.42, 0.34, 0.42, 0.14);
    s.bezierCurveTo(0.42, -0.05, 0.05, -0.28, 0, -0.35);
    g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -0.06);
    return g;
  };
})();

/** Likes and coins drifting up off the rooftops, on a loop. */
function Floaters() {
  const items = useMemo(() => {
    const rnd = prng(9);
    return Array.from({ length: 8 }, (_, i) => {
      const b = BUILDINGS[(i * 3) % BUILDINGS.length];
      return { x: b.x + (rnd() - 0.5) * b.w * 0.6, z: b.z + (rnd() - 0.5) * b.d * 0.6, y0: b.h + 0.6, kind: i % 2 === 0 ? 'heart' : 'coin', offset: i * 1.37, period: 6 + rnd() * 3 };
    });
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);
  useFrame(({ camera }, dt) => {
    t.current += Math.min(dt, 0.1);
    const now = t.current;
    items.forEach((it, i) => {
      const g = refs.current[i];
      if (!g) return;
      const k = ((now + it.offset) % it.period) / it.period; // 0..1 through the rise
      g.position.set(it.x + Math.sin((now + i) * 1.4) * 0.25, it.y0 + k * 7, it.z);
      const pop = Math.min(1, k * 6) * (1 - Math.max(0, (k - 0.8) / 0.2));
      g.scale.setScalar(Math.max(0.001, pop) * (it.kind === 'heart' ? 1.1 : 1.4));
      g.quaternion.copy(camera.quaternion); // always face the camera
      if (it.kind === 'coin') g.rotateY(now * 3 + i);
    });
  });
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)}>
          {it.kind === 'heart' ? (
            <mesh geometry={heartGeo()}>
              <meshStandardMaterial color="#FF4F7B" emissive="#FF3D6E" emissiveIntensity={0.35} roughness={0.35} />
            </mesh>
          ) : (
            <Coin />
          )}
        </group>
      ))}
    </group>
  );
}

/** A few birds circling over the city. It is called Tweetlife. */
function Birds() {
  const birds = useMemo(
    () => [
      { r: 9, y: 11.5, speed: 0.32, at: 0 },
      { r: 10.5, y: 12.2, speed: 0.32, at: 0.35 },
      { r: 13, y: 10, speed: -0.26, at: 2.6 },
    ],
    [],
  );
  const refs = useRef<{ g: THREE.Group | null; l: THREE.Mesh | null; r: THREE.Mesh | null }[]>(birds.map(() => ({ g: null, l: null, r: null })));
  const wing = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.18, 0.62, 0, -0.05], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.1);
    const now = t.current;
    birds.forEach((b, i) => {
      const o = refs.current[i];
      if (!o.g) return;
      const a = b.at + now * b.speed;
      o.g.position.set(Math.sin(a) * b.r, b.y + Math.sin(now * 1.3 + i) * 0.4, Math.cos(a) * b.r);
      o.g.rotation.y = a + (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(now * 11 + i * 2) * 0.7;
      if (o.l) o.l.rotation.z = flap;
      if (o.r) o.r.rotation.z = -flap;
    });
  });
  return (
    <group>
      {birds.map((b, i) => (
        <group key={i} ref={(el) => void (refs.current[i].g = el)} scale={0.9}>
          <mesh scale={[0.16, 0.14, 0.34]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#1877D6" roughness={0.6} />
          </mesh>
          <mesh geometry={wing} ref={(el) => void (refs.current[i].l = el)} position={[0.08, 0.02, 0]}>
            <meshStandardMaterial color="#2F8FEA" side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={wing} ref={(el) => void (refs.current[i].r = el)} position={[-0.08, 0.02, 0]} scale={[-1, 1, 1]}>
            <meshStandardMaterial color="#2F8FEA" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.02, 0.36]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.05, 0.12, 6]} />
            <meshStandardMaterial color="#FFB703" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export { SKY_BLUE };
