'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

import { prng, hashString } from '@/lib/world/seed';
// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
const FONT = '/fonts/inter-600.woff';

// A low-poly person. Appearance (skin, hair, outfit) is seeded from the handle so a visitor looks the same
// everywhere; limbs swing in a walk cycle while moving. Shared by the player, other visitors and residents.

const SKIN = ['#3B2219', '#4A2C1D', '#5C3A25', '#6F4530', '#8D5A3C', '#A66E4B', '#C08A63', '#D9A77F', '#E8BC94', '#F1CFB0'];
const HAIR = ['#0E0B09', '#1A120D', '#2B1B12', '#3F2A1C', '#5A3B25', '#7A5230', '#A3703D', '#C99A5B', '#222222', '#444444'];
const SHIRT = ['#1D9BF0', '#F28C28', '#2EC4B6', '#E63946', '#8338EC', '#FFBE0B', '#06D6A0', '#FF5D8F', '#3A86FF', '#E9EDC9', '#F4F1DE', '#2D6A4F'];
const SHIRT_ALT = ['#FFFFFF', '#0B0E14', '#FFD089', '#E8DCC8', '#BFE3FF'];
const PANTS = ['#2F4A74', '#1F2A44', '#0B0E14', '#4B5563', '#8B6F47', '#5C4033', '#2D2D2D', '#6B4EFF', '#1B4332'];
const SHOES = ['#0B0E14', '#FFFFFF', '#5C4033', '#1D9BF0', '#E63946'];

export type Look = {
  skin: string;
  hair: string;
  hairStyle: 'crop' | 'afro' | 'braids' | 'bun' | 'bald' | 'cap' | 'long';
  shirt: string;
  shirtAlt: string;
  pattern: 'solid' | 'stripes' | 'yoke';
  sleeves: 'long' | 'short';
  pants: string;
  shoes: string;
  height: number; // 0.92 .. 1.08
  build: number; // 0.9 .. 1.1
};

export function lookFor(seed: string): Look {
  const r = prng(hashString('look|' + seed.toLowerCase()));
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const styles: Look['hairStyle'][] = ['crop', 'crop', 'afro', 'braids', 'bun', 'bald', 'cap', 'long'];
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle: pick(styles),
    shirt: pick(SHIRT),
    shirtAlt: pick(SHIRT_ALT),
    pattern: pick(['solid', 'solid', 'stripes', 'yoke'] as Look['pattern'][]),
    sleeves: r() < 0.5 ? 'long' : 'short',
    pants: pick(PANTS),
    shoes: pick(SHOES),
    height: 0.92 + r() * 0.16,
    build: 0.9 + r() * 0.2,
  };
}

type Props = {
  seed: string;
  /** 0 = standing, 1 = walking at full speed. Read each frame. */
  speedRef?: React.MutableRefObject<number>;
  label?: string;
  labelColor?: string;
  dim?: boolean;
  /** residents always walk */
  alwaysWalk?: boolean;
};

