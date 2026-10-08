'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Airport, Rect } from '@/lib/world/layout';
import { prng } from '@/lib/world/seed';
import { COUNTRIES, COUNTRY_IDS } from '@/lib/world/countries';
import { airportSpots } from '@/lib/world/aircraft';
import { airportGroundAt } from '@/lib/world/ground';
import { planeSound } from '@/lib/audio/state';
import type { CityTheme } from '@/lib/world/cityThemes';
import { Parts, remap, slab } from './meshParts';
import { Plane } from './Plane';
import { planeModel } from './planeModels';
import { liveryFor } from './planeLiveries';

// The airport island: bridge, terminal, jet bridges, hangar, tower, apron, taxiway and runway, all merged into three
// meshes (paint, glass, lights). Parked planes in country colours at the gates with their ground crews' vehicles,
// a business jet in the hangar and another on the apron, and a helicopter on its pad. On a loop an airliner lands,
// backtracks down the runway and takes off again, and the helicopter flies a circuit round the island.

const FONT = '/fonts/inter-600.woff';
const ASPHALT = '#3E434C';
const CONCRETE = '#C9CCD1';
const RUNWAY = '#2F3338';
const TAXI = '#555B63';
const PAINT_W = '#F2F4F7';
const YELLOW = '#F4C430';
const STEEL = '#D6DADF';
const DARKGLASS = '#22303F';

const PAINT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
const GLASS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.7 });
const LIGHTS = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** Plane-local (x left, z forward) to world, for a plane at (cx, cz) turned by yaw. */
const placer = (cx: number, cz: number, yaw: number) => (lx: number, lz: number) => ({
  x: cx + lx * Math.cos(yaw) + lz * Math.sin(yaw),
  z: cz - lx * Math.sin(yaw) + lz * Math.cos(yaw),
});

export function AirportScene({ ap, grass, theme }: { ap: Airport; grass: string; theme: CityTheme }) {
  const spots = useMemo(() => airportSpots(ap, theme.country), [ap, theme.country]);
  const flag = COUNTRIES[theme.country].theme.primary;
  const meshes = useMemo(() => buildAirport(ap, grass, spots, flag), [ap, grass, spots, flag]);
  useEffect(() => () => Object.values(meshes).forEach((g) => g?.dispose()), [meshes]);
  const T = ap.terminal, rw = ap.runway;
  return (
    <group>
      {meshes.paint && <mesh geometry={meshes.paint} material={PAINT} castShadow receiveShadow />}
      {meshes.glass && <mesh geometry={meshes.glass} material={GLASS} castShadow />}
      {meshes.lights && <mesh geometry={meshes.lights} material={LIGHTS} />}
      {[-1, 1].map((e) => (
        <Text key={e} font={FONT} position={[rw.x, 0.2, e * (rw.d / 2 - 12)]} rotation={[-Math.PI / 2, 0, e > 0 ? 0 : Math.PI]} fontSize={3.2} color={PAINT_W} anchorX="center" anchorY="middle">
          {e > 0 ? '36' : '18'}
        </Text>
      ))}
      {spots.gates.map((g, i) => (
        <Text key={i} font={FONT} position={[T.x + T.w / 2 + 1.8, 4.1, g.z + 7.5 - 1.25]} rotation={[0, Math.PI / 2, 0]} fontSize={0.55} color="#1B2436" anchorX="center" anchorY="middle">
          {`B${i + 1}`}
        </Text>
      ))}
      {[...spots.gates, ...spots.others].map((s, i) => (
        <group key={i} position={[s.x, airportGroundAt(ap, s.x, s.z) ?? 0.11, s.z]} rotation={[0, s.yaw, 0]}>
          <Plane kind={s.kind} country={s.country} tint={s.tint} />
        </group>
      ))}
      <Windsock x={rw.x + rw.w / 2 + 2.5} z={14} />
      <Radar x={rw.x + rw.w / 2 + 2.5} z={-44} />
      <RunwayTraffic ap={ap} />
      <HeliCircuit ap={ap} pad={spots.heliPad} tint="#E63946" />
    </group>
  );
}

// ---------------------------------------------------------------- static geometry

