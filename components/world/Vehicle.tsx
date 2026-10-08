'use client';
import type { Item } from '@/lib/life/market';
import type { CarModel } from './carModels';
import { CarBody, driverSpot, type RiderSpot } from './RideVehicle';
import { Plane } from './Plane';

// Low-poly vehicles the player (or a peer) rides. Built facing +z like the figure.

/** `mine`: the player's own ride, whose speed and brake lights come from playerVehicle; `speed` (metres per second)
 *  turns a peer's wheels. */
export function Vehicle({ item, mine = false, speed }: { item: Item; mine?: boolean; speed?: () => number }) {
  const m = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.2} {...extra} />;
  if (item.kind === 'car')
    return <CarBody model={OWNED_MODEL[item.id] ?? 'sedan'} paint={item.color} open {...(mine ? {} : { speed: speed ?? (() => 0), braking: () => false })} />;
  if (item.kind === 'boat') {
    const big = item.id === 'yacht';
    return (
      <group>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[big ? 3 : 1.8, 0.7, big ? 9 : 4.5]} />
          {m(item.color)}
        </mesh>
        <mesh position={[0, 0.9, big ? -1.5 : -0.8]} castShadow>
          <boxGeometry args={[big ? 2.2 : 1.2, big ? 1.2 : 0.7, big ? 3.5 : 1.4]} />
          {m('#1B2436', { roughness: 0.3 })}
        </mesh>
        <mesh position={[0, 0.35, big ? 4.9 : 2.5]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[big ? 2.1 : 1.3, 0.7, big ? 2.1 : 1.3]} />
          {m(item.color)}
        </mesh>
      </group>
    );
  }
  // the private jet, gear tucked away: when you ride it you are up at cruising height
  return <Plane kind="jet" flying />;
}

const OWNED_MODEL: Record<string, CarModel> = { keke: 'keke', sedan: 'sedan', lambo: 'sport' };

/** Where the figure sits or stands on the vehicle, whether it is shown, and the pose it holds. A Market car is the
 *  traffic model with the roof off, and you sit at the wheel. */
export function riderOffset(item: Item | null): RiderSpot {
  if (!item) return { pos: [0, 0, 0], show: true, scale: 1, pose: null };
  if (item.kind === 'car') return driverSpot(OWNED_MODEL[item.id] ?? 'sedan', true);
  if (item.kind === 'boat') return { pos: [0, 0.7, 0], show: true, scale: 1, pose: null };
  return { pos: [0, 0, 0], show: false, scale: 1, pose: null };
}
