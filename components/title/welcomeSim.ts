import { BUS_STOP, CAR_LANES, CROSSINGS, CROSSING_HALF, K, PLAZA_R, ROAD_IN, ROAD_OUT, WAIT_IN_R, WAIT_OUT_R, WALK_LANES } from './welcomeLayout';

// Traffic and people on the welcome island, as a small fixed-step simulation with no rendering in it
// (scripts/check-welcome-scene.ts runs it for minutes and checks nothing ever overlaps).
// - Cars keep their distance from the car ahead, brake for people on a zebra crossing, and the bus
//   pulls in at its stop.
// - People on the pavement keep their distance too and wait for anyone crossing.
// - People cross only when every car can stop in time, and the pavement at the crossing is clear.
// Positions along a lane are distances (island units) in the lane's own direction of travel.

export type CarModelName = 'sedan' | 'hatch' | 'suv' | 'sport' | 'taxi' | 'van' | 'bus';

// lengths of the game's car models (components/world/carModels.ts), before scaling by K
const CAR_LEN: Record<CarModelName, number> = { sedan: 4.3, hatch: 3.8, suv: 4.6, sport: 4.5, taxi: 4.5, van: 5.0, bus: 9.0 };

export type Car = { model: CarModelName; paint: string; lane: number; pos: number; v: number; vmax: number; len: number; braking: boolean; dwell: number; served: boolean; accel: number };
export type Walker = { seed: string; lane: number; pos: number; v: number; vmax: number; balloon: boolean };
export type Crosser = { seed: string; at: number; state: 'waitOut' | 'in' | 'waitIn' | 'out'; r: number; v: number; vmax: number; timer: number };
export type Sim = { cars: Car[]; walkers: Walker[]; crossers: Crosser[]; t: number; rnd: () => number };

const TAU = Math.PI * 2;
const laneLen = (r: number) => TAU * r;
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** distance forward along a loop of length n from a to b */
const ahead = (a: number, b: number, n: number) => mod(b - a, n);
/** a world angle as a distance along a lane */
export const angleToPos = (a: number, lane: { r: number; dir: number }) => mod(lane.dir * a * lane.r, laneLen(lane.r));
export const posToAngle = (pos: number, lane: { r: number; dir: number }) => (lane.dir * pos) / lane.r;

const CAR_GAP = 1.0; // bumper to bumper
const CAR_BRAKE = 3.5; // comfortable braking, units/s²
const CAR_BRAKE_MAX = 8; // the most a car can brake
const WALK_GAP = 0.45; // between two people, beyond their bodies
export const BODY = 0.2 * (K / 0.75); // a person's radius
const BUS_DWELL = 3;
/** people on the pavement stop with their middle this far before a crossing someone is using */
const WALK_STOP = 1.0;
/** a crossing's pavement is clear when nobody's middle is within this of it */
const PAVEMENT_CLEAR = 0.85;
/** coming in off the road, people check the pavement is clear here and wait if not */
const HOLD_R = ROAD_IN + 0.6;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(): Sim {
  const rnd = rng(11);
  const fleet: { model: CarModelName; paint: string; lane: number; vmax: number }[] = [
    { model: 'bus', paint: '#2F7FE0', lane: 1, vmax: 2.6 },
    { model: 'taxi', paint: '#FFC83D', lane: 1, vmax: 3.6 },
    { model: 'sedan', paint: '#FFFFFF', lane: 1, vmax: 3.4 },
    { model: 'sport', paint: '#7C5CFF', lane: 0, vmax: 4.0 },
    { model: 'hatch', paint: '#FF6B6B', lane: 0, vmax: 3.3 },
    { model: 'van', paint: '#35C28A', lane: 0, vmax: 3.0 },
  ];
  const perLane = [0, 0];
  const cars: Car[] = fleet.map((f) => {
    const lane = CAR_LANES[f.lane];
    const n = fleet.filter((g) => g.lane === f.lane).length;
    const i = perLane[f.lane]++;
    return { ...f, pos: (laneLen(lane.r) * i) / n + 3, v: f.vmax * 0.8, len: CAR_LEN[f.model] * K, braking: false, dwell: 0, served: false, accel: f.model === 'bus' ? 1.3 : 2.2 };
  });
  const people = [
    { seed: 'ape_ade', lane: 1, balloon: true },
    { seed: 'gm.kemi', lane: 0, balloon: true },
    { seed: 'degenqueen', lane: 1, balloon: false },
    { seed: 'wagmi_tunde', lane: 0, balloon: true },
    { seed: 'chioma.sol', lane: 1, balloon: true },
    { seed: 'bags_bayo', lane: 0, balloon: false },
  ];
  const walkers: Walker[] = people.map((p, i) => {
    const lane = WALK_LANES[p.lane];
    return { ...p, pos: (laneLen(lane.r) * Math.floor(i / 2)) / 3 + p.lane * 4, v: 0, vmax: 1.15 + rnd() * 0.35 };
  });
  const crossers: Crosser[] = CROSSINGS.map((at, i) => ({ seed: i ? 'ngmi.nneka' : 'lfg_sam', at, state: i ? 'waitIn' : 'waitOut', r: i ? WAIT_IN_R : WAIT_OUT_R, v: 0, vmax: 1.35, timer: 1 + i * 2 }));
  return { cars, walkers, crossers, t: 0, rnd };
}

