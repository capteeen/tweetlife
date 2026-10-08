// Checks the welcome page's little city for things that would look wrong: cars hanging over the pavement or
// overlapping, people walking through each other or through cars, things placed inside buildings, and traffic
// that jams for good. Runs the scene's simulation for ten minutes without a browser.
//   npx tsx scripts/check-welcome-scene.ts
import * as L from '../components/title/welcomeLayout';
import { BODY, angleToPos, carPose, createSim, crosserPose, crossingBusyForCars, stepSim, strideSpeed, walkAmountFor, walkerPose, type Car } from '../components/title/welcomeSim';

const CAR_W: Record<string, number> = { sedan: 1.8, hatch: 1.74, suv: 1.95, sport: 1.95, taxi: 1.85, van: 2.0, bus: 2.45 };
const fails: string[] = [];
const fail = (msg: string) => fails.length < 40 && fails.push(msg);
const TAU = Math.PI * 2;

// ---- the floor plan ----
const sim0 = createSim();
const laneCars = (lane: number) => sim0.cars.filter((c) => c.lane === lane);
const halfW = (c: Car) => (CAR_W[c.model] * L.K) / 2;
const outerCorner = (c: Car) => Math.hypot(L.CAR_LANES[c.lane].r + halfW(c), c.len / 2);
for (const c of sim0.cars) {
  const r = L.CAR_LANES[c.lane].r;
  if (r - halfW(c) < L.ROAD_IN + 0.05) fail(`${c.model} hangs over the plaza kerb`);
  if (outerCorner(c) > L.ROAD_OUT - 0.02) fail(`${c.model} corners swing over the outer kerb (${outerCorner(c).toFixed(2)})`);
}
const innerReach = Math.max(...laneCars(0).map(outerCorner));
const outerReach = Math.min(...laneCars(1).map((c) => L.CAR_LANES[1].r - halfW(c)));
if (outerReach - innerReach < 0.05) fail(`cars in the two lanes can touch (${(outerReach - innerReach).toFixed(2)})`);

