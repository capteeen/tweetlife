'use client';
import { useEffect, useMemo } from 'react';
import { CAR_PARTS, carMaterial, carParts, type CarModel } from './carModels';

// The rides you can take around the city, facing +z like the figure. The bus, taxi and rideshare are the same
// procedural models as traffic; the taxi and rideshare are open-topped so you can see yourself riding. The bike and e-scooter are built here.

const m = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.3} {...extra} />;

function Wheel({ z, r, w = 0.08, y = r }: { z: number; r: number; w?: number; y?: number }) {
  return (
    <mesh position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, w, 14]} />
      {m('#141414')}
    </mesh>
  );
}

function Bar({ p, s, c, rx = 0 }: { p: [number, number, number]; s: [number, number, number]; c: string; rx?: number }) {
  return (
    <mesh position={p} rotation={[rx, 0, 0]} castShadow>
      <boxGeometry args={s} />
      {m(c)}
    </mesh>
  );
}

/** A dock bike: teal frame, basket on the front. */
function Bike() {
  return (
    <group>
      <Wheel z={0.6} r={0.34} />
      <Wheel z={-0.6} r={0.34} />
      <Bar p={[0, 0.55, 0]} s={[0.07, 0.07, 1.1]} c="#06D6A0" rx={0.25} />
      <Bar p={[0, 0.62, -0.32]} s={[0.07, 0.6, 0.07]} c="#06D6A0" rx={-0.2} />
      <Bar p={[0, 0.72, 0.5]} s={[0.07, 0.6, 0.07]} c="#06D6A0" rx={0.25} />
      <Bar p={[0, 0.95, -0.35]} s={[0.18, 0.06, 0.3]} c="#1B1B1B" />
      <Bar p={[0, 1.02, 0.6]} s={[0.6, 0.05, 0.05]} c="#333" />
      <Bar p={[0, 0.88, 0.82]} s={[0.36, 0.22, 0.28]} c="#2D2D2D" />
    </group>
  );
}

/** A rental e-scooter: deck, stem, bars and a light. */
function Scooter() {
  return (
    <group>
      <Wheel z={0.5} r={0.12} w={0.07} />
      <Wheel z={-0.45} r={0.12} w={0.07} />
      <Bar p={[0, 0.16, 0]} s={[0.22, 0.06, 0.95]} c="#2D2D2D" />
      <Bar p={[0, 0.65, 0.48]} s={[0.06, 1.0, 0.06]} c="#2EC4B6" rx={0.12} />
      <Bar p={[0, 1.13, 0.54]} s={[0.55, 0.05, 0.05]} c="#1B1B1B" />
      <mesh position={[0, 0.95, 0.58]}>
        <boxGeometry args={[0.12, 0.08, 0.05]} />
        <meshStandardMaterial color="#FFF6D8" emissive="#FFF1C4" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

const CAR_RIDES: Record<string, { model: CarModel; paint: string }> = {
  bus: { model: 'bus', paint: '#1F4E79' },
  taxi: { model: 'taxi', paint: '#F7C600' },
  rideshare: { model: 'suv', paint: '#2D2D2D' },
};

function CarRide({ model, paint, rideshare }: { model: CarModel; paint: string; rideshare?: boolean }) {
  const parts = carParts(model, model !== 'bus'); // you ride inside the bus; the others are open so you show
  const mats = useMemo(() => CAR_PARTS.map((p) => carMaterial(p, paint)), [paint]);
  useEffect(() => () => mats.forEach((x) => x.dispose()), [mats]);
  return (
    <group>
      {CAR_PARTS.map((p, i) => parts[p] && <mesh key={p} geometry={parts[p]!} material={mats[i]} castShadow={p === 'paint'} />)}
      {rideshare && (
        // the glowing app sign on the dash
        <mesh position={[0, 1.3, 1.05]}>
          <boxGeometry args={[0.5, 0.16, 0.05]} />
          <meshStandardMaterial color="#FF2E88" emissive="#FF2E88" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function RideVehicle({ mode }: { mode: string }) {
  if (mode === 'bike') return <Bike />;
  if (mode === 'scooter') return <Scooter />;
  const c = CAR_RIDES[mode] ?? CAR_RIDES.taxi;
  return <CarRide model={c.model} paint={c.paint} rideshare={mode === 'rideshare'} />;
}

/** How far the camera pulls back on each ride. */
export const rideCamera = (mode: string) => (mode === 'bus' ? 1.8 : mode === 'bike' || mode === 'scooter' ? 1 : 1.35);

/** Where the figure sits or stands on each ride. */
export function rideRider(mode: string): { y: number; show: boolean; scale: number } {
  if (mode === 'bike') return { y: 0.5, show: true, scale: 0.8 };
  if (mode === 'scooter') return { y: 0.2, show: true, scale: 0.85 };
  if (mode === 'bus') return { y: 1.2, show: false, scale: 0.85 };
  if (mode === 'rideshare') return { y: 0.75, show: true, scale: 0.85 };
  return { y: 0.55, show: true, scale: 0.85 };
}
