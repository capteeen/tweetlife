'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { carGeo, carMaterial, wheelMaterial, type CarModel, type Seat } from './carModels';
import { bikeGeo, scooterGeo, twoWheelerMaterial, type TwoWheeler } from './rideModels';
import { lampMaterial, nightOf, tickLamps } from './vehicleLights';
import { playerVehicle } from './vehicleState';
import { Figure } from './Figure';
import type { HomePose } from './figurePoses';
import { useWorld } from './store';
import { Plane } from './Plane';
import type { CountryId } from '@/lib/world/countries';

// The rides you can take around the city, facing +z like the figure: a share bike and an e-scooter you ride
// yourself, and a city bus, a yellow cab and a rideshare with a driver at the wheel while you sit in the back.
// Wheels turn with the ride's speed, the bike's pedals turn under your feet, the bus opens its doors at stops,
// and brake lights come on as a ride slows. Speeds and states come from playerVehicle (vehicleState.ts),
// which the player controller writes every frame.

/** Lamps: the night level of this world, the indicator blink, and this vehicle's brake light. */
function useLamps(mat: THREE.Material & { userData: { uBrake: { value: number } } }, braking: () => boolean = () => playerVehicle.braking) {
  const skyT = useWorld((s) => s.model?.geometry.skyT ?? 0.3);
  useFrame(() => {
    tickLamps(nightOf(skyT));
    mat.userData.uBrake.value = braking() ? 1 : 0;
  });
}

function TwoWheel({ g, bike }: { g: TwoWheeler; bike: boolean }) {
  const mat = useMemo(() => twoWheelerMaterial(), []);
  const lamp = useMemo(() => lampMaterial(), []);
  useEffect(() => () => (mat.dispose(), lamp.dispose()), [mat, lamp]);
  useLamps(lamp);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  const crank = useRef<THREE.Mesh>(null);
  const pedals = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const v = playerVehicle.speed;
    g.wheels.forEach((w, i) => {
      const m = wheels.current[i];
      if (m) m.rotation.x += (v * d) / w.r;
    });
    if (bike) {
      // the crank turns at the wheel's rate over the gearing; the rider's feet follow it (figurePoses `saddle`)
      playerVehicle.pedal += (v * d) / (g.wheels[0].r * 2.4);
      const a = playerVehicle.pedal;
      if (crank.current) crank.current.rotation.x = a;
      pedals.current.forEach((p, i) => {
        if (!p) return;
        const s = i === 0 ? 1 : -1;
        p.position.set(s * 0.16, g.bb.y + Math.cos(a) * g.crankR * s, g.bb.z + Math.sin(a) * g.crankR * s);
      });
    }
  });
  return (
    <group>
      <mesh geometry={g.body} material={mat} castShadow />
      <mesh geometry={g.lamp} material={lamp} />
      {g.wheels.map((w, i) => (
        <mesh key={i} ref={(m) => void (wheels.current[i] = m)} geometry={g.wheel} material={mat} position={[0, w.y, w.z]} castShadow />
      ))}
      {g.crank && <mesh ref={crank} geometry={g.crank} material={mat} position={[0, g.bb.y, g.bb.z]} />}
      {g.pedal && [0, 1].map((i) => <mesh key={i} ref={(m) => void (pedals.current[i] = m)} geometry={g.pedal!} material={mat} />)}
    </group>
  );
}

const CAR_RIDES: Record<string, { model: CarModel; paint: string }> = {
  bus: { model: 'bus', paint: '#1F4E79' },
  taxi: { model: 'taxi', paint: '#F7C600' },
  rideshare: { model: 'sedan', paint: '#22252B' },
};

type CarBodyProps = {
  model: CarModel;
  paint: string;
  /** roof off (Market cars) */
  open?: boolean;
  /** seed of a driver figure at the wheel */
  driver?: string;
  extras?: React.ReactNode;
  /** metres per second and braking; the player's ride when left out */
  speed?: () => number;
  braking?: () => boolean;
};

