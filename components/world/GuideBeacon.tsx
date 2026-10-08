'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useWorld } from './store';

// Where the first-day guide wants you to go: a column of light you can see over the rooftops, and an arrow
// bobbing over the spot. Two meshes, drawn only while the guide points somewhere.

const COLOR = new THREE.Color('#FFD166');

export function GuideBeacon() {
  const guide = useWorld((s) => s.guide);
  const arrow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (arrow.current) {
      arrow.current.position.y = 5.2 + Math.sin(t * 3) * 0.5;
      arrow.current.rotation.y = t * 1.5;
    }
    if (ring.current) {
      const k = 1 + ((t * 0.8) % 1) * 1.6;
      ring.current.scale.set(k, k, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - ((t * 0.8) % 1));
    }
  });
  if (!guide) return null;
  return (
    <group position={[guide.x, 0, guide.z]}>
      <mesh position={[0, 20, 0]} renderOrder={5}>
        <cylinderGeometry args={[0.9, 1.3, 40, 16, 1, true]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={arrow} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.9, 1.8, 4]} />
        <meshBasicMaterial color={COLOR} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.6, 32]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </group>
  );
}