for (const [i, b] of L.BUILDINGS.entries()) {
  const reach = Math.hypot(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2);
  if (Math.hypot(b.x, b.z) + Math.hypot(b.w, b.d) / 2 > L.PLAZA_R - 0.3 && reach > L.PLAZA_R - 0.3) fail(`building ${i} reaches the pavement`);
}
const near = (x: number, z: number, x2: number, z2: number) => Math.hypot(x - x2, z - z2);
for (const [x, z] of L.INNER_TREES) {
  if (L.clearOfBuildings(x, z) < 0.6) fail(`tree at ${x},${z} is in a building`);
  if (Math.hypot(x, z) > L.PLAZA_R - 0.5) fail(`tree at ${x},${z} is on the pavement`);
  if (near(x, z, L.FOUNTAIN.x, L.FOUNTAIN.z) < L.FOUNTAIN.r + 0.6) fail(`tree at ${x},${z} is in the fountain`);
  for (const p of L.IDLERS) if (near(x, z, p.x, p.z) < 0.7) fail(`tree at ${x},${z} is on ${p.seed}`);
  for (const at of L.CROSSINGS) {
    const along = Math.sin(at) * x + Math.cos(at) * z;
    const off = Math.abs(Math.cos(at) * x - Math.sin(at) * z);
    if (along > L.WAIT_IN_R - 0.6 && off < 0.7) fail(`tree at ${x},${z} blocks the crossing path`);
  }
}
for (const t of L.OUTER_TREES) {
  const r = Math.hypot(t.x, t.z);
  if (r - 0.2 < L.OUTER_WALK_OUT) fail('an outer tree is on the pavement');
  if (r + 0.15 > L.GRASS_R) fail('an outer tree is off the grass');
}
if (L.clearOfBuildings(L.FOUNTAIN.x, L.FOUNTAIN.z) < L.FOUNTAIN.r + 0.4) fail('the fountain is in a building');
if (Math.hypot(L.FOUNTAIN.x, L.FOUNTAIN.z) + L.FOUNTAIN.r > L.PLAZA_R - 0.3) fail('the fountain is on the pavement');
for (const p of L.IDLERS) {
  if (L.clearOfBuildings(p.x, p.z) < 0.4) fail(`${p.seed} stands in a building`);
  if (near(p.x, p.z, L.FOUNTAIN.x, L.FOUNTAIN.z) < L.FOUNTAIN.r + 0.3) fail(`${p.seed} stands in the fountain`);
  const r = Math.hypot(p.x, p.z);
  if (r < L.PLAZA_R + 0.2 ? r > L.PLAZA_R - 0.3 : r - BODY < L.ROAD_OUT || r + BODY > L.OUTER_WALK_OUT) fail(`${p.seed} stands on a walking lane or the road`);
}
for (const at of L.CROSSINGS) {
  const w = L.polar(at, L.WAIT_IN_R);
  if (L.clearOfBuildings(w.x, w.z) < 0.5) fail('people wait for a crossing inside a building');
  for (const lamp of [...L.LAMPS_IN, ...L.LAMPS_OUT, ...L.BENCHES]) {
    if (Math.abs(L.angleDiff(lamp.a, at)) * lamp.r < L.CROSSING_HALF + 0.3) fail('a lamp or bench stands on a crossing');
  }
}
for (const lamp of L.LAMPS_IN) for (const w of L.WALK_LANES) if (Math.abs(lamp.r - w.r) < BODY + 0.12) fail('a lamp stands in a walking lane');
for (const lamp of L.LAMPS_OUT) for (const b of L.BENCHES) if (near(L.polar(lamp.a, lamp.r).x, L.polar(lamp.a, lamp.r).z, L.polar(b.a, b.r).x, L.polar(b.a, b.r).z) < 1.0) fail('a lamp stands on a bench');
for (const s of [...L.LAMPS_OUT, ...L.BENCHES]) {
  const p = L.polar(s.a, s.r);
  if (near(p.x, p.z, L.SHELTER.x, L.SHELTER.z) < L.SHELTER.w / 2 + 0.5) fail('a lamp or bench stands in the bus shelter');
}

// ---- feet match the ground ----
for (const v of [0.3, 0.8, 1.2, 1.5]) {
  for (const h of [0.92, 1.08]) {
    const s = walkAmountFor(v, h, L.K);
    if (s >= 0.999) fail(`a figure ${h} tall cannot step fast enough for ${v}`);
    if (Math.abs(strideSpeed(s, h, L.K) - v) > 0.01) fail(`steps slide at ${v}`);
  }
}