function buildAirport(ap: Airport, grass: string, spots: ReturnType<typeof airportSpots>, flag: string) {
  const P = new Parts(), G = new Parts(), Li = new Parts();
  const rect = (r: Rect, y: number, h: number, c: string) => P.box(c, r.w, h, r.d, r.x, y + h / 2, r.z);
  /** a flat stripe from (x1, z1) to (x2, z2) on a surface at height y */
  const stripe = (c: string, x1: number, z1: number, x2: number, z2: number, y: number, w: number) => P.beam(c, [x1, y, z1], [x2, y, z2], w, 0.02);
  const lamp = (c: string, x: number, y: number, z: number, s = 0.26, glow = 1.8) => Li.add(new THREE.BoxGeometry(s, s, s).translate(x, y, z), c, glow);
  const rw = ap.runway, tw = ap.taxiway, T = ap.terminal, H = ap.hangar, A = ap.apron;

  // ---- ground: bridge, roads, island, apron, taxiway, runway
  rect(ap.bridge, -0.2, 0.32, '#9AA0A8');
  rect({ ...ap.bridge, d: ap.bridge.d - 2 }, 0.1, 0.04, ASPHALT);
  for (const s of [-1, 1]) rect({ x: ap.bridge.x, z: s * (ap.bridge.d / 2 - 0.2), w: ap.bridge.w, d: 0.3 }, 0.1, 0.9, '#E8DCC8');
  for (let i = 0; i < Math.max(1, Math.floor(ap.bridge.w / 8)); i++) P.box('#8A8F96', 1.2, 2.2, ap.bridge.d - 1, ap.bridge.x - ap.bridge.w / 2 + 4 + i * 8, -1.2, 0);
  for (let x = ap.bridge.x - ap.bridge.w / 2 + 2; x < ap.bridge.x + ap.bridge.w / 2; x += 3.2) stripe(PAINT_W, x, 0, x + 1.6, 0, 0.13, 0.18);
  rect(ap.road, -0.01, 0.07, ASPHALT);
  rect(ap.island, -1.2, 1.25, grass);
  rect({ ...ap.island, w: ap.island.w + 1.2, d: ap.island.d + 1.2 }, -1.4, 1.1, '#D9C9A3');
  rect(ap.islandRoad, 0.05, 0.06, ASPHALT);
  for (let z = ap.islandRoad.z - ap.islandRoad.d / 2 + 2; z < ap.islandRoad.z + ap.islandRoad.d / 2; z += 4) stripe(PAINT_W, ap.islandRoad.x, z, ap.islandRoad.x, z + 2, 0.12, 0.15);
  rect(A, 0.05, 0.06, CONCRETE);
  // apron joints, every 5 units both ways
  for (let x = A.x - A.w / 2 + 5; x < A.x + A.w / 2; x += 5) stripe('#B9BDC3', x, -A.d / 2, x, A.d / 2, 0.112, 0.05);
  for (let z = -A.d / 2 + 5; z < A.d / 2; z += 5) stripe('#B9BDC3', A.x - A.w / 2, z, A.x + A.w / 2, z, 0.112, 0.05);
  rect(tw, 0.05, 0.07, TAXI);
  stripe(YELLOW, tw.x, -tw.d / 2 + 1, tw.x, tw.d / 2 - 1, 0.125, 0.25);
  for (const e of [-1, 1]) {
    const cz = e * (rw.d / 2 - 8);
    rect({ x: (tw.x + rw.x) / 2, z: cz, w: rw.x - tw.x, d: 5 }, 0.05, 0.07, TAXI);
    stripe(YELLOW, tw.x, cz, rw.x - rw.w / 2, cz, 0.125, 0.25);
    // hold-short: two solid lines on the taxiway side, two dashed on the runway side
    const hx = rw.x - rw.w / 2 - 1.4;
    for (const dx of [-0.55, -0.25]) stripe(YELLOW, hx + dx, cz - 2.4, hx + dx, cz + 2.4, 0.126, 0.14);
    for (const dx of [0.05, 0.35]) for (let z = cz - 2.4; z < cz + 2.4; z += 1) stripe(YELLOW, hx + dx, z, hx + dx, z + 0.55, 0.126, 0.14);
    // a taxiway sign on legs beside the hold line
    P.box('#1B1B1D', 0.12, 0.55, 1.4, hx - 0.6, 0.62, cz - e * 3.4);
    P.box(YELLOW, 0.13, 0.42, 0.62, hx - 0.6, 0.62, cz - e * 3.4 - 0.32);
    for (const dz of [-0.55, 0.55]) P.rod('#8A9099', [hx - 0.6, 0.1, cz - e * 3.4 + dz], [hx - 0.6, 0.36, cz - e * 3.4 + dz], 0.04, 4);
  }
  rect(rw, 0.06, 0.08, RUNWAY);
  // runway markings: centreline, threshold piano keys, aiming points, touchdown zone bars, edge lines
  const my = 0.145;
  for (let z = -rw.d / 2 + 16; z < rw.d / 2 - 16; z += 7) stripe(PAINT_W, rw.x, z, rw.x, z + 3.5, my, 0.35);
  for (const e of [-1, 1]) {
    for (let k = -3; k <= 3; k++) if (k) stripe(PAINT_W, rw.x + k * 1.2, e * (rw.d / 2 - 1.25), rw.x + k * 1.2, e * (rw.d / 2 - 5.75), my, 0.6);
    for (const sx of [-1, 1]) stripe(PAINT_W, rw.x + sx * 2.4, e * (rw.d / 2 - 19), rw.x + sx * 2.4, e * (rw.d / 2 - 25), my, 1.4);
    for (const at of [30, 38])
      for (const sx of [-1, 1]) for (const k of [0, 1]) stripe(PAINT_W, rw.x + sx * (1.6 + k * 0.7), e * (rw.d / 2 - at), rw.x + sx * (1.6 + k * 0.7), e * (rw.d / 2 - at - 3), my, 0.35);
  }
  for (const sx of [-1, 1]) stripe(PAINT_W, rw.x + sx * (rw.w / 2 - 0.4), -rw.d / 2 + 1, rw.x + sx * (rw.w / 2 - 0.4), rw.d / 2 - 1, my, 0.25);

  // ---- lights: runway edges, threshold (green, landing end -z) and end (red), approach bars, PAPI, taxiway blue
  for (let z = -rw.d / 2 + 2; z <= rw.d / 2 - 2; z += 6) for (const sx of [-1, 1]) lamp('#FFF3D6', rw.x + sx * (rw.w / 2 + 0.5), 0.25, z, 0.22, 1.6);
  for (let x = -rw.w / 2; x <= rw.w / 2 + 0.01; x += 1.25) {
    lamp('#3DFF7A', rw.x + x, 0.22, -rw.d / 2 + 0.3, 0.22, 2);
    lamp('#FF3030', rw.x + x, 0.22, rw.d / 2 - 0.3, 0.22, 2);
  }
  for (let k = 0; k < 7; k++) {
    const z = -rw.d / 2 - 3 - k * 4;
    const half = k === 3 ? 4 : 1.6;
    P.rod('#9AA0A8', [rw.x, -0.6, z], [rw.x, 0.42, z], 0.06, 5);
    P.box('#9AA0A8', half * 2 + 0.3, 0.08, 0.1, rw.x, 0.46, z);
    for (let x = -half; x <= half + 0.01; x += 0.8) lamp('#FFF3D6', rw.x + x, 0.55, z, 0.2, 2.2);
  }
  for (let k = 0; k < 4; k++) {
    const x = rw.x + rw.w / 2 + 1.2 + k * 0.8, z = -rw.d / 2 + 22;
    P.box('#5E656F', 0.6, 0.35, 0.5, x, 0.28, z);
    lamp(k < 2 ? '#FF3030' : '#FFFFFF', x, 0.32, z - 0.27, 0.24, 2.4);
  }
  for (let z = -tw.d / 2 + 4; z <= tw.d / 2 - 4; z += 8) for (const sx of [-1, 1]) {
    if (sx > 0 && Math.abs(Math.abs(z) - (rw.d / 2 - 8)) < 4) continue;
    lamp('#3D7BFF', tw.x + sx * (tw.w / 2 + 0.35), 0.2, z, 0.18, 2.2);
  }

  // ---- around the walk-through terminal (Terminal.tsx draws the hall): a kerbside canopy on columns
  const tx0 = T.x - T.w / 2, tx1 = T.x + T.w / 2;
  P.box('#D9DCE0', 2, 0.16, T.d, tx0 - 1, 0.16, T.z);
  P.box(PAINT_W, 3.2, 0.2, 40, tx0 - 1.9, 4.3, T.z);
  P.box('#C9CED6', 0.12, 0.35, 40, tx0 - 3.45, 4.3, T.z);
  for (const z of [-18, -12, -6, 6, 12]) P.rod('#C9CED6', [tx0 - 1.8, 0.2, T.z + z], [tx0 - 1.8, 4.2, T.z + z], 0.09, 6);

  // ---- jet bridges: link, rotunda on a column, tunnel, drive legs, and a cab at the door of the parked plane
  spots.gates.forEach((s) => {
    const m = planeModel(s.kind, liveryFor(s.country));
    const at = placer(s.x, s.z, s.yaw);
    const door = at(m.door.x, m.door.z);
    const cab = { x: door.x, z: door.z + 0.95 };
    const rot = { x: tx1 + 2.0, z: s.z + 7.5 };
    const y = m.door.y + 0.95;
    P.box(STEEL, 0.9, 2.0, 1.7, tx1 + 0.45, y, rot.z);
    P.add(new THREE.CylinderGeometry(1.05, 1.05, 2.3, 12).translate(rot.x, y, rot.z), '#C6CBD2');
    P.rod('#8A9099', [rot.x, 0.1, rot.z], [rot.x, y - 1.1, rot.z], 0.25, 8);
    P.beam(STEEL, [rot.x, y, rot.z], [cab.x, y, cab.z + 0.8], 1.55, 1.9);
    for (const sx of [-1, 1]) {
      // window strip along each side of the tunnel
      const dx = cab.x - rot.x, dz = cab.z + 0.8 - rot.z, len = Math.hypot(dx, dz);
      const nx = (-dz / len) * sx * 0.79, nz = (dx / len) * sx * 0.79;
      G.beam('#4A6A8A', [rot.x + nx + dx * 0.1, y + 0.3, rot.z + nz + dz * 0.1], [cab.x + nx - dx * 0.08, y + 0.3, cab.z + 0.8 + nz - dz * 0.08], 0.02, 0.38);
      P.rod('#5E656F', [cab.x - 0.3 * sx, 0.35, cab.z + 1.6], [cab.x - 0.3 * sx, y - 0.95, cab.z + 1.6], 0.12, 6);
    }
    P.box('#3B4048', 1.4, 0.35, 0.8, cab.x, 0.3, cab.z + 1.6);
    P.box('#C6CBD2', 1.9, 2.1, 1.7, cab.x, y, cab.z);
    P.box('#2A2F36', 1.3, 1.6, 0.06, cab.x, y - 0.1, cab.z - 0.86);
    G.box(DARKGLASS, 1.6, 0.6, 0.04, cab.x, y + 0.45, cab.z + 0.87);
    // gate sign on the rotunda
    P.box(YELLOW, 0.06, 0.8, 1.3, tx1 + 1.75, 4.1, s.z + 7.5 - 1.25);
    P.rod('#8A9099', [tx1 + 1.75, y + 1.1, s.z + 7.5 - 1.25], [tx1 + 1.75, 3.75, s.z + 7.5 - 1.25], 0.05, 4);
    // stand markings: lead-in line from the taxiway to the stop bar, and the red equipment limit lines
    stripe(YELLOW, A.x + A.w / 2, s.z, tx1 + 2.2, s.z, 0.115, 0.2);
    const nose = at(0, m.length / 2 - 1.2);
    stripe(YELLOW, nose.x, s.z - 1.2, nose.x, s.z + 1.2, 0.116, 0.3);
    for (const e of [-1, 1]) stripe('#D23A3A', tx1 + 2.5, s.z + e * 8.6, A.x + A.w / 2 - 3, s.z + e * 8.6, 0.116, 0.15);
  });

  // ---- ground crews around each gate plane
  const rnd = prng(41);
  const bags = ['#2D2D2D', '#7A1E2C', '#1F4E79', '#4B5320', '#8A5A2B', '#C9CED6', '#E63946'];
  const vehicle = (x: number, z: number, yaw: number, build: (b: (c: string, w: number, h: number, d: number, lx: number, ly: number, lz: number, rx?: number) => void) => void) => {
    build((c, w, h, d, lx, ly, lz, rx = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx) g.rotateX(rx);
      g.translate(lx, ly, lz);
      g.rotateY(yaw);
      g.translate(x, 0, z);
      P.add(g, c);
    });
  };
  const wheels = (b: Parameters<Parameters<typeof vehicle>[3]>[0], w: number, zs: number[], r = 0.2) => {
    for (const z of zs) for (const sx of [-1, 1]) b('#1A1B1E', 0.16, r * 2, r * 2, sx * (w / 2), r + 0.1, z);
  };
  const tug = (x: number, z: number, yaw: number) =>
    vehicle(x, z, yaw, (b) => {
      b('#F2C230', 1.0, 0.5, 1.7, 0, 0.55, 0);
      b('#2B3440', 0.9, 0.62, 0.65, 0, 1.1, -0.35);
      b('#F2C230', 0.95, 0.06, 0.75, 0, 1.44, -0.35);
      wheels(b, 1.0, [-0.55, 0.55]);
    });
  const cart = (x: number, z: number, yaw: number) =>
    vehicle(x, z, yaw, (b) => {
      b('#5E656F', 1.0, 0.1, 1.5, 0, 0.45, 0);
      b('#3B4048', 1.05, 0.05, 1.55, 0, 1.4, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b('#3B4048', 0.05, 0.9, 0.05, sx * 0.48, 0.95, sz * 0.72);
      for (let k = 0; k < 4; k++) b(bags[Math.floor(rnd() * bags.length)], 0.38 + rnd() * 0.12, 0.3 + rnd() * 0.15, 0.5 + rnd() * 0.2, (k % 2 ? 0.22 : -0.22), 0.65, k < 2 ? -0.35 : 0.35);
      wheels(b, 1.0, [-0.5, 0.5], 0.17);
    });
  const cone = (x: number, z: number) => {
    P.add(new THREE.ConeGeometry(0.17, 0.5, 8).translate(x, 0.36, z), '#FF6A13');
    P.add(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 8).translate(x, 0.4, z), '#FFFFFF');
    P.box('#FF6A13', 0.36, 0.04, 0.36, x, 0.13, z);
  };
  spots.gates.forEach((s, gi) => {
    const m = planeModel(s.kind, liveryFor(s.country));
    const at = placer(s.x, s.z, s.yaw);
    const big = s.kind === 'airliner';
    const yawOf = (ly: number) => s.yaw + ly;
    // baggage train down the right side, belt loader up to the aft hold
    const t0 = at(-3.4, -m.length * 0.2);
    tug(t0.x, t0.z, yawOf(0));
    for (let k = 1; k <= (big ? 3 : 2); k++) {
      const c = at(-3.4, -m.length * 0.2 - k * 2.0);
      cart(c.x, c.z, yawOf(0));
    }
    const holdZ = -m.length * 0.24, holdY = big ? 1.15 : 0.82;
    const lo = at(-3.9, holdZ), hi = at(-0.9, holdZ);
    P.beam('#3B4048', [lo.x, 0.55, lo.z], [hi.x, holdY, hi.z], 0.7, 0.12);
    const ch = at(-2.6, holdZ);
    vehicle(ch.x, ch.z, yawOf(Math.PI / 2), (b) => {
      b('#E8E8E8', 0.9, 0.45, 2.6, 0, 0.45, 0);
      b('#2B3440', 0.7, 0.5, 0.6, 0, 0.9, -1.0);
      wheels(b, 0.9, [-0.9, 0.9], 0.18);
    });
    // ground power at the nose, cones at the wingtips and tail
    const gpu = at(1.8, m.length / 2 - 1.5);
    vehicle(gpu.x, gpu.z, yawOf(0), (b) => {
      b('#E5E7EB', 0.8, 0.7, 1.2, 0, 0.6, 0);
      b('#3B4048', 0.82, 0.12, 1.22, 0, 0.95, 0);
      wheels(b, 0.8, [-0.4, 0.4], 0.14);
    });
    for (const sx of [-1, 1]) {
      const c = at(sx * (m.span / 2 + 0.7), -0.5);
      cone(c.x, c.z);
    }
    const tc = at(0, -m.length / 2 - 1.2);
    cone(tc.x, tc.z);
    if (gi === 0) {
      // catering truck with its box lifted to the right front door
      const ct = at(-3.0, m.length / 2 - 2.6);
      vehicle(ct.x, ct.z, yawOf(-Math.PI / 2), (b) => {
        b('#F4F6F8', 1.8, 0.5, 3.6, 0, 0.55, 0.2);
        b('#2B3440', 1.7, 1.0, 1.0, 0, 1.25, -1.5);
        b('#F4F6F8', 1.8, 1.7, 2.4, 0, m.door.y + 0.75, 0.75);
        b('#1D9BF0', 1.82, 0.25, 2.42, 0, m.door.y + 1.25, 0.75);
        for (const sx of [-1, 1]) b('#8A9099', 0.06, 0.06, 2.6, sx * 0.5, (m.door.y + 0.8) / 2, 0.6, sx * 0.45);
        wheels(b, 1.8, [-1.3, 1.2], 0.3);
      });
    }
    if (gi === 1) {
      // fuel truck ahead of the right wing, and the pushback tug at the nose
      const ft = at(-4.3, 4.0);
      vehicle(ft.x, ft.z, yawOf(Math.PI), (b) => {
        b('#2B3440', 1.8, 1.2, 1.4, 0, 1.0, 2.1);
        b('#E9EDF2', 1.8, 0.3, 4.8, 0, 0.5, -0.4);
        wheels(b, 1.8, [1.9, -1.0, -2.2], 0.32);
      });
      const tank = at(-4.3, 4.0 + 0.4);
      P.add(new THREE.CylinderGeometry(0.85, 0.85, 3.6, 14).rotateX(Math.PI / 2).translate(tank.x, 1.55, tank.z), '#E9EDF2');
      P.add(new THREE.CylinderGeometry(0.87, 0.87, 0.3, 14).rotateX(Math.PI / 2).translate(tank.x, 1.55, tank.z), '#E63946');
      const pb = at(0, m.length / 2 + 1.9);
      vehicle(pb.x, pb.z, yawOf(Math.PI), (b) => {
        b('#3B4048', 2.2, 0.6, 1.4, 0, 0.45, 0);
        b('#F2C230', 0.9, 0.5, 0.5, 0.5, 0.95, 0.3);
        wheels(b, 2.2, [-0.45, 0.45], 0.28);
      });
    }
  });

  // ---- airstairs for the apron jet, and the helipad
  for (const s of spots.others) {
    if (s.kind !== 'jet' || Math.abs(s.x - H.x) < H.w) continue;
    const m = planeModel('jet', liveryFor(null, s.tint));
    const at = placer(s.x, s.z, s.yaw);
    const top = at(m.door.x + 0.15, m.door.z), foot = at(m.door.x + 2.2, m.door.z);
    P.beam('#F4F6F8', [foot.x, 0.25, foot.z], [top.x, m.door.y, top.z], 0.9, 0.12);
    for (const sx of [-1, 1]) {
      const o = at(m.door.x + 1.2, m.door.z + sx * 0.45);
      P.rod('#9AA3AD', [o.x, 0.2, o.z], [o.x, m.door.y + 0.4, o.z], 0.03, 4);
    }
    const carpet = at(m.door.x + 4.2, m.door.z);
    P.beam('#B3122E', [foot.x, 0.12, foot.z], [carpet.x, 0.12, carpet.z], 0.9, 0.02);
  }
  const hp = spots.heliPad;
  // the pad is paint on the apron: a dark disc, a yellow ring and the H, a centimetre proud
  P.add(new THREE.CylinderGeometry(5, 5, 0.02, 32).translate(hp.x, 0.11, hp.z), '#5E656F');
  P.add(new THREE.RingGeometry(4.1, 4.45, 40).rotateX(-Math.PI / 2).translate(hp.x, 0.122, hp.z), YELLOW);
  P.box(PAINT_W, 0.45, 0.01, 2.8, hp.x - 0.9, 0.122, hp.z);
  P.box(PAINT_W, 0.45, 0.01, 2.8, hp.x + 0.9, 0.122, hp.z);
  P.box(PAINT_W, 1.4, 0.01, 0.45, hp.x, 0.122, hp.z);
  for (let k = 0; k < 8; k++) lamp('#3DFF7A', hp.x + Math.cos((k * Math.PI) / 4) * 4.9, 0.2, hp.z + Math.sin((k * Math.PI) / 4) * 4.9, 0.16, 2);

  // ---- floodlight masts along the apron edge
  for (const z of [-27, -9, 9, 27, 47]) {
    const x = A.x - A.w / 2 + 0.6;
    P.rod('#9AA0A8', [x, 0.1, z], [x, 9, z], 0.12, 6, 0.08);
    P.box('#5E656F', 0.4, 0.5, 1.6, x + 0.2, 9.1, z);
    lamp('#FFF6DD', x + 0.42, 9.0, z, 0.2, 1.4);
  }

  // ---- hangar: an arched shell open towards the apron, sliding doors pushed aside, a back wall
  const arch = (r: number, hh: number, n = 20) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos((Math.PI * i) / n), hh * Math.sin((Math.PI * i) / n)] as [number, number]);
  const hr = H.d / 2, hh = 7.2;
  const shell = [...arch(hr, hh), ...arch(hr - 0.3, hh - 0.3).reverse()];
  P.add(remap(slab(shell, H.w), (v) => v.set(H.x + v.z, v.y, H.z + v.x)), '#B7BEC7');
  for (let x = -H.w / 2 + 1; x < H.w / 2; x += 2) P.add(remap(slab([...arch(hr + 0.08, hh + 0.08), ...arch(hr - 0.02, hh - 0.02).reverse()], 0.2), (v) => v.set(H.x + x + v.z, v.y, H.z + v.x)), '#9AA3AD');
  P.add(remap(slab(arch(hr - 0.1, hh - 0.1), 0.2), (v) => v.set(H.x - H.w / 2 + 0.1 + v.z, v.y, H.z + v.x)), '#8E96A1');
  // sliding doors, two leaves each side pushed aside, their tops following the arch
  const archY = (z: number) => hh * Math.sqrt(Math.max(0, 1 - (z / hr) ** 2));
  for (const side of [-1, 1])
    [[6.2, 8.2, 0.25], [8.0, hr - 0.15, 0.45]].forEach(([z0, z1, dx], k) => {
      const pts: [number, number][] = [[z0, 0], [z1, 0]];
      for (let i = 0; i <= 6; i++) {
        const z = z1 + ((z0 - z1) * i) / 6;
        pts.push([z, archY(z) - 0.2]);
      }
      P.add(remap(slab(pts, 0.16), (v) => v.set(H.x + H.w / 2 + dx + v.z, v.y, H.z + side * v.x)), k ? '#9AA3AD' : '#A9B1BB');
      for (let z = z0 + 0.5; z < z1; z += 0.7) P.box('#8E96A1', 0.04, archY(z) - 0.4, 0.06, H.x + H.w / 2 + dx + 0.1, (archY(z) - 0.4) / 2, H.z + side * z);
    });
  P.box('#E63946', 0.1, 0.45, 7.5, H.x + H.w / 2 + 0.05, 6.35, H.z);
  rect({ x: H.x, z: H.z, w: H.w, d: H.d }, 0.05, 0.07, '#B5B9BF');

  // ---- control tower with its glass cab, and the radar pedestal
  const tw0 = ap.tower;
  P.add(new THREE.CylinderGeometry(tw0.r * 0.6, tw0.r, tw0.h, 12).translate(tw0.x, tw0.h / 2, tw0.z), '#E8E4DC');
  P.add(new THREE.CylinderGeometry(tw0.r * 1.5, tw0.r * 0.7, 1.0, 12).translate(tw0.x, tw0.h - 0.3, tw0.z), '#E8E4DC');
  G.add(new THREE.CylinderGeometry(tw0.r * 1.75, tw0.r * 1.45, 2.4, 12).translate(tw0.x, tw0.h + 1.4, tw0.z), new THREE.Color(flag).lerp(new THREE.Color('#22303F'), 0.35));
  P.add(new THREE.CylinderGeometry(tw0.r * 1.95, tw0.r * 1.95, 0.45, 12).translate(tw0.x, tw0.h + 2.8, tw0.z), PAINT_W);
  P.add(new THREE.TorusGeometry(tw0.r * 1.6, 0.05, 4, 24).rotateX(Math.PI / 2).translate(tw0.x, tw0.h + 0.85, tw0.z), '#9AA0A8');
  P.rod('#9AA0A8', [tw0.x, tw0.h + 3, tw0.z], [tw0.x, tw0.h + 5, tw0.z], 0.08, 4);
  P.rod('#9AA0A8', [tw0.x + 1.2, tw0.h + 3, tw0.z], [tw0.x + 1.2, tw0.h + 4, tw0.z], 0.05, 4);
  lamp('#FF2A2A', tw0.x, tw0.h + 5.1, tw0.z, 0.2, 3);
  const rx = rw.x + rw.w / 2 + 2.5;
  P.add(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 8).translate(rx, 1.6, -44), '#C9CED6');
  P.box('#9AA3AD', 1.6, 0.8, 1.6, rx, 0.45, -44);

  // ---- car park: bays, kerb and parked cars
  rect(ap.carPark, 0.05, 0.06, '#4A4F57');
  const cr = prng(7);
  const cols = ['#E63946', '#1D9BF0', '#F4F1DE', '#2D2D2D', '#FFD166', '#8A96A8'];
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 8; k++) {
      const x = ap.carPark.x - 3 + row * 3, z = ap.carPark.z - 10 + k * 2.8;
      stripe(PAINT_W, x - 1.3, z - 1.4, x + 1.3, z - 1.4, 0.115, 0.08);
      if (cr() < 0.75) {
        const c = cols[Math.floor(cr() * cols.length)];
        P.box(c, 1.6, 0.55, 2.6, x, 0.4, z);
        P.box('#22303F', 1.4, 0.4, 1.4, x, 0.85, z - 0.1);
      }
    }

  return { paint: P.build(), glass: G.build(), lights: Li.build() };
}

