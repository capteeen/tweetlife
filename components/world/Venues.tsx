'use client';
import { useMemo } from 'react';
import { Billboard, Html, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { useWorld } from './store';

const FONT = '/fonts/inter-600.woff';

// The city's venues: distinct, signed, in districts on a ring just outside the post blocks, each with an
// icon pin above it. Tap the building or the pin to open its sheet.
export function Venues({ contentRadius, boundaryRadius, interactive }: { contentRadius: number; boundaryRadius: number; interactive: boolean }) {
  const venues = useMemo(() => placeVenues(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);
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
  const pin = (
    <Html center zIndexRange={[12, 0]} style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      <button
        onClick={() => interactive && selectVenue(v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 transition hover:scale-110"
        style={{ ['--tw-ring-color' as string]: v.color }}
        aria-label={v.name}
      >
        {v.emoji}
      </button>
    </Html>
  );
  if (v.custom) {
    // drawn by the scene that owns it (the airport terminal); only the pin and the name live here
    return (
      <group position={[v.x, 0, v.z]}>
        <group position={[0, v.h + 6, 0]}>{pin}</group>
        <mesh position={[0, v.h / 2, 0]} onClick={onClick} visible={false}>
          <boxGeometry args={[v.w, v.h, v.d]} />
        </mesh>
      </group>
    );
  }
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
      {/* accent band, awning, door and planters */}
      <mesh position={[0, 0.2 + v.h - 0.6, 0]}>
        <boxGeometry args={[v.w + 0.2, 1.2, v.d + 0.2]} />
        <meshStandardMaterial color={v.color} flatShading roughness={0.7} emissive={v.color} emissiveIntensity={near ? 0.6 : 0.15} />
      </mesh>
      <mesh position={[0, 3.1, v.d / 2 + 0.9]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[5, 0.12, 2]} />
        <meshStandardMaterial color={v.color} flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.4, v.d / 2 + 0.05]}>
        <boxGeometry args={[2.2, 2.6, 0.1]} />
        <meshStandardMaterial color="#1B2436" roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 3.6, 0.2, v.d / 2 + 1.4]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[1, 0.7, 1]} />
            <meshStandardMaterial color="#8B6B4A" flatShading />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <icosahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#4FA653" flatShading />
          </mesh>
        </group>
      ))}
      <Billboard position={[0, v.h + 2.4, 0]} follow lockX lockZ>
        <Text font={FONT} fontSize={1.1} color="#FFFFFF" outlineWidth={0.06} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
          {v.name}
        </Text>
      </Billboard>
      <group position={[0, v.h + 5.4, 0]}>{pin}</group>
    </group>
  );
}
