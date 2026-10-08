'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { useWorld } from './store';
import { WalkInVenue } from './Interiors';
import { FaceCamera } from './FaceCamera';

const FONT = '/fonts/inter-600.woff';

// The city's venues: distinct, signed, in districts on a ring just outside the post blocks, each with an
// icon pin above it. Tap the building or the pin to open its sheet.
export function Venues({ contentRadius, boundaryRadius, interactive }: { contentRadius: number; boundaryRadius: number; interactive: boolean }) {
  const country = useWorld((s) => s.country);
  const venues = useMemo(() => placeVenues(contentRadius, boundaryRadius, country), [contentRadius, boundaryRadius, country]);
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
  if (v.walkIn) {
    return (
      <group position={[v.x, 0, v.z]} rotation={[0, v.rot, 0]}>
        <WalkInVenue v={v} near={near} onClick={onClick} />
        <group position={[0, v.h + 3.4, 0]}>{pin}</group>
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
      {v.id === 'suya' && <SuyaGrill z={v.d / 2 + 2.6} />}
      {v.id === 'barber' && <BarberPole x={2.2} z={v.d / 2 + 0.3} />}
      <FaceCamera position={[0, v.h + 2.4, 0]}>
        <Text font={FONT} fontSize={1.1} color="#FFFFFF" outlineWidth={0.06} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
          {v.name}
        </Text>
      </FaceCamera>
      <group position={[0, v.h + 5.4, 0]}>{pin}</group>
    </group>
  );
}

/** A charcoal grill in front of the Suya Spot: glowing coals, sticks of suya, smoke. */
function SuyaGrill({ z }: { z: number }) {
  const smoke = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    smoke.current?.children.forEach((p, i) => {
      const t = (clock.elapsedTime * 0.5 + i / 4) % 1;
      p.position.set(Math.sin(t * 6 + i) * 0.2, 1.3 + t * 2.6, 0);
      p.scale.setScalar(0.25 + t * 0.6);
      ((p as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - t);
    });
  });
  return (
    <group position={[-2.6, 0.2, z]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[2, 0.9, 0.8]} />
        <meshStandardMaterial color="#3A3A3A" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[1.8, 0.04, 0.6]} />
        <meshStandardMaterial color="#FF6B00" emissive="#FF4500" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {[-0.6, -0.2, 0.2, 0.6].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
          <meshStandardMaterial color="#7B3F1D" roughness={0.9} />
        </mesh>
      ))}
      <group ref={smoke}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.5, 8, 6]} />
            <meshStandardMaterial color="#CFCFCF" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.8 + 3, 0.25, 1.4]} castShadow>
          <boxGeometry args={[1.6, 0.5, 0.5]} />
          <meshStandardMaterial color="#8B6B4A" />
        </mesh>
      ))}
    </group>
  );
}

/** A turning barber's pole by the Fresh Cuts door. */
function BarberPole({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d')!;
    const cols = ['#E63946', '#FFFFFF', '#1D9BF0', '#FFFFFF'];
    for (let i = -8; i < 16; i++) {
      g.fillStyle = cols[((i % 4) + 4) % 4];
      g.beginPath();
      g.moveTo(0, i * 16);
      g.lineTo(64, i * 16 - 32);
      g.lineTo(64, i * 16 - 16);
      g.lineTo(0, i * 16 + 16);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  useFrame((_, dt) => {
    tex.offset.y += dt * 0.4;
  });
  return (
    <group position={[x, 0.2, z]}>
      <mesh ref={ref} position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 1.4, 16]} />
        <meshStandardMaterial map={tex} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={0.3} />
      </mesh>
      {[0.85, 2.35].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <sphereGeometry args={[0.2, 12, 8]} />
          <meshStandardMaterial color="#C9A227" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