// ---- ten minutes of traffic ----
const sim = createSim();
const dt = 1 / 60;
const laps = sim.cars.map(() => 0);
const walked = sim.walkers.map(() => 0);
const crossings = sim.crossers.map(() => 0);
const stillCar = sim.cars.map(() => 0);
const stillWalker = sim.walkers.map(() => 0);
let worstStillCar = 0, worstStillWalker = 0, busStops = 0, wasDwelling = false;
let minCarGap = Infinity, minPeopleGap = Infinity, minCarPerson = Infinity;
const MINUTES = 10;
for (let step = 0; step < (MINUTES * 60) / dt; step++) {
  const before = sim.cars.map((c) => c.pos);
  const wBefore = sim.walkers.map((w) => w.pos);
  const states = sim.crossers.map((c) => c.state);
  stepSim(sim, dt);
  sim.cars.forEach((c, i) => {
    const n = TAU * L.CAR_LANES[c.lane].r;
    if (c.pos < before[i] - n / 2) laps[i]++;
    stillCar[i] = c.v < 0.01 ? stillCar[i] + dt : 0;
    worstStillCar = Math.max(worstStillCar, stillCar[i]);
  });
  sim.walkers.forEach((w, i) => {
    const n = TAU * L.WALK_LANES[w.lane].r;
    walked[i] += (w.pos - wBefore[i] + n) % n;
    stillWalker[i] = w.v < 0.01 ? stillWalker[i] + dt : 0;
    worstStillWalker = Math.max(worstStillWalker, stillWalker[i]);
  });
  sim.crossers.forEach((c, i) => {
    if (c.state !== states[i] && (c.state === 'waitIn' || c.state === 'waitOut')) crossings[i]++;
  });
  const bus = sim.cars.find((c) => c.model === 'bus')!;
  if (bus.dwell > 0 && !wasDwelling) busStops++;
  wasDwelling = bus.dwell > 0;

  // cars: bumper to bumper along each lane
  for (const a of sim.cars) {
    for (const b of sim.cars) {
      if (a === b || a.lane !== b.lane) continue;
      const n = TAU * L.CAR_LANES[a.lane].r;
      const gap = ((b.pos - a.pos + n) % n) - (a.len + b.len) / 2;
      minCarGap = Math.min(minCarGap, gap);
      if (gap < 0.3) fail(`t=${sim.t.toFixed(1)} ${a.model} is ${gap.toFixed(2)} behind ${b.model}`);
    }
  }
  // people, wherever they are
  const people = [...sim.walkers.map(walkerPose), ...sim.crossers.map(crosserPose), ...L.IDLERS];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const d = near(people[i].x, people[i].z, people[j].x, people[j].z);
      minPeopleGap = Math.min(minPeopleGap, d);
      if (d < 2 * BODY) fail(`t=${sim.t.toFixed(1)} two people overlap (${d.toFixed(2)})`);
    }
  }
  // people and cars: outside each car's footprint
  for (const c of sim.cars) {
    const p = carPose(c);
    const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
    for (const q of people) {
      const dx = q.x - p.x, dz = q.z - p.z;
      const along = Math.abs(dx * fx + dz * fz) - c.len / 2;
      const side = Math.abs(dx * fz - dz * fx) - halfW(c);
      const d = along > 0 || side > 0 ? Math.hypot(Math.max(along, 0), Math.max(side, 0)) : Math.max(along, side);
      minCarPerson = Math.min(minCarPerson, d);
      if (d < BODY) fail(`t=${sim.t.toFixed(1)} a ${c.model} drives through someone`);
    }
  }
  // nobody drives over a zebra while someone is on it
  for (const x of sim.crossers) {
    if (!crossingBusyForCars(x) || x.r > L.ROAD_OUT || x.r < L.ROAD_IN) continue;
    for (const c of sim.cars) {
      const lane = L.CAR_LANES[c.lane];
      const n = TAU * lane.r;
      const d = ((angleToPos(x.at, lane) - c.pos + n * 1.5) % n) - n / 2; // crossing relative to the car's middle
      if (Math.abs(d) < c.len / 2 + L.CROSSING_HALF) fail(`t=${sim.t.toFixed(1)} a ${c.model} is on the zebra while someone crosses`);
    }
  }
}
sim.cars.forEach((c, i) => laps[i] < 4 && fail(`${c.model} only managed ${laps[i]} laps`));
sim.walkers.forEach((w, i) => walked[i] < 200 && fail(`${w.seed} only walked ${walked[i].toFixed(0)}`));
sim.crossers.forEach((c, i) => crossings[i] < 20 && fail(`${c.seed} only crossed ${crossings[i]} times`));
if (worstStillCar > 25) fail(`a car sat still for ${worstStillCar.toFixed(1)}s`);
if (worstStillWalker > 15) fail(`someone stood still on the pavement for ${worstStillWalker.toFixed(1)}s`);
if (busStops < 3) fail(`the bus only stopped ${busStops} times`);

console.log(
  `${MINUTES} min: laps ${laps.join('/')}, walked ${walked.map((w) => w.toFixed(0)).join('/')}, crossings ${crossings.join('/')}, bus stops ${busStops}\n` +
    `closest: car to car ${minCarGap.toFixed(2)}, person to person ${minPeopleGap.toFixed(2)}, car to person ${minCarPerson.toFixed(2)}; longest wait: car ${worstStillCar.toFixed(1)}s, walker ${worstStillWalker.toFixed(1)}s`,
);
if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('welcome scene OK');
