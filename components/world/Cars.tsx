'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ASPHALT_TOP, type CityGrid } from '@/lib/world/geometry';
import { prng, hashString } from '@/lib/world/seed';
import { CAR_PARTS, TRAFFIC_MODELS, carMaterial, carParts, carSpec, type CarModel } from './carModels';
import { useWorld } from './store';
import { followerPos } from './Crowd';
import { traffic } from '@/lib/audio/state';
import { sfx } from '@/lib/audio/sfx';

// Ambient traffic: detailed low-poly cars following the road grid on the right-hand lane. At each intersection a car
// goes straight or turns (curving through the junction), and it slows behind the car ahead in its lane.
// With `player`, cars also brake for the player standing in their path and honk at them.
// Count comes from followers_count; models, colours and starting spots are seeded by the handle.
// One instanced mesh per (model, material), so the whole fleet is a few dozen draw calls.

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();
// headings: +x, +z, -x, -z
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const LANE = 1.75; // lane centre from the road centreline
const GAP = 3; // bumper-to-bumper distance cars keep
const PLAYER_GAP = 1; // room left between a bumper and the player
const PLAYER_HALF = 1.4; // how far either side of a car's centreline counts as in its path
const HONK_EVERY = 3500; // ms between honks

type Car = {
  model: CarModel;
  slot: number; // index within its model's instanced meshes
  color: string;
  len: number;
  cruise: number;
  speed: number;
  // the road node (a, b) the car is heading towards, the heading d it arrives with, and the heading it leaves with
  a: number;
  b: number;
  d: number;
  next: number;
  phase: 0 | 1; // 0 = on the straight before the node, 1 = turning through it
  s: number; // distance along the straight, or 0..1 through the turn
  x: number;
  z: number;
  rot: number;
  rnd: () => number;
};

