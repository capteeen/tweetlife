'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// The private jet: a long-nosed business jet with swept wings, a T-tail and two engines on the rear fuselage.
// Built facing +z like every vehicle, wheels on y = 0. `stripe` paints the cheatline and the tail.

const mat = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.35} metalness={0.35} {...extra} />;

export function PrivateJet({ stripe = '#1D9BF0', gearDown = true, scale = 1 }: { stripe?: string; gearDown?: boolean; scale?: number }) {
  const white = mat('#F6F7F9');
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.emissiveIntensity = Math.sin(clock.elapsedTime * 6) > 0.6 ? 3 : 0.2;
  });
  const y = 1.25; // fuselage centre line
  return (
    <group scale={scale}>
      {/* fuselage, nose and tail cone */}
      <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 6.4, 14]} />
        {white}
      </mesh>
      <mesh position={[0, y, 4.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.62, 2, 14]} />
        {white}
      </mesh>
      <mesh position={[0, y + 0.12, -4.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.62, 2.2, 14]} />
        {white}
      </mesh>
      {/* cheatline and cockpit glass */}
      <mesh position={[0, y - 0.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.635, 0.635, 6.6, 14, 1, true, Math.PI * 0.05, Math.PI * 0.12]} />
        {mat(stripe, { side: THREE.DoubleSide })}
      </mesh>
      <mesh position={[0, y - 0.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.635, 0.635, 6.6, 14, 1, true, Math.PI * 1.83, Math.PI * 0.12]} />
        {mat(stripe, { side: THREE.DoubleSide })}
      </mesh>
      <mesh position={[0, y + 0.32, 3.7]} rotation={[0.55, 0, 0]}>
        <boxGeometry args={[0.8, 0.28, 0.7]} />
        {mat('#1B2436', { roughness: 0.1, metalness: 0.6 })}
      </mesh>
      {/* cabin windows */}
      {[-1, 1].map((s) =>
        Array.from({ length: 6 }, (_, i) => (
          <mesh key={`${s}${i}`} position={[s * 0.6, y + 0.18, 2.2 - i * 0.75]}>
            <boxGeometry args={[0.06, 0.24, 0.32]} />
            {mat('#1B2436', { roughness: 0.1 })}
          </mesh>
        )),
      )}
      {/* swept wings with winglets */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.5, y - 0.35, 0.2]} rotation={[0, s * 0.42, 0]}>
          <mesh position={[s * 2.4, 0, 0]} castShadow>
            <boxGeometry args={[4.8, 0.12, 1.3]} />
            {white}
          </mesh>
          <mesh position={[s * 4.75, 0.4, -0.2]} rotation={[0, 0, s * -0.25]}>
            <boxGeometry args={[0.1, 0.8, 0.7]} />
            {mat(stripe)}
          </mesh>
        </group>
      ))}
      {/* rear engines on pylons */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.15, y + 0.35, -2.4]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.36, 0.3, 1.9, 12]} />
            {mat('#D7DCE2')}
          </mesh>
          <mesh position={[0, 0, 0.96]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.04, 12]} />
            {mat('#2A2F36')}
          </mesh>
          <mesh position={[-s * 0.45, 0, 0]}>
            <boxGeometry args={[0.6, 0.1, 0.6]} />
            {white}
          </mesh>
        </group>
      ))}
      {/* T-tail */}
      <mesh position={[0, y + 1.3, -4.4]} rotation={[-0.45, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 2.1, 1.3]} />
        {mat(stripe)}
      </mesh>
      <mesh position={[0, y + 2.25, -4.95]} castShadow>
        <boxGeometry args={[3.2, 0.1, 0.9]} />
        {white}
      </mesh>
      <mesh position={[0, y + 2.35, -5.0]}>
        <sphereGeometry args={[0.09, 6, 6]} />
        <meshStandardMaterial ref={beacon} color="#FF3B30" emissive="#FF3B30" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* landing gear */}
      {gearDown &&
        ([[0, 3.3], [-0.9, -0.3], [0.9, -0.3]] as const).map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.08, 0.6, 0.08]} />
              {mat('#9AA3AD')}
            </mesh>
            <mesh position={[0, 0.17, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.17, 0.17, 0.14, 10]} />
              {mat('#141414')}
            </mesh>
          </group>
        ))}
    </group>
  );
}
