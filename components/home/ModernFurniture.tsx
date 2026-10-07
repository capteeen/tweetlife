'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Furniture } from '@/lib/life/home';

// The modern catalogue's models. Same conventions as Furniture.tsx: centred on the origin, standing on y = 0,
// facing +z. Seats keep their back at -z and the seat around y = 0.45, beds their pillow at -z and the
// mattress top near y = 0.75, so the avatar's sit and lie poses land the same way on every piece.

const DARK = '#1B2436';
const METAL = '#9AA6B8';
const GOLD = '#D4AF37';
const WHITE = '#F4F1DE';
const GLASS = '#BFE3FF';

function Box({ p, s, c, flat = true, e, r }: { p: [number, number, number]; s: [number, number, number]; c: string; flat?: boolean; e?: number; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} flatShading={flat} roughness={0.8} emissive={e ? c : '#000000'} emissiveIntensity={e ?? 0} />
    </mesh>
  );
}

function Cyl({ p, r, h, c, rt, e }: { p: [number, number, number]; r: number; h: number; c: string; rt?: number; e?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, 14]} />
      <meshStandardMaterial color={c} flatShading roughness={0.7} emissive={e ? c : '#000000'} emissiveIntensity={e ?? 0} />
    </mesh>
  );
}

function Glass({ p, s }: { p: [number, number, number]; s: [number, number, number] }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={GLASS} transparent opacity={0.45} roughness={0.1} metalness={0.2} />
    </mesh>
  );
}

function Screen({ p, s, on, color = '#2A6FD6', glow = '#3A86FF' }: { p: [number, number, number]; s: [number, number]; on: boolean; color?: string; glow?: string }) {
  return (
    <mesh position={p}>
      <planeGeometry args={s} />
      <meshStandardMaterial color={on ? color : '#0F1522'} emissive={on ? glow : '#000000'} emissiveIntensity={on ? 1.3 : 0} />
    </mesh>
  );
}

function Glow({ p, color, on, intensity = 10, distance = 8 }: { p: [number, number, number]; color: string; on: boolean; intensity?: number; distance?: number }) {
  return on ? <pointLight position={p} intensity={intensity} distance={distance} color={color} decay={2} /> : null;
}

