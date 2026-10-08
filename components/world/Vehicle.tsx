'use client';
import { useEffect, useMemo } from 'react';
import type { Item } from '@/lib/life/market';
import { CAR_PARTS, carMaterial, carParts, type CarModel } from './carModels';
import { Plane } from './Plane';

// Low-poly vehicles the player (or a peer) rides. Built facing +z like the figure.

export function Vehicle({ item }: { item: Item }) {
  const m = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.2} {...extra} />;
  if (item.kind === 'car') return <OwnedCar item={item} />;
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

/** A Market car: the same procedural model as traffic, open-topped so the rider shows. */
function OwnedCar({ item }: { item: Item }) {
  const model = OWNED_MODEL[item.id] ?? 'sedan';
  const parts = carParts(model, model !== 'keke');
  const mats = useMemo(() => CAR_PARTS.map((p) => carMaterial(p, item.color)), [item.color]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return (
    <group>
      {CAR_PARTS.map((p, i) => parts[p] && <mesh key={p} geometry={parts[p]!} material={mats[i]} castShadow={p === 'paint'} />)}
    </group>
  );
}

/** Where the figure sits/stands relative to the vehicle, and whether it is shown. */
export function riderOffset(item: Item | null): { y: number; show: boolean; scale: number } {
  if (!item) return { y: 0, show: true, scale: 1 };
  if (item.kind === 'car') return { y: 0.55, show: true, scale: 0.85 };
  if (item.kind === 'boat') return { y: 0.7, show: true, scale: 1 };
  return { y: 0, show: false, scale: 1 };
}