// ---------------------------------------------------------------- moving parts

function Windsock({ x, z }: { x: number; z: number }) {
  const sock = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const P = new Parts();
    P.rod('#9AA0A8', [0, 0, 0], [0, 4.2, 0], 0.07, 6);
    P.add(new THREE.TorusGeometry(0.32, 0.03, 4, 12).rotateY(Math.PI / 2).translate(0.05, 4.1, 0), '#9AA0A8');
    // the sock: five bands, orange and white, narrowing away from the pole
    for (let k = 0; k < 5; k++) {
      const r0 = 0.32 - k * 0.045, r1 = 0.32 - (k + 1) * 0.045;
      P.add(new THREE.CylinderGeometry(r1, r0, 0.42, 10, 1, true).rotateZ(-Math.PI / 2).translate(0.26 + k * 0.42, 4.1, 0), k % 2 ? '#FFFFFF' : '#FF6A13');
    }
    return P.build()!;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    const m = sock.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.rotation.y = 0.5 + Math.sin(t * 0.35) * 0.35 + Math.sin(t * 1.3) * 0.06;
  });
  return <mesh ref={sock} geometry={geo} position={[x, 0.1, z]} material={DOUBLE} />;
}
const DOUBLE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });

function Radar({ x, z }: { x: number; z: number }) {
  const dish = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const P = new Parts();
    P.box('#E9EDF2', 3.4, 0.9, 0.18, 0, 0.55, 0.25, -0.25, 0, 0);
    P.box('#9AA3AD', 0.3, 0.6, 0.3, 0, 0.1, 0);
    return P.build()!;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    if (dish.current) dish.current.rotation.y += dt * 1.6;
  });
  return <mesh ref={dish} geometry={geo} position={[x, 3.3, z]} material={PAINT} castShadow />;
}