export function ModernFurnitureMesh({ item, lit }: { item: Furniture; lit: boolean }) {
  const c = item.color;
  switch (item.model) {
    // ----- seating -----
    case 'beanbag':
      return (
        <group>
          <mesh position={[0, 0.42, 0]} scale={[1, 0.7, 1]} castShadow receiveShadow>
            <sphereGeometry args={[0.7, 14, 10]} />
            <meshStandardMaterial color={c} flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 0.78, -0.15]} scale={[0.9, 0.5, 0.8]} castShadow>
            <sphereGeometry args={[0.45, 12, 8]} />
            <meshStandardMaterial color={c} flatShading roughness={1} />
          </mesh>
        </group>
      );
    case 'sectional':
      return (
        <group>
          {/* long side along x, chaise sticking out towards +z on the right */}
          <Box p={[0, 0.22, -0.4]} s={[3.6, 0.44, 1.5]} c={c} />
          <Box p={[0, 0.5, -0.3]} s={[3.3, 0.16, 1.1]} c={c} />
          <Box p={[0, 0.8, -1.0]} s={[3.6, 0.8, 0.3]} c={c} />
          <Box p={[1.25, 0.22, 0.8]} s={[1.1, 0.44, 1.6]} c={c} />
          <Box p={[1.25, 0.5, 0.8]} s={[0.95, 0.16, 1.4]} c={c} />
          <Box p={[-1.7, 0.6, -0.4]} s={[0.2, 0.5, 1.5]} c={c} />
          <Box p={[0.9, 0.6, 1.5]} s={[1.8, 0.5, 0.2]} c={c} />
          <Box p={[-0.9, 0.68, -0.6]} s={[0.5, 0.2, 0.5]} c={WHITE} />
        </group>
      );
    case 'recliner':
      return (
        <group>
          <Box p={[0, 0.22, 0.1]} s={[1.2, 0.44, 1.3]} c={c} />
          <Box p={[0, 0.5, 0.15]} s={[1.0, 0.16, 1.0]} c={c} />
          <Box p={[0, 0.95, -0.55]} s={[1.2, 1.1, 0.35]} c={c} r={[-0.25, 0, 0]} />
          <Box p={[-0.52, 0.65, 0.1]} s={[0.16, 0.5, 1.2]} c={c} />
          <Box p={[0.52, 0.65, 0.1]} s={[0.16, 0.5, 1.2]} c={c} />
          <Box p={[0, 0.2, 0.9]} s={[1.0, 0.2, 0.5]} c={c} />
          <Box p={[0.45, 0.72, 0.1]} s={[0.1, 0.05, 0.3]} c={lit ? '#06D6A0' : DARK} e={lit ? 0.8 : 0} />
        </group>
      );
    // ----- sleep -----
    case 'platformbed':
      return (
        <group>
          <Box p={[0, 0.25, 0]} s={[3.0, 0.3, 3.6]} c={c} />
          <Box p={[0, 0.58, 0]} s={[2.8, 0.36, 3.4]} c={WHITE} />
          <Box p={[0, 0.78, 0.4]} s={[2.8, 0.1, 2.4]} c="#4B5563" />
          <Box p={[0, 1.2, -1.78]} s={[3.2, 1.2, 0.14]} c={c} />
          {[-0.7, 0.7].map((x) => (
            <Box key={x} p={[x, 0.82, -1.3]} s={[1.1, 0.16, 0.6]} c="#FFFFFF" />
          ))}
          {/* under-glow strip */}
          <Box p={[0, 0.08, 0]} s={[2.6, 0.04, 3.2]} c={lit ? '#8338EC' : '#2a1f4e'} e={lit ? 1.5 : 0} />
          <Glow p={[0, 0.2, 0]} color="#8338EC" on={lit} intensity={6} distance={6} />
        </group>
      );
    // ----- bathroom -----
    case 'jacuzzi':
      return (
        <group>
          <Box p={[0, 0.35, 0]} s={[2.0, 0.7, 2.0]} c={c} flat={false} />
          <Box p={[0, 0.66, 0]} s={[1.7, 0.1, 1.7]} c={lit ? '#7FD1F5' : '#5F8EA6'} e={lit ? 0.5 : 0} />
          <Box p={[0, 0.73, 0]} s={[1.5, 0.04, 1.5]} c="#D9F3FF" flat={false} />
          <Cyl p={[0.6, 0.9, -0.75]} r={0.03} h={0.4} c={METAL} />
          <Cyl p={[0.6, 1.1, -0.6]} r={0.03} h={0.3} c={METAL} />
          <Glow p={[0, 0.9, 0]} color="#7FD1F5" on={lit} intensity={6} distance={5} />
        </group>
      );
    // ----- kitchen -----
    case 'airfryer':
      return (
        <group>
          <Box p={[0, 0.45, 0]} s={[0.8, 0.9, 0.8]} c="#E8DCC8" />
          <Box p={[0, 1.2, 0]} s={[0.6, 0.6, 0.6]} c={c} flat={false} />
          <Box p={[0, 1.3, 0.31]} s={[0.4, 0.14, 0.02]} c={lit ? '#F28C28' : '#333'} e={lit ? 1 : 0} />
          <Box p={[0, 1.05, 0.33]} s={[0.5, 0.06, 0.06]} c={METAL} />
        </group>
      );
    case 'coffee':
      return (
        <group>
          <Box p={[0, 0.45, 0]} s={[0.8, 0.9, 0.7]} c="#E8DCC8" />
          <Box p={[0, 1.25, -0.1]} s={[0.7, 0.7, 0.4]} c={c} flat={false} />
          <Box p={[0, 1.05, 0.2]} s={[0.5, 0.08, 0.3]} c={DARK} />
          <Cyl p={[0, 1.25, 0.25]} r={0.05} h={0.3} c={DARK} />
          <Cyl p={[0.15, 1.0, 0.25]} r={0.07} h={0.12} c={WHITE} />
          <Box p={[-0.2, 1.5, 0.21]} s={[0.1, 0.1, 0.02]} c={lit ? '#06D6A0' : '#333'} e={lit ? 1 : 0} />
        </group>
      );
    case 'smartfridge':
      return (
        <group>
          <Box p={[0, 1.05, 0]} s={[1.4, 2.1, 1.1]} c={c} flat={false} />
          <Box p={[0, 1.05, 0.56]} s={[0.02, 2.0, 0.02]} c={DARK} />
          <Screen p={[0.35, 1.5, 0.57]} s={[0.5, 0.7]} on={lit} color="#1D9BF0" glow="#1D9BF0" />
          <Box p={[-0.5, 1.2, 0.58]} s={[0.05, 0.9, 0.04]} c={METAL} />
          <Box p={[0.5, 1.2, 0.58]} s={[0.05, 0.9, 0.04]} c={METAL} />
        </group>
      );
    // ----- entertainment -----
    case 'smarttv':
      return (
        <group position={[0, 0, 0.18]}>
          <Box p={[0, 2.1, 0]} s={[3.4, 1.9, 0.06]} c={DARK} flat={false} />
          <Screen p={[0, 2.1, 0.04]} s={[3.3, 1.8]} on={lit} color="#163B7A" glow="#3A86FF" />
          <Box p={[0, 0.3, 0.3]} s={[2.6, 0.6, 0.5]} c="#2F3A4A" />
          <Box p={[0, 0.63, 0.3]} s={[2.4, 0.06, 0.4]} c={lit ? '#8338EC' : '#2a1f4e'} e={lit ? 1.2 : 0} />
          <Glow p={[0, 2.0, 0.6]} color="#3A86FF" on={lit} intensity={8} distance={7} />
        </group>
      );
    case 'projector':
      return (
        <group position={[0, 0, 0.18]}>
          {/* a screen almost the width of the wall, and a projector on a low cabinet */}
          <Box p={[0, 2.3, 0]} s={[4.6, 2.6, 0.04]} c="#FFFFFF" flat={false} />
          <Screen p={[0, 2.3, 0.03]} s={[4.4, 2.4]} on={lit} color="#2B1B4D" glow="#8338EC" />
          <Box p={[0, 0.3, 0.3]} s={[2.0, 0.6, 0.5]} c={c} />
          <Box p={[0, 0.72, 0.3]} s={[0.5, 0.24, 0.4]} c={DARK} flat={false} />
          <Cyl p={[0, 0.72, 0.52]} r={0.07} h={0.06} c={lit ? '#FFFFFF' : '#333'} e={lit ? 2 : 0} />
          <Glow p={[0, 2.0, 0.8]} color="#8338EC" on={lit} intensity={10} distance={9} />
        </group>
      );
    // ----- power -----
    case 'inverter':
      return (
        <group>
          <Box p={[0, 0.3, 0]} s={[1.0, 0.6, 0.6]} c="#2F3A4A" flat={false} />
          <Box p={[0, 0.85, -0.1]} s={[0.6, 0.5, 0.3]} c="#E8DCC8" flat={false} />
          <Box p={[0, 0.9, 0.06]} s={[0.4, 0.14, 0.02]} c={lit ? c : '#333'} e={lit ? 1 : 0} />
          {/* a lean-to solar panel */}
          <Box p={[0, 1.35, -0.55]} s={[1.2, 0.04, 0.9]} c="#0B2A5A" flat={false} r={[-0.6, 0, 0]} />
        </group>
      );
    // ----- comfort -----
    case 'towerfan':
      return <TowerFan lit={lit} c={c} />;
    case 'inverterac':
      return (
        <group position={[0, 3.1, 0]}>
          <Box p={[0, 0, 0]} s={[1.8, 0.45, 0.4]} c={c} flat={false} />
          <Box p={[0, -0.16, 0.21]} s={[1.6, 0.08, 0.02]} c={lit ? '#7FD1F5' : '#4B5563'} e={lit ? 0.8 : 0} />
          <Box p={[0.7, 0.08, 0.21]} s={[0.12, 0.05, 0.01]} c={lit ? '#06D6A0' : '#333'} e={lit ? 1 : 0} />
        </group>
      );
    // ----- tables -----
    case 'glasstable':
      return (
        <group>
          <Glass p={[0, 0.5, 0]} s={[1.6, 0.04, 0.9]} />
          {[[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.24, z]} r={0.03} h={0.48} c={GOLD} />
          ))}
          <Box p={[0.3, 0.56, 0]} s={[0.4, 0.08, 0.3]} c={WHITE} />
        </group>
      );
    case 'marbledining':
      return (
        <group>
          <Box p={[0, 0.76, 0]} s={[3.0, 0.1, 1.4]} c={c} flat={false} />
          <Box p={[-1.1, 0.35, 0]} s={[0.2, 0.7, 1.0]} c={c} flat={false} />
          <Box p={[1.1, 0.35, 0]} s={[0.2, 0.7, 1.0]} c={c} flat={false} />
          {[[-1.0, 1.0, 0], [0, 1.0, 0], [1.0, 1.0, 0], [-1.0, -1.0, Math.PI], [0, -1.0, Math.PI], [1.0, -1.0, Math.PI]].map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
              <Cyl p={[0, 0.45, 0]} r={0.26} h={0.08} c={DARK} />
              <Cyl p={[0, 0.22, 0]} r={0.03} h={0.44} c={METAL} />
              <Box p={[0, 0.8, 0.22]} s={[0.5, 0.6, 0.06]} c={DARK} />
            </group>
          ))}
        </group>
      );
    // ----- lighting -----
    case 'ledstrips':
      return (
        <group>
          {/* a strip along the top of both walls */}
          <Box p={[0, 3.95, -5.95]} s={[14, 0.06, 0.06]} c={lit ? c : '#2a1f4e'} e={lit ? 2 : 0} />
          <Box p={[6.95, 3.95, 0]} s={[0.06, 0.06, 12]} c={lit ? '#2EC4B6' : '#1f3e3a'} e={lit ? 2 : 0} />
          <Glow p={[0, 3.6, -5.2]} color={c} on={lit} intensity={10} distance={10} />
          <Glow p={[6.2, 3.6, 0]} color="#2EC4B6" on={lit} intensity={10} distance={10} />
        </group>
      );
    case 'pendant':
      return (
        <group position={[0, 3.3, 0]}>
          {[-1.1, 0, 1.1].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <Cyl p={[0, 0.5, 0]} r={0.015} h={0.9} c={DARK} />
              <Cyl p={[0, -0.05, 0]} r={0.28} rt={0.1} h={0.3} c={GOLD} />
              <mesh position={[0, -0.18, 0]}>
                <sphereGeometry args={[0.09, 8, 6]} />
                <meshStandardMaterial color={lit ? '#FFF2C7' : '#CFCFCF'} emissive="#FFD089" emissiveIntensity={lit ? 2.2 : 0} />
              </mesh>
            </group>
          ))}
          <Glow p={[0, -0.4, 0]} color="#FFE2A8" on={lit} intensity={24} distance={16} />
        </group>
      );
    // ----- rugs -----
    case 'rug': {
      const base = item.variant ?? c;
      const designer = item.id === 'rug_designer';
      const shaggy = item.id === 'rug_shaggy';
      return (
        <group position={[0, 0.02, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[5.2, 3.6]} />
            <meshStandardMaterial color={base} roughness={1} />
          </mesh>
          {!shaggy && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
              <planeGeometry args={[4.4, 2.8]} />
              <meshStandardMaterial color={designer ? '#F4F1DE' : '#E6C27A'} roughness={1} />
            </mesh>
          )}
          {designer && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, 0.01, -0.3]}>
              <circleGeometry args={[1.0, 24]} />
              <meshStandardMaterial color="#F28C28" roughness={1} />
            </mesh>
          )}
          {!shaggy && !designer && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <planeGeometry args={[2.6, 1.4]} />
              <meshStandardMaterial color={base} roughness={1} />
            </mesh>
          )}
        </group>
      );
    }
    // ----- workspace -----
    case 'homeoffice':
      return (
        <group>
          <Box p={[0, 0.74, 0]} s={[1.5, 0.06, 0.8]} c={c} />
          {[[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} c={DARK} />
          ))}
          <Box p={[0, 0.79, 0]} s={[0.7, 0.03, 0.45]} c={METAL} flat={false} />
          <Box p={[0, 0.98, -0.2]} s={[0.7, 0.4, 0.02]} c={DARK} flat={false} r={[-0.2, 0, 0]} />
          <Screen p={[0, 0.98, -0.185]} s={[0.64, 0.34]} on={lit} />
          <Cyl p={[0.55, 0.9, 0]} r={0.06} h={0.14} c={WHITE} />
          <group position={[0, 0, 0.9]}>
            <Cyl p={[0, 0.45, 0]} r={0.28} h={0.08} c={DARK} />
            <Cyl p={[0, 0.22, 0]} r={0.03} h={0.44} c={METAL} />
            <Box p={[0, 0.8, 0.22]} s={[0.5, 0.6, 0.06]} c={DARK} />
          </group>
        </group>
      );
    case 'standingdesk':
      return (
        <group>
          <Box p={[0, 1.05, 0]} s={[1.8, 0.05, 0.9]} c={c} flat={false} />
          <Box p={[-0.7, 0.52, 0]} s={[0.08, 1.0, 0.08]} c={DARK} />
          <Box p={[0.7, 0.52, 0]} s={[0.08, 1.0, 0.08]} c={DARK} />
          <Box p={[-0.7, 0.03, 0]} s={[0.1, 0.06, 0.8]} c={DARK} />
          <Box p={[0.7, 0.03, 0]} s={[0.1, 0.06, 0.8]} c={DARK} />
          <Box p={[0, 1.4, -0.3]} s={[1.1, 0.6, 0.03]} c={DARK} flat={false} />
          <Screen p={[0, 1.4, -0.28]} s={[1.04, 0.54]} on={lit} color="#1E2A3A" glow="#BFE3FF" />
          <Box p={[0, 1.1, 0.1]} s={[0.8, 0.03, 0.25]} c="#2F3A4A" />
          <Cyl p={[0.6, 1.14, 0.15]} r={0.07} h={0.12} c={WHITE} />
        </group>
      );
    case 'gamingsetup':
      return (
        <group>
          <Box p={[0, 0.74, -0.2]} s={[2.2, 0.06, 0.9]} c={DARK} flat={false} />
          <Box p={[-0.95, 0.37, -0.2]} s={[0.08, 0.72, 0.8]} c={DARK} />
          <Box p={[0.95, 0.37, -0.2]} s={[0.08, 0.72, 0.8]} c={DARK} />
          {/* three monitors, outer ones angled in */}
          {[[-0.75, 0.35], [0, 0], [0.75, -0.35]].map(([x, ry], i) => (
            <group key={i} position={[x, 1.1, -0.55]} rotation={[0, ry, 0]}>
              <Box p={[0, 0, 0]} s={[0.74, 0.46, 0.03]} c={DARK} flat={false} />
              <Screen p={[0, 0, 0.02]} s={[0.68, 0.4]} on={lit} color={i === 1 ? '#1B3F6B' : '#2B1B4D'} glow={i === 1 ? '#3A86FF' : '#8338EC'} />
            </group>
          ))}
          {/* the tower, with an RGB window */}
          <Box p={[0.85, 0.3, 0.1]} s={[0.26, 0.6, 0.6]} c="#0B0E14" flat={false} />
          <Box p={[0.72, 0.3, 0.1]} s={[0.01, 0.4, 0.4]} c={lit ? c : '#2a1f4e'} e={lit ? 1.5 : 0} />
          <Box p={[-0.2, 0.78, 0.05]} s={[0.7, 0.03, 0.22]} c={lit ? c : '#2a1f4e'} e={lit ? 0.8 : 0} />
          {/* gaming chair */}
          <group position={[0, 0, 0.75]}>
            <Cyl p={[0, 0.06, 0]} r={0.32} h={0.06} c={DARK} />
            <Cyl p={[0, 0.25, 0]} r={0.04} h={0.4} c={METAL} />
            <Box p={[0, 0.5, 0]} s={[0.6, 0.12, 0.6]} c={c} />
            <Box p={[0, 1.0, -0.28]} s={[0.6, 0.9, 0.12]} c={c} />
            <Box p={[0, 1.0, -0.21]} s={[0.3, 0.7, 0.01]} c="#0B0E14" />
          </group>
          <Glow p={[0, 1.2, 0.2]} color={c} on={lit} intensity={6} distance={5} />
        </group>
      );
    // ----- plants -----
    case 'plant':
      return <Plant kind={item.variant ?? 'snake'} />;
    // ----- lamps -----
    case 'floorlamp':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.3} h={0.06} c={DARK} />
          <Cyl p={[0, 1.0, 0]} r={0.03} h={2.0} c={GOLD} />
          <mesh position={[0, 2.0, 0.3]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.6, 0.03, 6, 20, Math.PI / 2]} />
            <meshStandardMaterial color={GOLD} />
          </mesh>
          <Cyl p={[0.6, 1.95, 0.3]} r={0.22} rt={0.12} h={0.3} c={DARK} />
          <mesh position={[0.6, 1.8, 0.3]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={lit ? '#FFF2C7' : '#CFCFCF'} emissive="#FFD089" emissiveIntensity={lit ? 2 : 0} />
          </mesh>
          <Glow p={[0.6, 1.6, 0.3]} color="#FFE2A8" on={lit} intensity={10} distance={8} />
        </group>
      );
    case 'smartlamp':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.22} h={0.06} c={DARK} />
          <Cyl p={[0, 0.7, 0]} r={0.12} rt={0.1} h={1.3} c={lit ? c : '#2b4d4a'} e={lit ? 1.4 : 0} />
          <Cyl p={[0, 1.4, 0]} r={0.14} h={0.1} c={DARK} />
          <Glow p={[0, 0.9, 0]} color={c} on={lit} intensity={8} distance={7} />
        </group>
      );
    // ----- bar -----
    case 'barcart':
      return (
        <group>
          {[[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.45, z]} r={0.02} h={0.9} c={GOLD} />
          ))}
          <Glass p={[0, 0.9, 0]} s={[1.0, 0.03, 0.6]} />
          <Glass p={[0, 0.45, 0]} s={[1.0, 0.03, 0.6]} />
          {[[-0.3, '#2EC4B6'], [-0.1, '#E63946'], [0.1, '#FFD166'], [0.3, '#8338EC']].map(([x, col], i) => (
            <Cyl key={i} p={[x as number, 1.05, -0.1]} r={0.05} h={0.3} c={col as string} />
          ))}
          <Cyl p={[0.3, 1.0, 0.18]} r={0.05} rt={0.07} h={0.14} c={GLASS} />
          {[[-0.45, -0.25], [0.45, 0.25]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.05, z]} r={0.06} h={0.1} c={DARK} />
          ))}
        </group>
      );
    case 'minibar':
      return (
        <group>
          <Box p={[0, 0.5, 0]} s={[0.9, 1.0, 0.7]} c={c} flat={false} />
          <Glass p={[0, 0.55, 0.36]} s={[0.7, 0.8, 0.02]} />
          <Box p={[0, 0.55, 0.32]} s={[0.66, 0.76, 0.02]} c={lit ? '#1D9BF0' : '#0B2A5A'} e={lit ? 0.6 : 0} />
          {[0.3, 0.55, 0.8].map((y, i) => (
            <Box key={i} p={[0, y, 0.2]} s={[0.6, 0.02, 0.3]} c={METAL} />
          ))}
          {[[-0.2, 0.42], [0, 0.42], [0.2, 0.42], [-0.2, 0.67], [0.1, 0.67]].map(([x, y], i) => (
            <Cyl key={i} p={[x, y, 0.2]} r={0.035} h={0.2} c={i % 2 ? '#5C1A2B' : '#2D6A4F'} />
          ))}
          <Glow p={[0, 0.6, 0.6]} color="#1D9BF0" on={lit} intensity={3} distance={3} />
        </group>
      );
    // ----- wall art -----
    case 'canvas':
      return (
        <group position={[0, 2.9, 0.12]}>
          <Box p={[0, 0, 0]} s={[2.2, 1.5, 0.06]} c="#FFFFFF" flat={false} />
          <Box p={[-0.4, 0.2, 0.04]} s={[0.9, 0.9, 0.01]} c={item.variant ?? c} />
          <Box p={[0.5, -0.3, 0.05]} s={[0.7, 0.5, 0.01]} c="#1D9BF0" />
          <Cyl p={[0.3, 0.35, 0.05]} r={0.25} h={0.01} c="#0B0E14" />
        </group>
      );
    case 'neon':
      return (
        <group position={[0, 2.9, 0.1]}>
          <Box p={[0, 0, 0]} s={[2.4, 0.9, 0.02]} c="#15131a" flat={false} />
          {/* a scribble of tubes */}
          <mesh position={[-0.6, 0.1, 0.03]}>
            <torusGeometry args={[0.28, 0.03, 6, 20]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={lit ? 2.5 : 0} />
          </mesh>
          <Box p={[0.1, 0.0, 0.03]} s={[0.9, 0.06, 0.06]} c={c} e={lit ? 2.5 : 0} />
          <Box p={[0.6, 0.0, 0.03]} s={[0.06, 0.6, 0.06]} c={c} e={lit ? 2.5 : 0} />
          <Box p={[0.1, -0.25, 0.03]} s={[1.3, 0.05, 0.05]} c="#2EC4B6" e={lit ? 2 : 0} />
          <Glow p={[0, 0, 0.6]} color={c} on={lit} intensity={10} distance={7} />
        </group>
      );
    case 'gallery':
      return (
        <group position={[0, 2.8, 0.1]}>
          {[-1, 0, 1].map((ix) =>
            [-1, 0, 1].map((iy) => {
              const cols = ['#F28C28', '#1D9BF0', '#2D6A4F', '#E63946', '#8338EC', '#FFD166', '#06D6A0', '#FF5D8F', '#5C4033'];
              return (
                <group key={`${ix}${iy}`} position={[ix * 0.85, iy * 0.65, 0]}>
                  <Box p={[0, 0, 0]} s={[0.72, 0.52, 0.04]} c={DARK} flat={false} />
                  <Box p={[0, 0, 0.03]} s={[0.6, 0.4, 0.01]} c={cols[(ix + 1) * 3 + iy + 1]} />
                </group>
              );
            }),
          )}
        </group>
      );
    // ----- sound -----
    case 'speaker':
      return (
        <group>
          <Cyl p={[0, 0.3, 0]} r={0.16} h={0.6} c={c} />
          <Cyl p={[0, 0.3, 0]} r={0.165} h={0.4} c="#2F3A4A" />
          <Cyl p={[0, 0.62, 0]} r={0.1} h={0.02} c={lit ? '#1D9BF0' : '#333'} e={lit ? 1.5 : 0} />
        </group>
      );
    case 'soundbar':
      return (
        <group>
          <Box p={[0, 0.3, 0]} s={[1.6, 0.6, 0.5]} c={DARK} />
          <Box p={[0, 0.7, 0]} s={[1.6, 0.14, 0.14]} c={c} flat={false} />
          <Box p={[0.6, 0.7, 0.08]} s={[0.2, 0.03, 0.01]} c={lit ? '#06D6A0' : '#333'} e={lit ? 1.5 : 0} />
          <Cyl p={[-0.3, 0.3, 0.26]} r={0.18} h={0.02} c="#2F3A4A" />
        </group>
      );
    case 'hifi':
      return <Hifi lit={lit} c={c} />;
  }
  return null;
}

