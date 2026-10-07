'use client';
import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { useWorld } from './store';

const FONT = '/fonts/inter-600.woff';

// The city's venues: distinct, signed, on a ring just outside the post blocks. Tap to open.
export function Venues({ contentRadius, interactive }: { contentRadius: number; interactive: boolean }) {
  const venues = useMemo(() => placeVenues(contentRadius), [contentRadius]);
  return (
    <group>
      {venues.map((v) => (
        <VenueMesh key={v.id} v={v} interactive={interactive} />
      ))}
    </group>
  );
}

function VenueMesh({ v, interactive }: { v: PlacedVenue; interactive: boolean }) {
  const selectVenue = useWorld((s) => s.selectVenue);
  const near = useWorld((s) => s.nearVenue === v.id);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    selectVenue(v);
  };
  return (
    <group position={[v.x, 0, v.z]} rotation={[0, v.rot, 0]}>
      {/* plaza */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[v.w + 6, 0.2, v.d + 6]} />
        <meshStandardMaterial color="#B9BCC2" roughness={1} />
      </mesh>
      {/* building */}
      <mesh position={[0, 0.2 + v.h / 2, 0]} castShadow receiveShadow onClick={onClick}>
        <boxGeometry args={[v.w, v.h, v.d]} />
        <meshStandardMaterial color="#E8DCC8" flatShading roughness={0.9} />
      </mesh>
      {/* accent band and door */}
      <mesh position={[0, 0.2 + v.h - 0.6, 0]}>
        <boxGeometry args={[v.w + 0.2, 1.2, v.d + 0.2]} />
        <meshStandardMaterial color={v.color} flatShading roughness={0.7} emissive={v.color} emissiveIntensity={near ? 0.6 : 0.15} />
      </mesh>
      <mesh position={[0, 1.4, v.d / 2 + 0.05]}>
        <boxGeometry args={[2.2, 2.6, 0.1]} />
        <meshStandardMaterial color="#1B2436" roughness={0.4} />
      </mesh>
      <Billboard position={[0, v.h + 2.4, 0]} follow lockX lockZ>
        <Text font={FONT} fontSize={1.1} color="#FFFFFF" outlineWidth={0.06} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
          {v.name}
        </Text>
      </Billboard>
    </group>
  );
}