/** Engine power through the loop's legs: approach, roll-out (reversers), turns and taxi, hold, take-off roll, climb. */
const THRUST: ((u: number) => number)[] = [() => 0.35, (u) => 0.55 - 0.35 * u, () => 0.2, () => 0.2, () => 0.2, () => 0.15, (u) => 0.6 + 0.4 * u, (u) => 1 - 0.3 * u];

type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; gear: boolean; on: boolean };
const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * An airliner on a loop, about 100 s: final approach from the north over the water, touchdown, roll-out, a turn at
 * the far end, backtrack down the runway, a turn to line up, a short hold, the take-off roll and the climb out.
 * Each lap flies a different country's colours.
 */
function RunwayTraffic({ ap }: { ap: Airport }) {
  const ref = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const [lap, setLap] = useState({ n: 0, gear: true });
  const rw = ap.runway;
  const path = useMemo(() => {
    const x = rw.x, end = rw.d / 2;
    const td = -end + 18, stop = end - 9;
    const legs: { d: number; at: (u: number) => Omit<Pose, 'on'> }[] = [
      // approach: a 3-ish degree glide over the approach lights, flaring at the end
      { d: 16, at: (u) => ({ x, y: 26 * (1 - u) ** 1.15, z: td - 190 * (1 - u), yaw: 0, pitch: -0.05 - 0.07 * smooth(Math.max(0, (u - 0.85) / 0.15)), roll: 0, gear: true }) },
      // roll-out, slowing to a crawl
      { d: 16, at: (u) => ({ x, y: 0, z: td + (stop - td) * (1 - (1 - u) ** 2), yaw: 0, pitch: -0.12 * Math.max(0, 1 - u * 6), roll: 0, gear: true }) },
      // 180 at the south end
      { d: 7, at: (u) => { const a = Math.PI * smooth(u); return { x: x + 2 - 2 * Math.cos(a), y: 0, z: stop + 2 * Math.sin(a), yaw: a, pitch: 0, roll: 0, gear: true }; } },
      // backtrack to the north end
      { d: 22, at: (u) => ({ x: x + 4, y: 0, z: stop - (stop + end - 9) * smooth(u), yaw: Math.PI, pitch: 0, roll: 0, gear: true }) },
      // 180 at the north end to line up
      { d: 7, at: (u) => { const a = Math.PI * smooth(u); return { x: x + 2 + 2 * Math.cos(a), y: 0, z: -end + 9 - 2 * Math.sin(a), yaw: Math.PI + a, pitch: 0, roll: 0, gear: true }; } },
      // hold
      { d: 4, at: () => ({ x, y: 0, z: -end + 9, yaw: 0, pitch: 0, roll: 0, gear: true }) },
      // take-off roll, rotate, lift off
      { d: 12, at: (u) => ({ x, y: 0, z: -end + 9 + 82 * u * u, yaw: 0, pitch: -0.16 * smooth(Math.max(0, (u - 0.8) / 0.2)), roll: 0, gear: true }) },
      // climb out over the water with a gentle right bank, gear up
      { d: 14, at: (u) => ({ x: x - 60 * u * u, y: 46 * u ** 1.3, z: -end + 91 + 200 * u, yaw: Math.atan2(-120 * u, 200), pitch: -0.18, roll: 0.25 * smooth(Math.min(1, u * 2)), gear: u < 0.2 }) },
    ];
    const total = legs.reduce((s, l) => s + l.d, 0);
    return { legs, total };
  }, [rw]);
  const country = COUNTRY_IDS[lap.n % COUNTRY_IDS.length];
  // build every lap's livery up front, so a new lap doesn't stall a frame
  useMemo(() => COUNTRY_IDS.forEach((c) => planeModel('airliner', liveryFor(c))), []);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const T = clock.elapsedTime + 30; // start partway through so the runway is busy on arrival
    let t = T % path.total;
    const n = Math.floor(T / path.total);
    let pose: Omit<Pose, 'on'> | null = null;
    let thrust = 0;
    for (let i = 0; i < path.legs.length; i++) {
      const l = path.legs[i];
      if (t <= l.d) {
        pose = l.at(t / l.d);
        thrust = THRUST[i](t / l.d);
        break;
      }
      t -= l.d;
    }
    if (!pose) return;
    // engine noise for components/audio/WorldSounds.tsx
    Object.assign(planeSound, { x: pose.x, y: pose.y, z: pose.z, active: true, thrust });
    g.position.set(pose.x, pose.y + (airportGroundAt(ap, pose.x, pose.z) ?? 0.14), pose.z);
    g.rotation.set(0, pose.yaw, 0);
    if (tilt.current) tilt.current.rotation.set(pose.pitch, 0, pose.roll);
    if (n !== lap.n || pose.gear !== lap.gear) setLap({ n, gear: pose.gear });
  });
  return (
    <group ref={ref}>
      <group ref={tilt}>
        <Plane kind="airliner" country={country} flying={!lap.gear} />
      </group>
    </group>
  );
}

