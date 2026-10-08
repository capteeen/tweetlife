'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Block, CityGrid } from '@/lib/world/geometry';
import { surfaceY } from '@/lib/world/ground';
import { themeOf } from '@/lib/world/cityThemes';
import { prng, hashString } from '@/lib/world/seed';
import { CAR_PARTS, TRAFFIC_MODELS, carGeo, carMaterial, carSpec, unitWheel, wheelMaterial, type CarModel, type CarPart } from './carModels';
import { beamGeometry, beamMaterial, lampMaterial, nightOf, tickLamps } from './vehicleLights';
import type { TrafficVehicle } from './vehicleState';
import { useWorld } from './store';
import { followerPos } from './Crowd';
import { traffic } from '@/lib/audio/state';
import { sfx } from '@/lib/audio/sfx';

// Ambient traffic: detailed low-poly cars following the road grid on the right-hand lane. At each intersection a car
// goes straight or turns (curving through the junction, indicator blinking), and it slows behind the car ahead in its lane.
// A dozen more circle the ring road in the country's colours. With `player`, cars also brake for the player (and the
// followers around them) standing in their path, and honk.
// Count comes from followers_count; models, colours and starting spots are seeded by the handle.
// Brake lights come on when a car slows or stands; headlights light the road at night; wheels turn with the speed.
// One instanced mesh per (model, material), and one for every wheel in the fleet, so the whole fleet is a few dozen draw calls.

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpW = new THREE.Matrix4();
const DUST = new THREE.Color('#9C927F');
// headings: +x, +z, -x, -z
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const LANE = 1.75; // lane centre from the road centreline
const GAP = 3; // bumper-to-bumper distance cars keep
const PLAYER_GAP = 1; // room left between a bumper and the player
const PLAYER_HALF = 1.4; // how far either side of a car's centreline counts as in its path
const HONK_EVERY = 3500; // ms between honks
const SIGNAL_AHEAD = 14; // indicate this far before a turn
const RING_CARS = 12;

type Car = TrafficVehicle & {
  /** a bus or truck, for the engine sound */
  big: boolean;
  /** height of the road under the wheels */
  y: number;
  slot: number; // index within its model's instanced meshes
  color: string;
  len: number;
  cruise: number;
  spin: number;
  /** index of this car's first wheel in the fleet's wheel mesh */
  wheel0: number;
  // grid cars: the road node (a, b) the car is heading towards, the heading d it arrives with, and the heading it leaves with
  ring: boolean;
  a: number;
  b: number;
  d: number;
  next: number;
  phase: 0 | 1; // 0 = on the straight before the node, 1 = turning through it
  s: number; // distance along the straight, or 0..1 through the turn
  // ring cars: angle round the ring and direction
  ang: number;
  dir: 1 | -1;
  rnd: () => number;
};

type Props = { count: number; grid: CityGrid; blocks: Block[]; boundaryRadius: number; handle: string; player?: boolean; ring?: number | null; skyT?: number };