export function Cars({ count: wanted, grid, handle, player = false }: { count: number; grid: CityGrid; handle: string; player?: boolean }) {
  const { K, pitchX, pitchZ, road } = grid;
  // no more cars than the lanes hold with room to move: about one per 12 m of lane
  const nodes = 2 * K + 2;
  const lanes = 2 * 2 * nodes * (nodes - 1);
  const count = Math.min(wanted, Math.floor((lanes * (pitchX + pitchZ - 2 * road)) / 2 / 12));
  // Road centrelines run between blocks at (n + 0.5) * pitch, n in [-K-1, K]; nodes are their crossings.
  const lo = -K - 1, hi = K;
  const nodeX = (n: number) => (n + 0.5) * pitchX, nodeZ = (n: number) => (n + 0.5) * pitchZ;
  const half = road / 2;

  const { cars, byModel } = useMemo(() => {
    const rnd = prng(hashString(handle + '|cars'));
    const total = TRAFFIC_MODELS.reduce((s, m) => s + m.weight, 0);
    const cars: Car[] = [];
    const byModel = new Map<CarModel, Car[]>();
    for (let k = 0; k < count; k++) {
      let w = rnd() * total, pick = TRAFFIC_MODELS[0];
      for (const m of TRAFFIC_MODELS) if ((w -= m.weight) < 0) { pick = m; break; }
      const spec = carSpec(pick.model);
      const list = byModel.get(pick.model) ?? [];
      byModel.set(pick.model, list);
      // start on a random straight, pointing at a node inside the grid
      let a = 0, b = 0, d = 0;
      for (let tries = 0; tries < 20; tries++) {
        a = lo + Math.floor(rnd() * (hi - lo + 1));
        b = lo + Math.floor(rnd() * (hi - lo + 1));
        d = Math.floor(rnd() * 4);
        const pa = a - DX[d], pb = b - DZ[d];
        if (pa >= lo && pa <= hi && pb >= lo && pb <= hi) break;
      }
      const cruise = (6 + rnd() * 4) * pick.speed;
      const carRnd = prng(hashString(`${handle}|car|${k}`));
      const car: Car = {
        model: pick.model, slot: list.length, color: spec.colors[Math.floor(rnd() * spec.colors.length)], len: spec.L,
        cruise, speed: cruise, a, b, d, next: d, phase: 0, s: rnd() * straightLen(d), x: 0, z: 0, rot: 0, rnd: carRnd,
      };
      car.next = chooseNext(car);
      list.push(car);
      cars.push(car);
    }
    return { cars, byModel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, K, pitchX, pitchZ, road, handle]);

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
    const nx = nodeX(c.a), nz = nodeZ(c.b);
    const d = c.d;
    if (c.phase === 0) {
      const back = half + straightLen(d) - c.s; // distance short of the node centre
      c.x = nx - DX[d] * back - DZ[d] * LANE;
      c.z = nz - DZ[d] * back + DX[d] * LANE;
      c.rot = Math.atan2(DX[d], DZ[d]);
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
  }
  function turnLen(c: Car) {
    if (c.next === c.d) return 2 * half;
    const right = c.next === (c.d + 1) % 4; // with +y up and headings +x -> +z, turning to d+1 is a right turn
    return (Math.PI / 2) * (right ? half - LANE : half + LANE);
  }

  const meshes = useRef(new Map<string, THREE.InstancedMesh>());
  const geos = useMemo(() => {
    const out: { key: string; model: CarModel; part: (typeof CAR_PARTS)[number]; geo: THREE.BufferGeometry; mat: THREE.Material; n: number }[] = [];
    for (const [model, list] of byModel) {
      const parts = carParts(model);
      for (const part of CAR_PARTS) {
        const geo = parts[part];
        if (geo) out.push({ key: `${model}|${part}`, model, part, geo, mat: carMaterial(part), n: list.length });
      }
    }
    return out;
  }, [byModel]);
  useEffect(() => () => geos.forEach((g) => g.mat.dispose()), [geos]);
  // engines and passing whooshes (components/audio/WorldSounds.tsx)
  useEffect(() => {
    if (!player) return;
    traffic.set('grid', () => cars);
    return () => void traffic.delete('grid');
  }, [cars, player]);

  useEffect(() => {
    for (const [model, list] of byModel) {
      const m = meshes.current.get(`${model}|paint`);
      if (!m) continue;
      list.forEach((c) => m.setColorAt(c.slot, tmpColor.set(c.color)));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    cars.forEach(place);
    write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, byModel, geos]);

  function write() {
    for (const [model, list] of byModel) {
      for (const part of CAR_PARTS) {
        const m = meshes.current.get(`${model}|${part}`);
        if (!m) continue;
        for (const c of list) {
          tmp.position.set(c.x, ASPHALT_TOP, c.z); // wheels on the asphalt, not in it
          tmp.rotation.set(0, c.rot, 0);
          tmp.updateMatrix();
          m.setMatrixAt(c.slot, tmp.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // Hidden for the first frames so the one-shot baked contact shadow under the city doesn't capture parked cars.
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const lastHonk = useRef(0);
  useFrame((_, delta) => {
    if (group.current && !group.current.visible && ++frames.current > 2) group.current.visible = true;
    const dt = Math.min(delta, 0.1);
    const st = player ? useWorld.getState() : null;
    const me = st?.playerPos ?? null;
    const onTrip = !!st?.trip;
    // `as`: assigned inside check() below, which TypeScript can't see
    let honk = null as Car | null;
    // car following: on a straight, the nearest car ahead heading for the same node in the same lane
    for (const c of cars) {
      let target = c.cruise;
      if (c.phase === 0) {
        let gap = Infinity;
        for (const o of cars) {
          if (o === c || o.a !== c.a || o.b !== c.b || o.d !== c.d) continue;
          const ahead = o.phase === 1 ? straightLen(c.d) + o.s * turnLen(o) - c.s : o.s - c.s;
          if (ahead > 0 && ahead < gap) gap = ahead - (o.len + c.len) / 2;
        }
        if (gap < GAP) target = 0;
        else if (gap < GAP + 8) target = Math.min(target, ((gap - GAP) / 8) * c.cruise);
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
      c.speed += (target - c.speed) * Math.min(1, dt * 4);
    }
    if (honk && !onTrip && performance.now() - lastHonk.current > HONK_EVERY) {
      lastHonk.current = performance.now();
      sfx('horn', { at: { x: honk.x, y: 1, z: honk.z } });
    }
    for (const c of cars) {
      let step = c.speed * dt;
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

  if (count === 0) return null;
  return (
    <group ref={group} visible={false}>
      {geos.map((g) => (
        <instancedMesh
          key={g.key}
          ref={(m) => {
            if (m) meshes.current.set(g.key, m);
            else meshes.current.delete(g.key);
          }}
          args={[g.geo, g.mat, g.n]}
          castShadow={g.part === 'paint' || g.part === 'glass'}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