/** A car you ride in: hollow cabin behind see-through glass, a driver at the wheel, turning wheels, bus doors. */
export function CarBody({ model, paint, open = false, driver, extras, speed = () => playerVehicle.speed, braking }: CarBodyProps) {
  const g = carGeo(model, { hollow: true, open });
  const mats = useMemo(
    () => ({ paint: carMaterial('paint', paint), glass: carMaterial('glass', paint, true), trim: carMaterial('trim'), lamp: lampMaterial(), wheel: wheelMaterial() }),
    [paint],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useLamps(mats.lamp, braking);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  const leaves = useRef<(THREE.Group | null)[]>([]);
  const doors = useRef(0);
  const spin = useRef(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    spin.current += (speed() * d) / g.wheels[0].y;
    g.wheels.forEach((w, i) => {
      const m = wheels.current[i];
      if (m) m.rotation.x = w.flip ? -spin.current : spin.current;
    });
    if (g.doors.length) {
      doors.current += (playerVehicle.doors - doors.current) * Math.min(1, d * 6);
      g.doors.forEach((leaf, i) => {
        const m = leaves.current[i];
        if (m) m.rotation.y = leaf.dir * doors.current * 1.35;
      });
    }
  });
  const driverPose = useMemo<HomePose | null>(() => (g.seats ? seatPose(g.seats.driver, 'wheel', DRIVER_SCALE) : null), [g.seats]);
  const driverAct = useRef<HomePose | null>(driverPose);
  driverAct.current = driverPose;
  return (
    <group>
      <mesh geometry={g.parts.paint!} material={mats.paint} castShadow />
      {g.parts.glass && <mesh geometry={g.parts.glass} material={mats.glass} renderOrder={2} />}
      <mesh geometry={g.parts.trim!} material={mats.trim} castShadow />
      <mesh geometry={g.parts.lamp!} material={mats.lamp} />
      {g.wheels.map((w, i) => (
        <group key={i} position={[w.x, w.y, w.z]} rotation={[0, w.flip ? Math.PI : 0, 0]}>
          <mesh ref={(m) => void (wheels.current[i] = m)} geometry={g.wheel} material={mats.wheel} />
        </group>
      ))}
      {g.door &&
        g.doors.map((leaf, i) => (
          <group key={i} ref={(m) => void (leaves.current[i] = m)} position={[leaf.x, 0, leaf.z]} scale={[1, 1, leaf.dir]}>
            <mesh geometry={g.door!} material={mats.trim} />
          </group>
        ))}
      {driver && g.seats && driverPose && (
        <group position={seatSpot(g.seats.driver)} scale={DRIVER_SCALE}>
          <Figure seed={driver} actRef={driverAct} minLod={1} />
        </group>
      )}
      {extras}
    </group>
  );
}