export function Cars({ count: wanted, grid, blocks, boundaryRadius, handle, player = false, ring = null, skyT = 0.3 }: Props) {
  const country = useWorld((s) => s.country);
  const ringColors = themeOf(country).traffic;
  const { K, pitchX, pitchZ, road } = grid;
  // no more cars than the lanes hold with room to move: about one per 12 m of lane
  const nodes = 2 * K + 2;
  const lanes = 2 * 2 * nodes * (nodes - 1);
  const count = Math.min(wanted, Math.floor((lanes * (pitchX + pitchZ - 2 * road)) / 2 / 12));
  // Road centrelines run between blocks at (n + 0.5) * pitch, n in [-K-1, K]; nodes are their crossings.
  const lo = -K - 1, hi = K;
  const nodeX = (n: number) => (n + 0.5) * pitchX, nodeZ = (n: number) => (n + 0.5) * pitchZ;
  const half = road / 2;

  const { cars, byModel, wheelCount } = useMemo(() => {
    const rnd = prng(hashString(handle + '|cars'));
    const total = TRAFFIC_MODELS.reduce((s, m) => s + m.weight, 0);
    const cars: Car[] = [];
    const byModel = new Map<CarModel, Car[]>();
    const make = (k: number, isRing: boolean) => {
      let w = rnd() * total, pick = TRAFFIC_MODELS[0];
      for (const m of TRAFFIC_MODELS) if ((w -= m.weight) < 0) { pick = m; break; }
      const spec = carSpec(pick.model);
      const list = byModel.get(pick.model) ?? [];
      byModel.set(pick.model, list);
      const cruise = (6 + rnd() * 4) * pick.speed;
      const car: Car = {
        model: pick.model, slot: list.length, color: spec.colors[Math.floor(rnd() * spec.colors.length)], len: spec.L, big: spec.L > 6, y: 0,
        cruise, speed: cruise, spin: rnd() * 6, wheel0: 0, braking: false, signal: 0, ring: isRing,
        a: 0, b: 0, d: 0, next: 0, phase: 0, s: 0, x: 0, z: 0, rot: 0, ang: rnd() * Math.PI * 2, dir: k % 2 ? 1 : -1,
        rnd: prng(hashString(`${handle}|${isRing ? 'ring' : 'car'}|${k}`)),
      };
      if (!isRing) {
        // start on a random straight, pointing at a node inside the grid
        for (let tries = 0; tries < 20; tries++) {
          car.a = lo + Math.floor(rnd() * (hi - lo + 1));
          car.b = lo + Math.floor(rnd() * (hi - lo + 1));
          car.d = Math.floor(rnd() * 4);
          const pa = car.a - DX[car.d], pb = car.b - DZ[car.d];
          if (pa >= lo && pa <= hi && pb >= lo && pb <= hi) break;
        }
        car.s = rnd() * straightLen(car.d);
        car.next = chooseNext(car);
      }
      // the ring road wears the country's colours (cabs stay yellow)
      if (isRing && pick.model !== 'taxi') car.color = ringColors[k % ringColors.length];
      list.push(car);
      cars.push(car);
    };
    for (let k = 0; k < count; k++) make(k, false);
    if (ring) for (let k = 0; k < RING_CARS; k++) make(k, true);
    let w = 0;
    for (const c of cars) (c.wheel0 = w), (w += carGeo(c.model).wheels.length);
    return { cars, byModel, wheelCount: w };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, K, pitchX, pitchZ, road, handle, ring, ringColors]);

  // engines and passing whooshes (components/audio/WorldSounds.tsx); each car also carries its model, heading,
  // brake and indicator state (TrafficVehicle in vehicleState.ts)
  useEffect(() => {
    if (!player) return;
    traffic.set('grid', () => cars);
    return () => void traffic.delete('grid');
  }, [cars, player]);

  function straightLen(d: number) {
    return (d % 2 === 0 ? pitchX : pitchZ) - 2 * half;
  }
  function chooseNext(c: Car) {
    // straight is likeliest; never a U-turn; never off the grid
    const opts: number[] = [];
    for (const nd of [c.d, c.d, c.d, (c.d + 1) % 4, (c.d + 3) % 4]) {
      const na = c.a + DX[nd], nb = c.b + DZ[nd];
      if (na >= lo && na <= hi && nb >= lo && nb <= hi) opts.push(nd);
    }
    return opts.length ? opts[Math.floor(c.rnd() * opts.length)] : (c.d + 2) % 4;
  }
  // The point a car occupies: lane offset to the right of its heading, (-dz, dx).
  function place(c: Car) {
    if (c.ring) {
      // right-hand traffic: anticlockwise on the inner lane, clockwise on the outer
      const lane = ring! - c.dir * 1.5;
      c.x = Math.cos(c.ang) * lane;
      c.z = Math.sin(c.ang) * lane;
      c.rot = -c.ang + (c.dir > 0 ? 0 : Math.PI);
      c.y = surfaceY(blocks, grid, c.x, c.z, boundaryRadius);
      return;
    }
    const nx = nodeX(c.a), nz = nodeZ(c.b);
    const d = c.d;
    if (c.phase === 0) {
      const back = half + straightLen(d) - c.s; // distance short of the node centre
      c.x = nx - DX[d] * back - DZ[d] * LANE;
      c.z = nz - DZ[d] * back + DX[d] * LANE;
      c.rot = Math.atan2(DX[d], DZ[d]);
      c.y = surfaceY(blocks, grid, c.x, c.z, boundaryRadius);
      return;
    }
    // quadratic curve from the lane entering the junction to the lane leaving it
    const n = c.next, u = c.s;
    const p0x = nx - DX[d] * half - DZ[d] * LANE, p0z = nz - DZ[d] * half + DX[d] * LANE;
    const p2x = nx + DX[n] * half - DZ[n] * LANE, p2z = nz + DZ[n] * half + DX[n] * LANE;
    let p1x: number, p1z: number;
    if (n === d) {
      p1x = (p0x + p2x) / 2; p1z = (p0z + p2z) / 2;
    } else {
      p1x = nx - DZ[d] * LANE - DZ[n] * LANE; p1z = nz + DX[d] * LANE + DX[n] * LANE;
    }
    const iu = 1 - u;
    c.x = iu * iu * p0x + 2 * iu * u * p1x + u * u * p2x;
    c.z = iu * iu * p0z + 2 * iu * u * p1z + u * u * p2z;
    const tx = iu * (p1x - p0x) + u * (p2x - p1x), tz = iu * (p1z - p0z) + u * (p2z - p1z);
    c.rot = Math.atan2(tx, tz);
    c.y = surfaceY(blocks, grid, c.x, c.z, boundaryRadius);
  }
  function turnLen(c: Car) {
    if (c.next === c.d) return 2 * half;
    const right = c.next === (c.d + 1) % 4; // with +y up and headings +x -> +z, turning to d+1 is a right turn
    return (Math.PI / 2) * (right ? half - LANE : half + LANE);
  }

  // Geometry and materials per model: body parts, the lamps (with per-car brake/indicator state), and the wheels.
  const meshes = useRef(new Map<string, THREE.InstancedMesh>());
  const sets = useMemo(() => {
    const out: { key: string; model: CarModel; part: CarPart; geo: THREE.BufferGeometry; mat: THREE.Material; n: number; state?: THREE.InstancedBufferAttribute }[] = [];
    for (const [model, list] of byModel) {
      const g = carGeo(model);
      for (const part of CAR_PARTS) {
        const geo = g.parts[part];
        if (!geo) continue;
        if (part === 'lamp') {
          // a light wrapper sharing the cached attributes, plus this fleet's per-car lamp state
          const lg = new THREE.BufferGeometry();
          for (const [name, attr] of Object.entries(geo.attributes)) lg.setAttribute(name, attr);
          lg.boundingSphere = geo.boundingSphere;
          const state = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2), 2);
          state.setUsage(THREE.DynamicDrawUsage);
          lg.setAttribute('lampState', state);
          out.push({ key: `${model}|lamp`, model, part, geo: lg, mat: lampMaterial(true), n: list.length, state });
        } else {
          out.push({ key: `${model}|${part}`, model, part, geo, mat: carMaterial(part), n: list.length });
        }
      }
    }
    return out;
  }, [byModel]);
  useEffect(() => () => sets.forEach((g) => g.mat.dispose()), [sets]);
  const beamMat = useMemo(() => beamMaterial(), []);
  const wheelMat = useMemo(() => wheelMaterial(), []);
  useEffect(() => () => (beamMat.dispose(), wheelMat.dispose()), [beamMat, wheelMat]);
  const beams = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    for (const [model, list] of byModel) {
      const m = meshes.current.get(`${model}|paint`);
      if (!m) continue;
      // a touch of wear: no two cars quite the same shade, and some of them could do with a wash
      list.forEach((c) => {
        const r = prng(hashString(`${handle}|paint|${c.slot}|${model}`));
        tmpColor.set(c.color).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.06);
        if (r() < 0.3) tmpColor.lerp(DUST, 0.12 + r() * 0.1);
        m.setColorAt(c.slot, tmpColor);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    cars.forEach(place);
    write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, byModel, sets]);

  function write() {
    for (const [model, list] of byModel) {
      const g = carGeo(model);
      for (const part of CAR_PARTS) {
        const m = meshes.current.get(`${model}|${part}`);
        if (!m) continue;
        for (const c of list) {
          tmp.position.set(c.x, c.y, c.z);
          tmp.rotation.set(0, c.rot, 0);
          tmp.updateMatrix();
          m.setMatrixAt(c.slot, tmp.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
      const set = sets.find((s) => s.key === `${model}|lamp`);
      if (set?.state) {
        for (const c of list) set.state.setXY(c.slot, c.braking ? 1 : 0, c.signal);
        set.state.needsUpdate = true;
      }
      const wm = wheels.current;
      if (wm) {
        for (const c of list) {
          tmp.position.set(c.x, c.y, c.z);
          tmp.rotation.set(0, c.rot, 0);
          tmp.updateMatrix();
          tmpM.copy(tmp.matrix);
          g.wheels.forEach((w, i) => {
            tmp.position.set(w.x, w.y, w.z);
            tmp.rotation.set(w.flip ? -c.spin : c.spin, w.flip ? Math.PI : 0, 0, 'YXZ');
            tmp.scale.set(...g.wheelScale);
            tmp.updateMatrix();
            wm.setMatrixAt(c.wheel0 + i, tmpW.multiplyMatrices(tmpM, tmp.matrix));
          });
          tmp.scale.set(1, 1, 1);
          tmp.rotation.order = 'XYZ';
        }
      }
    }
    if (wheels.current) wheels.current.instanceMatrix.needsUpdate = true;
    const b = beams.current;
    if (b && b.visible) {
      cars.forEach((c, i) => {
        const spec = carSpec(c.model);
        tmp.position.set(c.x, c.y, c.z);
        tmp.rotation.set(0, c.rot, 0, 'XYZ');
        tmp.updateMatrix();
        tmpM.copy(tmp.matrix);
        tmp.position.set(0, 0.07, spec.L / 2 + 0.1);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(spec.W * 1.5, 1, 9);
        tmp.updateMatrix();
        b.setMatrixAt(i, tmpW.multiplyMatrices(tmpM, tmp.matrix));
        tmp.scale.set(1, 1, 1);
      });
      b.instanceMatrix.needsUpdate = true;
    }
  }

  // Hidden for the first frames so the one-shot baked contact shadow under the city doesn't capture parked cars.
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const lastHonk = useRef(0);
  const night = nightOf(skyT);
  useFrame((_, delta) => {
    if (group.current && !group.current.visible && ++frames.current > 2) group.current.visible = true;
    tickLamps(night);
    if (beams.current) beams.current.visible = night > 0.05;
    beamMat.opacity = 0.42 * night;
    const dt = Math.min(delta, 0.1);
    const st = player ? useWorld.getState() : null;
    const me = st?.playerPos ?? null;
    const onTrip = !!st?.trip;
    const meR = me ? Math.hypot(me.x, me.z) : 0, meA = me ? Math.atan2(me.z, me.x) : 0;
    // `as`: assigned inside check() below, which TypeScript can't see
    let honk = null as Car | null;
    for (const c of cars) {
      let target = c.cruise;
      if (c.ring) {
        // brake for the player standing in the lane ahead
        const lane = ring! - c.dir * 1.5;
        if (me && Math.abs(meR - lane) < 1.4) {
          let da = (meA - c.ang) * c.dir;
          da -= Math.PI * 2 * Math.floor(da / (Math.PI * 2));
          const gap = da * lane - c.len / 2 - PLAYER_GAP;
          if (gap < 10) target = gap < 0.5 ? 0 : Math.min(target, (gap / 10) * c.cruise);
        }
      } else {
        // car following: on a straight, the nearest car ahead heading for the same node in the same lane
        if (c.phase === 0) {
          let gap = Infinity;
          for (const o of cars) {
            if (o === c || o.ring || o.a !== c.a || o.b !== c.b || o.d !== c.d) continue;
            const ahead = o.phase === 1 ? straightLen(c.d) + o.s * turnLen(o) - c.s : o.s - c.s;
            if (ahead > 0 && ahead < gap) gap = ahead - (o.len + c.len) / 2;
          }
          if (gap < GAP) target = 0;
          else if (gap < GAP + 8) target = Math.min(target, ((gap - GAP) / 8) * c.cruise);
          // ease off into a turn
          if (c.next !== c.d && straightLen(c.d) - c.s < 8) target = Math.min(target, c.cruise * 0.6);
        }
        if (me) {
          // the player (or a follower in their crowd) in front of the bumper and within the car's width: ease off,
          // then stop short of them
          const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
          const check = (p: { x: number; z: number }, isMe: boolean) => {
            const rx = p.x - c.x, rz = p.z - c.z;
            const ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
            const gap = ahead - c.len / 2 - PLAYER_GAP;
            if (ahead > 0 && side < PLAYER_HALF && gap < 10) {
              target = gap < 0.5 ? 0 : Math.min(target, (gap / 10) * c.cruise);
              if (gap < 6 && isMe) honk = c;
            }
          };
          check(me, true);
          for (const p of followerPos.values()) check(p, false);
        }
        // indicate before a turn and through it
        const turning = c.next !== c.d && (c.phase === 1 || straightLen(c.d) - c.s < SIGNAL_AHEAD);
        c.signal = turning ? (c.next === (c.d + 1) % 4 ? 1 : -1) : 0;
      }
      c.braking = target < c.speed - 0.4 || c.speed < 0.5;
      c.speed += (target - c.speed) * Math.min(1, dt * 4);
    }
    if (honk && !onTrip && performance.now() - lastHonk.current > HONK_EVERY) {
      lastHonk.current = performance.now();
      sfx('horn', { at: { x: honk.x, y: 1, z: honk.z } });
    }
    for (const c of cars) {
      let step = c.speed * dt;
      c.spin += step / carSpec(c.model).wheelR;
      if (c.ring) {
        c.ang += (step * c.dir) / (ring! - c.dir * 1.5);
        place(c);
        continue;
      }
      while (step > 0) {
        if (c.phase === 0) {
          const L = straightLen(c.d);
          if (c.s + step < L) { c.s += step; step = 0; }
          else { step -= L - c.s; c.phase = 1; c.s = 0; }
        } else {
          const T = turnLen(c);
          if (c.s + step / T < 1) { c.s += step / T; step = 0; }
          else {
            step -= (1 - c.s) * T;
            c.d = c.next; c.a += DX[c.d]; c.b += DZ[c.d];
            c.phase = 0; c.s = 0;
            c.next = chooseNext(c);
          }
        }
      }
      place(c);
    }
    write();
  });

  if (cars.length === 0) return null;
  return (
    <group ref={group} visible={false}>
      {sets.map((g) => (
        <instancedMesh
          key={g.key}
          ref={(m) => {
            if (m) meshes.current.set(g.key, m);
            else meshes.current.delete(g.key);
          }}
          args={[g.geo, g.mat, g.n]}
          castShadow={g.part === 'paint'}
          frustumCulled={false}
        />
      ))}
      <instancedMesh ref={wheels} args={[unitWheel(), wheelMat, wheelCount]} frustumCulled={false} />
      <instancedMesh ref={beams} args={[beamGeometry(), beamMat, cars.length]} frustumCulled={false} visible={false} renderOrder={1} />
    </group>
  );
}