/** Is anyone on (or about to step onto) this crossing's road, as far as cars are concerned? */
export const crossingBusyForCars = (c: Crosser) => (c.state === 'out' && c.r < ROAD_OUT + 0.3) || (c.state === 'in' && c.r > ROAD_IN - 0.3);
/** ...and is anyone crossing the plaza pavement, as far as people walking along it are concerned? */
export const crossingBusyForWalkers = (c: Crosser) => (c.state === 'in' && c.r < HOLD_R && c.r > PLAZA_R - 0.5) || (c.state === 'out' && c.r < ROAD_IN + 0.3);

/** Where a car's front is relative to a point on its lane: distance ahead, or negative once passed (within half a lap). */
function frontTo(pos: number, len: number, target: number, n: number) {
  const d = ahead(pos + len / 2, target, n);
  return d > n / 2 ? d - n : d;
}

function carCanClear(sim: Sim, at: number) {
  for (const car of sim.cars) {
    const lane = CAR_LANES[car.lane];
    const n = laneLen(lane.r);
    const cw = angleToPos(at, lane);
    const f = frontTo(car.pos, car.len, cw, n);
    // on the crossing now (front past its near edge, back not yet past its far edge)
    if (f < CROSSING_HALF + 0.3 && f > -(car.len + CROSSING_HALF + 0.3)) return false;
    // approaching: must be able to stop before the line
    if (f > 0 && f < n / 2 && (car.v * car.v) / (2 * CAR_BRAKE_MAX) + 0.3 > f - CROSSING_HALF - 0.4) return false;
  }
  return true;
}

function pavementClear(sim: Sim, at: number) {
  for (const w of sim.walkers) {
    const lane = WALK_LANES[w.lane];
    const n = laneLen(lane.r);
    const d = Math.abs(frontTo(w.pos, 0, angleToPos(at, lane), n));
    if (d < PAVEMENT_CLEAR) return false;
  }
  return true;
}