function TowerFan({ lit, c }: { lit: boolean; c: string }) {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (body.current) body.current.rotation.y = lit ? Math.sin(clock.elapsedTime * 0.8) * 0.5 : 0;
  });
  return (
    <group>
      <Cyl p={[0, 0.03, 0]} r={0.26} h={0.06} c={DARK} />
      <group ref={body}>
        <Cyl p={[0, 0.65, 0]} r={0.14} rt={0.12} h={1.2} c={c} />
        <Box p={[0, 0.7, 0.13]} s={[0.1, 0.9, 0.02]} c={lit ? '#7FD1F5' : '#4B5563'} e={lit ? 0.6 : 0} />
      </group>
    </group>
  );
}

function Hifi({ lit, c }: { lit: boolean; c: string }) {
  const disc = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (disc.current && lit) disc.current.rotation.y += dt * 3.5;
  });
  return (
    <group>
      <Box p={[0, 0.35, 0]} s={[1.4, 0.7, 0.6]} c={c} />
      <Box p={[0, 0.75, 0]} s={[0.9, 0.1, 0.5]} c={DARK} flat={false} />
      <mesh ref={disc} position={[-0.1, 0.82, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.02, 24]} />
        <meshStandardMaterial color="#0B0E14" roughness={0.4} />
      </mesh>
      <Box p={[0.3, 0.85, -0.15]} s={[0.04, 0.04, 0.3]} c={METAL} r={[0, 0.5, 0]} />
      {[-0.95, 0.95].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box p={[0, 0.55, 0]} s={[0.4, 1.1, 0.45]} c={DARK} />
          <Cyl p={[0, 0.4, 0.23]} r={0.14} h={0.02} c="#2F3A4A" />
          <Cyl p={[0, 0.85, 0.23]} r={0.07} h={0.02} c="#2F3A4A" />
        </group>
      ))}
      <Box p={[0.5, 0.5, 0.31]} s={[0.1, 0.1, 0.01]} c={lit ? '#F28C28' : '#333'} e={lit ? 1.5 : 0} />
    </group>
  );
}