/** The rideshare's touches: a glowing app sign on the windscreen and the driver's phone on its mount. */
function RideshareExtras() {
  const g = carGeo('sedan', { hollow: true });
  const w = g.seats!.wheel;
  return (
    <group>
      <mesh position={[-0.45, 0.98, 0.78]} rotation={[-0.55, 0, 0]}>
        <boxGeometry args={[0.3, 0.1, 0.015]} />
        <meshBasicMaterial color="#FF2E88" toneMapped={false} />
      </mesh>
      <mesh position={[w.x - 0.32, w.y + 0.12, w.z + 0.15]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.08, 0.14, 0.012]} />
        <meshBasicMaterial color="#7FD4FF" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The taxi's clear partition between the front seats and the back. */
function TaxiExtras() {
  const g = carGeo('taxi', { hollow: true });
  const z = g.seats!.driver.z - 0.42;
  return (
    <mesh position={[0, 1.02, z]}>
      <boxGeometry args={[1.5, 0.36, 0.02]} />
      <meshStandardMaterial color="#9FB4D9" transparent opacity={0.22} depthWrite={false} roughness={0.1} />
    </mesh>
  );
}

export function RideVehicle({ mode, tint, country }: { mode: string; tint?: string; country?: CountryId }) {
  // flights between countries: a commercial airliner in the destination's colours, or your own jet
  if (mode === 'airliner' || mode === 'jet') return <Plane kind={mode} tint={tint} country={country} />;
  if (mode === 'bike') return <TwoWheel g={bikeGeo()} bike />;
  if (mode === 'scooter') return <TwoWheel g={scooterGeo()} bike={false} />;
  const c = CAR_RIDES[mode] ?? CAR_RIDES.taxi;
  return (
    <CarBody
      model={c.model}
      paint={c.paint}
      driver={`driver-${mode}`}
      extras={mode === 'rideshare' ? <RideshareExtras /> : mode === 'taxi' ? <TaxiExtras /> : null}
    />
  );
}

/** How far the camera pulls back on each ride. */
export const rideCamera = (mode: string) => (mode === 'airliner' ? 3.4 : mode === 'jet' ? 2.6 : mode === 'bus' ? 1.8 : mode === 'bike' || mode === 'scooter' ? 1 : 1.35);

/** Where the figure goes on a vehicle (in the vehicle's frame), how big, and the pose it holds. */
export type RiderSpot = { pos: [number, number, number]; scale: number; show: boolean; pose: HomePose | null };

const DRIVER_SCALE = 0.84;
const PASSENGER_SCALE = 0.84;

/** Root position for a figure sitting on a seat: hips at the back of the cushion. */
const seatSpot = (s: Seat): [number, number, number] => [s.x, 0, s.z - 0.1];
/** The chair pose for a seat whose cushion top is at `s.y`, for a figure drawn at `scale`. */
const seatPose = (s: Seat, upper: HomePose['upper'], scale: number): HomePose => ({ base: 'chair', upper, seat: Math.round(((s.y + 0.02) / scale - 0.08) * 1000) / 1000 });

export function rideRider(mode: string): RiderSpot {
  // inside the cabin
  if (mode === 'airliner' || mode === 'jet') return { pos: [0, 1.2, 0], scale: 0.85, show: false, pose: null };
  if (mode === 'bike') {
    const g = bikeGeo();
    const s = 0.95, z = -0.19, hip = 0.9;
    return { pos: [0, 0, z], scale: s, show: true, pose: { base: 'saddle', upper: 'bars', seat: hip / s, pedal: { y: g.bb.y / s, z: (g.bb.z - z) / s, r: g.crankR / s } } };
  }
  if (mode === 'scooter') return { pos: [0, 0.19, 0.02], scale: 0.9, show: true, pose: { base: 'deck', upper: 'bars', seat: 0 } };
  const c = CAR_RIDES[mode] ?? CAR_RIDES.taxi;
  const seats = carGeo(c.model, { hollow: true }).seats!;
  // the bus: a window seat half way back; cabs: the back seat behind the passenger seat, by the kerb
  const seat = mode === 'bus' ? seats.front! : seats.rear[0] ?? seats.front!;
  return { pos: seatSpot(seat), scale: PASSENGER_SCALE, show: true, pose: seatPose(seat, mode === 'rideshare' ? 'phone' : 'ride', PASSENGER_SCALE) };
}

/** The driver's seat of a car you own (open-topped), or the keke's saddle. */
export function driverSpot(model: CarModel, open: boolean): RiderSpot {
  if (model === 'keke') return { pos: [0, 0, 0.18], scale: 0.85, show: true, pose: { base: 'chair', upper: 'bars', seat: Math.round((1.07 / 0.85 - 0.08) * 1000) / 1000 } };
  const seats = carGeo(model, { hollow: true, open }).seats!;
  return { pos: seatSpot(seats.driver), scale: DRIVER_SCALE, show: true, pose: seatPose(seats.driver, 'wheel', DRIVER_SCALE) };
}