export function stepSim(sim: Sim, dt: number) {
  sim.t += dt;
  // cars: targets from the state at the start of the step, then move
  const carTargets = sim.cars.map((car) => {
    const lane = CAR_LANES[car.lane];
    const n = laneLen(lane.r);
    let room = Infinity;
    for (const o of sim.cars) {
      if (o === car || o.lane !== car.lane) continue;
      room = Math.min(room, ahead(car.pos, o.pos, n) - (o.len + car.len) / 2 - CAR_GAP);
    }
    for (const c of sim.crossers) {
      if (!crossingBusyForCars(c)) continue;
      const f = frontTo(car.pos, car.len, angleToPos(c.at, lane), n);
      if (f > CROSSING_HALF + 0.05) room = Math.min(room, f - CROSSING_HALF - 0.4);
    }
    if (car.model === 'bus') {
      const f = frontTo(car.pos, car.len, angleToPos(BUS_STOP, lane), n);
      if (f < 0) car.served = false; // passed the stop: next lap it stops again
      else if (!car.served) {
        room = Math.min(room, f - 0.05); // aim a touch short, so it comes to rest rather than creeping past
        if (f < 0.25 && car.v < 0.05) {
          car.dwell += dt;
          if (car.dwell > BUS_DWELL) (car.served = true), (car.dwell = 0);
        }
      }
    }
    return car.dwell > 0 ? 0 : Math.min(car.vmax, Math.sqrt(2 * CAR_BRAKE * Math.max(0, room)));
  });
  sim.cars.forEach((car, i) => {
    const target = carTargets[i];
    const before = car.v;
    car.v = target > car.v ? Math.min(target, car.v + car.accel * dt) : Math.max(target, car.v - CAR_BRAKE_MAX * dt);
    car.braking = car.v < before - 1e-4 || car.v < 0.15;
    car.pos = mod(car.pos + car.v * dt, laneLen(CAR_LANES[car.lane].r));
  });

  // people on the pavement
  const walkTargets = sim.walkers.map((w) => {
    const lane = WALK_LANES[w.lane];
    const n = laneLen(lane.r);
    let room = Infinity;
    for (const o of sim.walkers) {
      if (o === w || o.lane !== w.lane) continue;
      room = Math.min(room, ahead(w.pos, o.pos, n) - 2 * BODY - WALK_GAP);
    }
    for (const c of sim.crossers) {
      if (!crossingBusyForWalkers(c)) continue;
      // only if not already stepping across it (then carry on through)
      const f = frontTo(w.pos, 2 * BODY, angleToPos(c.at, lane), n);
      if (f > 0.5) room = Math.min(room, f - (WALK_STOP - BODY));
    }
    return Math.min(w.vmax, Math.sqrt(2 * 3 * Math.max(0, room)));
  });
  sim.walkers.forEach((w, i) => {
    const target = walkTargets[i];
    w.v = target > w.v ? Math.min(target, w.v + 1.5 * dt) : Math.max(target, w.v - 6 * dt);
    w.pos = mod(w.pos + w.v * dt, laneLen(WALK_LANES[w.lane].r));
  });

  // people crossing
  for (const c of sim.crossers) {
    if (c.state === 'waitOut' || c.state === 'waitIn') {
      c.v = 0;
      c.timer -= dt;
      const outbound = c.state === 'waitIn';
      if (c.timer <= 0 && carCanClear(sim, c.at) && (!outbound || pavementClear(sim, c.at))) c.state = outbound ? 'out' : 'in';
      continue;
    }
    c.v = Math.min(c.vmax, c.v + 2 * dt);
    if (c.state === 'in') {
      // off the road onto the plaza pavement only once nobody is walking past there
      if (c.r >= HOLD_R && c.r - c.v * dt < HOLD_R && !pavementClear(sim, c.at)) {
        (c.r = HOLD_R), (c.v = 0);
        continue;
      }
      c.r -= c.v * dt;
      if (c.r <= WAIT_IN_R) (c.r = WAIT_IN_R), (c.state = 'waitIn'), (c.timer = 3 + sim.rnd() * 4);
    } else {
      c.r += c.v * dt;
      if (c.r >= WAIT_OUT_R) (c.r = WAIT_OUT_R), (c.state = 'waitOut'), (c.timer = 3 + sim.rnd() * 4);
    }
  }
}

/** Where a car is and which way it faces (its model looks down +z). */
export function carPose(car: Car) {
  const lane = CAR_LANES[car.lane];
  const a = posToAngle(car.pos, lane);
  return { x: Math.sin(a) * lane.r, z: Math.cos(a) * lane.r, rot: a + (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) };
}
export function walkerPose(w: Walker) {
  const lane = WALK_LANES[w.lane];
  const a = posToAngle(w.pos, lane);
  return { x: Math.sin(a) * lane.r, z: Math.cos(a) * lane.r, rot: a + (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) };
}
export function crosserPose(c: Crosser) {
  // facing along the crossing: in towards the plaza, or out towards the road; waiting, facing where they'll go next
  const inward = c.state === 'in' || c.state === 'waitOut';
  return { x: Math.sin(c.at) * c.r, z: Math.cos(c.at) * c.r, rot: c.at + (inward ? Math.PI : 0) };
}

/**
 * How fast a figure's feet carry it at walk amount s (0..1), so the body moves exactly as fast as the steps
 * (no sliding). Mirrors Figure.tsx: legs swing ±0.6·s rad at (6 + 4s) rad/s, leg length 0.82·height.
 */
export function strideSpeed(s: number, height: number, scale: number) {
  const leg = 0.82 * height;
  return ((2 * leg * Math.sin(0.6 * s) * (6 + 4 * s)) / Math.PI) * scale;
}
/** The walk amount whose steps match speed v (0 when standing). */
export function walkAmountFor(v: number, height: number, scale: number) {
  if (v < 0.03) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (strideSpeed(mid, height, scale) < v) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
