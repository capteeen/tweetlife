'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Furniture } from '@/lib/life/home';
import { ModernFurnitureMesh } from './ModernFurniture';

// Low-poly furniture, one component per model. Each piece is modelled centred on the origin, standing on
// y = 0, facing +z; the room places and rotates it. `lit` is false during an outage (powered pieces go dark).

const WOOD = '#A67B5B';
const DARK = '#1B2436';
const METAL = '#9AA6B8';

function Box({ p, s, c, flat = true, e }: { p: [number, number, number]; s: [number, number, number]; c: string; flat?: boolean; e?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} flatShading={flat} roughness={0.85} emissive={e ? c : '#000000'} emissiveIntensity={e ?? 0} />
    </mesh>
  );
}

function Cyl({ p, r, h, c, rt }: { p: [number, number, number]; r: number; h: number; c: string; rt?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, 12]} />
      <meshStandardMaterial color={c} flatShading roughness={0.8} />
    </mesh>
  );
}

export function FurnitureMesh({ item, lit }: { item: Furniture; lit: boolean }) {
  const c = item.color;
  switch (item.model) {
    case 'chair':
      return (
        <group>
          <Box p={[0, 0.45, 0]} s={[0.8, 0.08, 0.8]} c={c} />
          <Box p={[0, 0.85, -0.36]} s={[0.8, 0.8, 0.08]} c={c} />
          {[[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.22, z]} s={[0.07, 0.44, 0.07]} c={c} />
          ))}
        </group>
      );
    case 'sofa':
      return (
        <group>
          <Box p={[0, 0.25, 0]} s={[3.2, 0.5, 1.4]} c={c} />
          <Box p={[0, 0.55, 0.1]} s={[2.6, 0.2, 1.0]} c={c} />
          <Box p={[0, 0.8, -0.55]} s={[3.2, 0.9, 0.3]} c={c} />
          <Box p={[-1.45, 0.65, 0]} s={[0.3, 0.6, 1.4]} c={c} />
          <Box p={[1.45, 0.65, 0]} s={[0.3, 0.6, 1.4]} c={c} />
        </group>
      );
    case 'mattress':
      return (
        <group>
          <Box p={[0, 0.15, 0]} s={[2.2, 0.3, 3.2]} c={c} />
          <Box p={[0, 0.36, -1.2]} s={[1.6, 0.16, 0.6]} c="#F4F1DE" />
        </group>
      );
    case 'bedframe':
      return (
        <group>
          <Box p={[0, 0.3, 0]} s={[2.4, 0.2, 3.4]} c={c} />
          <Box p={[0, 0.55, 0]} s={[2.2, 0.3, 3.2]} c="#E9EDC9" />
          <Box p={[0, 1.0, -1.65]} s={[2.4, 1.2, 0.12]} c={c} />
          <Box p={[0, 0.76, -1.2]} s={[1.6, 0.16, 0.6]} c="#FFFFFF" />
          {[[-1.1, -1.6], [1.1, -1.6], [-1.1, 1.6], [1.1, 1.6]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.15, z]} s={[0.12, 0.3, 0.12]} c={c} />
          ))}
        </group>
      );
    case 'kingbed':
      return (
        <group>
          <Box p={[0, 0.35, 0]} s={[3.2, 0.3, 3.6]} c={DARK} />
          <Box p={[0, 0.65, 0]} s={[3.0, 0.35, 3.4]} c={c} />
          <Box p={[0, 0.9, 0.5]} s={[3.0, 0.16, 2.2]} c="#8338EC" />
          <Box p={[0, 1.3, -1.75]} s={[3.4, 1.6, 0.16]} c={DARK} />
          {[-0.75, 0.75].map((x) => (
            <Box key={x} p={[x, 0.9, -1.25]} s={[1.2, 0.18, 0.6]} c="#FFFFFF" />
          ))}
        </group>
      );
    case 'bucket':
      return (
        <group>
          <Cyl p={[0, 0.3, 0]} r={0.28} rt={0.34} h={0.6} c={c} />
          <Cyl p={[0.55, 0.08, 0.1]} r={0.2} rt={0.3} h={0.16} c="#E63946" />
        </group>
      );
    case 'shower':
      return (
        <group>
          <Box p={[0, 0.06, 0]} s={[1.6, 0.12, 1.6]} c="#FFFFFF" />
          <Box p={[0, 1.2, -0.75]} s={[1.6, 2.4, 0.1]} c={c} />
          <Box p={[-0.75, 1.2, 0]} s={[0.1, 2.4, 1.6]} c={c} />
          <Cyl p={[0, 2.2, -0.4]} r={0.03} h={0.6} c={METAL} />
          <Cyl p={[0, 2.15, -0.1]} r={0.18} h={0.06} c={METAL} />
          <Box p={[-0.6, 1.7, -0.6]} s={[0.25, 0.4, 0.25]} c="#F4F1DE" />
        </group>
      );
    case 'table':
      return (
        <group>
          <Box p={[0, 0.7, 0]} s={[1.4, 0.08, 1.0]} c={c} />
          {[[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.33, z]} s={[0.08, 0.66, 0.08]} c={c} />
          ))}
        </group>
      );
    case 'dining':
      return (
        <group>
          <Box p={[0, 0.75, 0]} s={[2.4, 0.1, 1.2]} c={c} />
          {[[-1.0, -0.4], [1.0, -0.4], [-1.0, 0.4], [1.0, 0.4]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.35, z]} s={[0.1, 0.7, 0.1]} c={c} />
          ))}
          {[[-0.6, 1.1, 0], [0.6, 1.1, 0], [-0.6, -1.1, Math.PI], [0.6, -1.1, Math.PI]].map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
              <Box p={[0, 0.45, 0]} s={[0.6, 0.06, 0.6]} c={WOOD} />
              <Box p={[0, 0.8, 0.27]} s={[0.6, 0.7, 0.06]} c={WOOD} />
            </group>
          ))}
        </group>
      );
    case 'bulb':
      return (
        <group position={[0, 3.9, 0]}>
          <Cyl p={[0, 0, 0]} r={0.02} h={0.6} c={DARK} />
          <mesh position={[0, -0.4, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color={lit ? '#FFF2C7' : '#CFCFCF'} emissive="#FFD089" emissiveIntensity={lit ? 2.2 : 0} />
          </mesh>
          {lit && <pointLight position={[0, -0.5, 0]} intensity={14} distance={12} color="#FFE2A8" decay={2} />}
        </group>
      );
    case 'chandelier':
      return (
        <group position={[0, 3.6, 0]}>
          <Cyl p={[0, 0.3, 0]} r={0.02} h={0.6} c={METAL} />
          <Cyl p={[0, -0.05, 0]} r={0.55} rt={0.2} h={0.3} c="#D4C3A5" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.5, -0.2, Math.sin(a) * 0.5]}>
                <sphereGeometry args={[0.09, 8, 6]} />
                <meshStandardMaterial color={lit ? '#FFF6D8' : '#CFCFCF'} emissive="#FFD089" emissiveIntensity={lit ? 2.5 : 0} />
              </mesh>
            );
          })}
          {lit && <pointLight position={[0, -0.4, 0]} intensity={26} distance={16} color="#FFE2A8" decay={2} />}
        </group>
      );
    case 'fan':
      return <Fan lit={lit} />;
    case 'ac':
      return (
        <group position={[0, 3.1, 0]}>
          <Box p={[0, 0, 0]} s={[1.6, 0.5, 0.4]} c={c} flat={false} />
          <Box p={[0, -0.2, 0.21]} s={[1.4, 0.06, 0.02]} c={lit ? '#06D6A0' : '#4B5563'} e={lit ? 0.8 : 0} />
        </group>
      );
    case 'cooler':
      return (
        <group>
          <Box p={[0, 0.35, 0]} s={[1.1, 0.7, 0.8]} c={c} />
          <Box p={[0, 0.74, 0]} s={[1.12, 0.1, 0.82]} c="#FFFFFF" />
        </group>
      );
    case 'fridge':
      return (
        <group>
          <Box p={[0, 1.0, 0]} s={[1.2, 2.0, 1.1]} c={c} flat={false} />
          <Box p={[0, 1.3, 0.56]} s={[1.1, 0.02, 0.02]} c={DARK} />
          <Box p={[0.45, 0.8, 0.57]} s={[0.05, 0.6, 0.04]} c={METAL} />
          <Box p={[0.45, 1.6, 0.57]} s={[0.05, 0.4, 0.04]} c={METAL} />
        </group>
      );
    case 'tv':
      return (
        <group position={[0, 2.0, 0.18]}>
          <Box p={[0, 0, 0]} s={[2.6, 1.5, 0.08]} c={DARK} flat={false} />
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[2.4, 1.3]} />
            <meshStandardMaterial color={lit ? '#2A6FD6' : '#111827'} emissive={lit ? '#3A86FF' : '#000000'} emissiveIntensity={lit ? 1.4 : 0} />
          </mesh>
          <Box p={[0, -1.75, 0.3]} s={[1.8, 0.5, 0.5]} c={WOOD} />
        </group>
      );
    case 'console':
      return (
        <group>
          <Box p={[0, 0.3, 0]} s={[1.6, 0.6, 0.6]} c={WOOD} />
          <Box p={[0, 2.0, 0.2]} s={[2.4, 1.4, 0.08]} c={DARK} flat={false} />
          <mesh position={[0, 2.0, 0.25]}>
            <planeGeometry args={[2.2, 1.2]} />
            <meshStandardMaterial color={lit ? '#2D6A4F' : '#111827'} emissive={lit ? '#06D6A0' : '#000000'} emissiveIntensity={lit ? 1.2 : 0} />
          </mesh>
          <Box p={[-0.4, 0.68, 0]} s={[0.5, 0.16, 0.35]} c="#FFFFFF" flat={false} />
          <Box p={[0.5, 0.7, 0.1]} s={[0.3, 0.1, 0.2]} c={c} />
        </group>
      );
    case 'generator':
      return (
        <group>
          <Box p={[0, 0.4, 0]} s={[1.4, 0.8, 0.9]} c={c} />
          <Box p={[0.3, 0.9, 0]} s={[0.6, 0.2, 0.6]} c={DARK} />
          <Cyl p={[-0.4, 1.0, 0]} r={0.08} h={0.5} c={DARK} />
          {[[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.08, z]} r={0.1} h={0.16} c={DARK} />
          ))}
        </group>
      );
    default:
      return <ModernFurnitureMesh item={item} lit={lit} />;
  }
}

function Fan({ lit }: { lit: boolean }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current && lit) blades.current.rotation.z += dt * 12;
  });
  return (
    <group>
      <Cyl p={[0, 0.05, 0]} r={0.4} h={0.1} c={METAL} />
      <Cyl p={[0, 0.7, 0]} r={0.04} h={1.3} c={METAL} />
      <group position={[0, 1.4, 0.1]} ref={blades}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i / 3) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.12, 0.6, 0.03]} />
            <meshStandardMaterial color="#BFE3FF" />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 1.4, 0.1]}>
        <torusGeometry args={[0.42, 0.03, 6, 20]} />
        <meshStandardMaterial color={METAL} />
      </mesh>
    </group>
  );
}