export function Figure({ seed, speedRef, label, labelColor = '#FFFFFF', dim = false, alwaysWalk = false }: Props) {
  const look = useMemo(() => lookFor(seed), [seed]);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const phase = useRef(hashString(seed) % 100);
  const cur = useRef(0);

  useFrame((_, dt) => {
    const target = alwaysWalk ? 1 : speedRef?.current ?? 0;
    cur.current += (target - cur.current) * Math.min(1, dt * 8);
    const s = cur.current;
    phase.current += dt * (6 + 4 * s) * (s > 0.02 ? 1 : 0);
    const swing = Math.sin(phase.current) * 0.75 * s;
    if (lLeg.current) lLeg.current.rotation.x = swing;
    if (rLeg.current) rLeg.current.rotation.x = -swing;
    if (lArm.current) lArm.current.rotation.x = -swing * 0.8;
    if (rArm.current) rArm.current.rotation.x = swing * 0.8;
    if (body.current) body.current.position.y = Math.abs(Math.sin(phase.current * 2)) * 0.03 * s;
  });

  const H = look.height;
  const W = look.build;
  const op = dim ? 0.75 : 1;
  const mat = (color: string) => <meshStandardMaterial color={color} flatShading roughness={0.85} transparent={dim} opacity={op} />;
  const legLen = 0.82 * H;
  const torsoH = 0.56 * H;
  const hipY = legLen;
  const shoulderY = hipY + torsoH;

  return (
    <group scale={[1, 1, 1]}>
      <group ref={body}>
        {/* legs: pivot at hip */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? lLeg : rLeg} position={[side * 0.09 * W, hipY, 0]}>
            <mesh position={[0, -legLen * 0.27, 0]} castShadow>
              <boxGeometry args={[0.15 * W, legLen * 0.5, 0.16]} />
              {mat(look.pants)}
            </mesh>
            <mesh position={[0, -legLen * 0.76, 0]} castShadow>
              <boxGeometry args={[0.13 * W, legLen * 0.46, 0.14]} />
              {mat(look.pants)}
            </mesh>
            <mesh position={[0, -legLen + 0.045, 0.03]} castShadow>
              <boxGeometry args={[0.14 * W, 0.09, 0.26]} />
              {mat(look.shoes)}
            </mesh>
          </group>
        ))}
        {/* hips + torso */}
        <mesh position={[0, hipY + 0.06, 0]} castShadow>
          <boxGeometry args={[0.34 * W, 0.14, 0.2]} />
          {mat(look.pants)}
        </mesh>
        <mesh position={[0, hipY + torsoH * 0.5 + 0.06, 0]} castShadow>
          <boxGeometry args={[0.38 * W, torsoH - 0.1, 0.21]} />
          {mat(look.shirt)}
        </mesh>
        {look.pattern === 'stripes' &&
          [0.2, 0.45, 0.7].map((f) => (
            <mesh key={f} position={[0, hipY + 0.06 + f * (torsoH - 0.1), 0]}>
              <boxGeometry args={[0.385 * W, 0.045, 0.215]} />
              {mat(look.shirtAlt)}
            </mesh>
          ))}
        {look.pattern === 'yoke' && (
          <mesh position={[0, shoulderY - 0.12, 0]}>
            <boxGeometry args={[0.385 * W, 0.16, 0.215]} />
            {mat(look.shirtAlt)}
          </mesh>
        )}
        {/* arms: pivot at shoulder */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? lArm : rArm} position={[side * (0.19 * W + 0.06), shoulderY - 0.06, 0]}>
            <mesh position={[0, -0.14, 0]} castShadow>
              <boxGeometry args={[0.11, 0.28, 0.12]} />
              {mat(look.sleeves === 'short' ? look.shirt : look.shirt)}
            </mesh>
            <mesh position={[0, -0.4, 0]} castShadow>
              <boxGeometry args={[0.1, 0.26, 0.11]} />
              {mat(look.sleeves === 'long' ? look.shirt : look.skin)}
            </mesh>
            <mesh position={[0, -0.57, 0]}>
              <boxGeometry args={[0.09, 0.09, 0.09]} />
              {mat(look.skin)}
            </mesh>
          </group>
        ))}
        {/* neck + head */}
        <mesh position={[0, shoulderY + 0.05, 0]}>
          <boxGeometry args={[0.11, 0.1, 0.11]} />
          {mat(look.skin)}
        </mesh>
        <group position={[0, shoulderY + 0.26, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.3, 0.25]} />
            {mat(look.skin)}
          </mesh>
          {/* eyes */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.06, 0.02, 0.126]}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
              <meshStandardMaterial color="#0B0E14" roughness={0.4} />
            </mesh>
          ))}
          <Hair look={look} dim={dim} />
        </group>
      </group>
      {label && (
        <Text font={FONT} position={[0, shoulderY + 0.62, 0]} fontSize={0.22} color={labelColor} outlineWidth={0.02} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
          {label}
        </Text>
      )}
    </group>
  );
}

function Hair({ look, dim }: { look: Look; dim: boolean }) {
  const m = (color: string) => <meshStandardMaterial color={color} flatShading roughness={0.95} transparent={dim} opacity={dim ? 0.75 : 1} />;
  switch (look.hairStyle) {
    case 'bald':
      return null;
    case 'crop':
      return (
        <mesh position={[0, 0.13, -0.01]}>
          <boxGeometry args={[0.275, 0.09, 0.26]} />
          {m(look.hair)}
        </mesh>
      );
    case 'afro':
      return (
        <mesh position={[0, 0.14, -0.01]}>
          <dodecahedronGeometry args={[0.21, 0]} />
          {m(look.hair)}
        </mesh>
      );
    case 'bun':
      return (
        <>
          <mesh position={[0, 0.13, -0.01]}>
            <boxGeometry args={[0.275, 0.08, 0.26]} />
            {m(look.hair)}
          </mesh>
          <mesh position={[0, 0.2, -0.1]}>
            <icosahedronGeometry args={[0.08, 0]} />
            {m(look.hair)}
          </mesh>
        </>
      );
    case 'braids':
    case 'long':
      return (
        <>
          <mesh position={[0, 0.13, -0.01]}>
            <boxGeometry args={[0.275, 0.09, 0.26]} />
            {m(look.hair)}
          </mesh>
          <mesh position={[0, -0.08, -0.12]}>
            <boxGeometry args={[0.26, 0.36, 0.06]} />
            {m(look.hair)}
          </mesh>
          {look.hairStyle === 'braids' &&
            [-0.09, 0.09].map((x) => (
              <mesh key={x} position={[x, -0.1, 0.04]}>
                <boxGeometry args={[0.05, 0.34, 0.05]} />
                {m(look.hair)}
              </mesh>
            ))}
        </>
      );
    case 'cap':
      return (
        <>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.28, 0.08, 0.27]} />
            {m(look.shirtAlt === '#FFFFFF' ? look.pants : look.shirtAlt)}
          </mesh>
          <mesh position={[0, 0.11, 0.18]}>
            <boxGeometry args={[0.24, 0.025, 0.1]} />
            {m(look.shirtAlt === '#FFFFFF' ? look.pants : look.shirtAlt)}
          </mesh>
        </>
      );
  }
}