function Plant({ kind }: { kind: string }) {
  const leaves = kind === 'fig' ? 9 : kind === 'monstera' ? 6 : 7;
  const h = kind === 'fig' ? 2.0 : kind === 'monstera' ? 1.3 : 0.9;
  return (
    <group>
      <Cyl p={[0, 0.2, 0]} r={0.2} rt={0.26} h={0.4} c={kind === 'fig' ? '#E8DCC8' : kind === 'monstera' ? '#C99A5B' : '#2F3A4A'} />
      {kind !== 'snake' && <Cyl p={[0, 0.4 + h * 0.35, 0]} r={0.03} h={h * 0.7} c="#5C4033" />}
      {Array.from({ length: leaves }).map((_, i) => {
        const a = (i / leaves) * Math.PI * 2;
        if (kind === 'snake') {
          return <Box key={i} p={[Math.cos(a) * 0.1, 0.4 + h / 2, Math.sin(a) * 0.1]} s={[0.12, h, 0.03]} c={i % 2 ? '#2D6A4F' : '#7FB069'} r={[0, -a, (i % 3 - 1) * 0.12]} />;
        }
        const y = 0.5 + h * (0.35 + 0.6 * ((i % 3) / 2));
        const reach = kind === 'fig' ? 0.45 : 0.55;
        return (
          <mesh key={i} position={[Math.cos(a) * reach, y, Math.sin(a) * reach]} rotation={[0.5, -a, 0]} castShadow>
            <boxGeometry args={kind === 'fig' ? [0.4, 0.55, 0.03] : [0.6, 0.5, 0.03]} />
            <meshStandardMaterial color={i % 2 ? '#2D6A4F' : '#3F8F5C'} flatShading roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}