/** The helicopter idles on its pad, lifts off, flies a lap round the island and the lagoon, and lands again. */
function HeliCircuit({ ap, pad, tint }: { ap: Airport; pad: { x: number; z: number }; tint: string }) {
  const ref = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const [rotor, setRotor] = useState(0);
  const cx = ap.island.x, rx = ap.island.w / 2 + 30, rz = ap.island.d / 2 + 25;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime % 80;
    let x = pad.x, y = 0, z = pad.z, yaw = 0, pitch = 0, roll = 0, spin = 0;
    // the start of the lap, on the ellipse, south of the pad
    const a0 = Math.atan2((pad.z - 0) / rz, (pad.x - cx) / rx);
    const onLap = (u: number) => {
      const a = a0 + u * Math.PI * 2;
      return { x: cx + Math.cos(a) * rx, z: Math.sin(a) * rz, yaw: Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz) };
    };
    if (t < 8) spin = t / 8; // spin up
    else if (t < 14) {
      spin = 1;
      const u = (t - 8) / 6;
      y = 18 * smooth(u);
      const p = onLap(0);
      x = pad.x + (p.x - pad.x) * smooth(u);
      z = pad.z + (p.z - pad.z) * smooth(u);
      yaw = p.yaw * smooth(u);
      pitch = 0.12 * Math.sin(u * Math.PI);
    } else if (t < 60) {
      spin = 1;
      const u = (t - 14) / 46;
      const p = onLap(u);
      ({ x, z, yaw } = p);
      y = 18 + Math.sin(u * Math.PI * 2) * 3;
      pitch = 0.1;
      roll = -0.18;
    } else if (t < 68) {
      spin = 1;
      const u = (t - 60) / 8;
      const p = onLap(1);
      x = p.x + (pad.x - p.x) * smooth(u);
      z = p.z + (pad.z - p.z) * smooth(u);
      y = 18 * (1 - smooth(u));
      yaw = p.yaw * (1 - smooth(u));
      pitch = -0.1 * Math.sin(u * Math.PI);
    } else spin = Math.max(0, 1 - (t - 68) / 8);
    g.position.set(x, y + 0.12, z);
    g.rotation.set(0, yaw, 0);
    if (tilt.current) tilt.current.rotation.set(pitch, 0, roll);
    const r = Math.round(spin * 10) / 10;
    if (r !== rotor) setRotor(r);
  });
  return (
    <group ref={ref}>
      <group ref={tilt}>
        <Plane kind="heli" tint={tint} rotor={rotor} />
      </group>
    </group>
  );
}
