'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Item } from '@/lib/life/market';

// Low-poly vehicles the player (or a peer) rides. Built facing +z like the figure.

export function Vehicle({ item }: { item: Item }) {
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z += dt * 30;
  });
  const m = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.5} metalness={0.2} {...extra} />;
  if (item.kind === 'car') {
    const long = item.id === 'lambo';
    return (
      <group>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[item.id === 'keke' ? 1.3 : 1.8, item.id === 'keke' ? 0.9 : 0.6, long ? 4.4 : 3.4]} />
          {m(item.color)}
        </mesh>
        <mesh position={[0, 1.05, item.id === 'keke' ? 0 : -0.2]} castShadow>
          <boxGeometry args={[item.id === 'keke' ? 1.2 : 1.5, item.id === 'keke' ? 0.9 : 0.55, long ? 1.6 : 1.8]} />
          {m('#1B2436', { roughness: 0.3 })}
        </mesh>
        {[-1, 1].flatMap((sx) =>
          (item.id === 'keke' ? [1] : [-1, 1]).map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 0.9, 0.3, sz * (long ? 1.5 : 1.1)]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.3, 8]} />
              {m('#111')}
            </mesh>
          )),
        )}
        {item.id === 'keke' && (
          <mesh position={[0, 0.3, -1.3]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.3, 8]} />
            {m('#111')}
          </mesh>
        )}
      </group>
    );
  }
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
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.45, 7, 8]} />
        {m(item.color)}
      </mesh>
      <mesh position={[0, 0.8, 3.6]} castShadow>
        <coneGeometry args={[0.5, 1.2, 8]} />
        {m(item.color)}
      </mesh>
      <mesh position={[0, 0.7, 0.5]}>
        <boxGeometry args={[8, 0.15, 1.6]} />
        {m('#D4C3A5')}
      </mesh>
      <mesh position={[0, 1.6, -3]}>
        <boxGeometry args={[0.15, 1.6, 1.2]} />
        {m('#D4C3A5')}
      </mesh>
      <mesh position={[0, 0.9, -3]}>
        <boxGeometry args={[3, 0.12, 1]} />
        {m('#D4C3A5')}
      </mesh>
      <mesh ref={spin} position={[0, 0.8, 4.25]}>
        <boxGeometry args={[2.2, 0.15, 0.05]} />
        {m('#333')}
      </mesh>
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
