'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';

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

// Geometry is built once per distinct size and shared by every figure in the world.
const GEO = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = make()));
  return g as T;
}
const q = (n: number) => n.toFixed(3);
const capsule = (r: number, len: number) => geo(`cap|${q(r)}|${q(len)}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
const ball = () => geo('ball', () => new THREE.SphereGeometry(1, 16, 12));
const smallBall = () => geo('ball-s', () => new THREE.SphereGeometry(1, 10, 8));
// Torso silhouette as radius over height (0 = waist, 1 = base of the neck): narrow waist, fuller chest, sloped shoulders.
const TORSO: [number, number][] = [[0, 0.16], [0.12, 0.155], [0.35, 0.15], [0.6, 0.172], [0.8, 0.19], [0.9, 0.185], [0.97, 0.14], [1, 0.07]];
function torsoR(t: number) {
  for (let i = 1; i < TORSO.length; i++) {
    const [t0, r0] = TORSO[i - 1], [t1, r1] = TORSO[i];
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
  }
  return TORSO[TORSO.length - 1][1];
}
/** A lathe of the torso profile between t0 and t1, `inflate` pushes it out (for stripes and yokes over the shirt). */
const torso = (t0: number, t1: number, inflate = 1) =>
  geo(`torso|${q(t0)}|${q(t1)}|${q(inflate)}`, () => {
    const pts: THREE.Vector2[] = [];
    const closeTop = t1 >= 1, closeBottom = t0 <= 0;
    if (closeBottom) pts.push(new THREE.Vector2(0.0001, t0));
    for (let i = 0; i <= 10; i++) {
      const t = t0 + ((t1 - t0) * i) / 10;
      pts.push(new THREE.Vector2(torsoR(t) * inflate, t));
    }
    if (closeTop) pts.push(new THREE.Vector2(0.0001, t1));
    return new THREE.LatheGeometry(pts, 18);
  });

// Head as a lathe: round cranium tapering to the jaw and chin, so the face has no seams.
const HEAD: [number, number][] = [[-0.138, 0.0001], [-0.132, 0.03], [-0.115, 0.058], [-0.085, 0.083], [-0.045, 0.102], [0, 0.111], [0.045, 0.112], [0.085, 0.102], [0.115, 0.08], [0.135, 0.045], [0.142, 0.0001]];
const headGeo = () =>
  geo('head', () => {
    const curve = new THREE.SplineCurve(HEAD.map(([y, r]) => new THREE.Vector2(r, y)));
    return new THREE.LatheGeometry(curve.getPoints(24), 20);
  });

/** Hair or a cap: the head's own outline, pushed out and cut off at a hairline. `back` keeps only the back half (the nape). */
const headShell = (yMin: number, inflate: number, back = false) =>
  geo(`shell|${q(yMin)}|${q(inflate)}|${back}`, () => {
    const curve = new THREE.SplineCurve(HEAD.map(([y, r]) => new THREE.Vector2(r, y)));
    const pts = curve.getPoints(48).filter((v) => v.y >= yMin);
    return new THREE.LatheGeometry(
      pts.map((v) => new THREE.Vector2(Math.max(0.0001, v.x * inflate), v.y * (1 + (inflate - 1) * 0.6))),
      20,
      back ? Math.PI * 0.5 - 0.25 : 0,
      back ? Math.PI + 0.5 : Math.PI * 2,
    );
  });

export function Figure({ seed, speedRef, label, labelColor = '#FFFFFF', dim = false, alwaysWalk = false }: Props) {
  const look = useMemo(() => lookFor(seed), [seed]);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const lElbow = useRef<THREE.Group>(null);
  const rElbow = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lKnee = useRef<THREE.Group>(null);
  const rKnee = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const phase = useRef(hashString(seed) % 100);
  const idle = useRef((hashString(seed) % 1000) / 100);
  const cur = useRef(0);

  useFrame((_, dt) => {
    const target = alwaysWalk ? 1 : speedRef?.current ?? 0;
    cur.current += (target - cur.current) * Math.min(1, dt * 8);
    const s = cur.current;
    phase.current += dt * (6 + 4 * s) * (s > 0.02 ? 1 : 0);
    idle.current += dt;
    const p = phase.current;
    const swing = Math.sin(p) * 0.6 * s;
    // Thighs swing; each knee folds while its leg travels forward, then straightens for the heel strike.
    if (lLeg.current) lLeg.current.rotation.x = swing;
    if (rLeg.current) rLeg.current.rotation.x = -swing;
    if (lKnee.current) lKnee.current.rotation.x = (Math.max(0, -Math.cos(p)) * 0.95 + 0.05) * s;
    if (rKnee.current) rKnee.current.rotation.x = (Math.max(0, Math.cos(p)) * 0.95 + 0.05) * s;
    // Arms counter-swing with relaxed elbows; at rest they hang with a slight sway.
    const sway = Math.sin(idle.current * 1.3) * 0.03 * (1 - s);
    if (lArm.current) (lArm.current.rotation.x = -swing * 0.9 + sway), (lArm.current.rotation.z = -0.07);
    if (rArm.current) (rArm.current.rotation.x = swing * 0.9 - sway), (rArm.current.rotation.z = 0.07);
    if (lElbow.current) lElbow.current.rotation.x = -(0.15 + (0.25 + 0.3 * Math.max(0, Math.sin(p))) * s);
    if (rElbow.current) rElbow.current.rotation.x = -(0.15 + (0.25 + 0.3 * Math.max(0, -Math.sin(p))) * s);
    if (body.current) {
      body.current.position.y = -Math.abs(Math.cos(p)) * 0.035 * s + 0.035 * s;
      body.current.rotation.y = Math.sin(p) * 0.06 * s;
    }
    // Breathing, and the shoulders counter-rotating against the hips.
    if (chest.current) {
      chest.current.scale.setScalar(1 + Math.sin(idle.current * 2.2) * 0.012 * (1 - s));
      chest.current.rotation.y = -Math.sin(p) * 0.12 * s;
    }
    if (head.current) head.current.rotation.y = Math.sin(p) * 0.1 * s + Math.sin(idle.current * 0.4) * 0.25 * (1 - s);
  });

  const H = look.height;
  const W = look.build;
  const op = dim ? 0.75 : 1;
  const mat = (color: string, roughness = 0.8) => <meshStandardMaterial color={color} roughness={roughness} transparent={dim} opacity={op} />;
  const skin = (r = 0.6) => mat(look.skin, r);
  const lip = useMemo(() => '#' + new THREE.Color(look.skin).lerp(new THREE.Color('#6E2A2A'), 0.45).getHexString(), [look.skin]);
  const legLen = 0.82 * H;
  const torsoH = 0.56 * H;
  const hipY = legLen;
  const shoulderY = hipY + torsoH;
  const thigh = legLen * 0.5;
  const shin = legLen * 0.5;
  const sleeve = look.sleeves === 'long' ? look.shirt : look.skin;

  return (
    <group scale={[1, 1, 1]}>
      <group ref={body}>
        {/* legs: pivot at hip, bend at knee */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? lLeg : rLeg} position={[side * 0.085 * W, hipY, 0]}>
            <mesh position={[0, -thigh * 0.5, 0]} geometry={capsule(0.075 * W, thigh - 0.1)} castShadow>
              {mat(look.pants)}
            </mesh>
            <group ref={side < 0 ? lKnee : rKnee} position={[0, -thigh, 0]}>
              <mesh position={[0, -shin * 0.47, 0]} geometry={capsule(0.058 * W, shin - 0.1)} castShadow>
                {mat(look.pants)}
              </mesh>
              <mesh position={[0, -shin + 0.045, 0.045]} scale={[0.062 * W, 0.05, 0.13]} geometry={ball()} castShadow>
                {mat(look.shoes, 0.55)}
              </mesh>
            </group>
          </group>
        ))}
        {/* pelvis */}
        <mesh position={[0, hipY + 0.03, 0]} scale={[0.165 * W, 0.11, 0.105]} geometry={ball()} castShadow>
          {mat(look.pants)}
        </mesh>
        <group ref={chest} position={[0, hipY, 0]}>
          {/* torso: a lathed body, flattened front to back */}
          <group scale={[W, torsoH, 0.62]}>
            <mesh geometry={torso(0, 1)} castShadow>
              {mat(look.shirt)}
            </mesh>
            {look.pattern === 'stripes' &&
              [0.2, 0.45, 0.7].map((f) => (
                <mesh key={f} geometry={torso(f, f + 0.08, 1.02)}>
                  {mat(look.shirtAlt)}
                </mesh>
              ))}
            {look.pattern === 'yoke' && (
              <mesh geometry={torso(0.74, 0.985, 1.02)}>
                {mat(look.shirtAlt)}
              </mesh>
            )}
          </group>
          {/* arms: pivot at shoulder, bend at elbow */}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? lArm : rArm} position={[side * (0.19 * W + 0.03), torsoH - 0.07, 0]}>
              <mesh position={[side * -0.012, -0.01, 0]} scale={[0.06, 0.058, 0.062]} geometry={smallBall()}>
                {mat(look.shirt)}
              </mesh>
              <mesh position={[0, -0.14, 0]} geometry={capsule(0.05, 0.2)} castShadow>
                {mat(sleeve)}
              </mesh>
              {look.sleeves === 'short' && (
                <mesh position={[0, -0.06, 0]} geometry={capsule(0.058, 0.08)}>
                  {mat(look.shirt)}
                </mesh>
              )}
              <group ref={side < 0 ? lElbow : rElbow} position={[0, -0.28, 0]}>
                <mesh position={[0, -0.12, 0]} geometry={capsule(0.042, 0.19)} castShadow>
                  {mat(sleeve)}
                </mesh>
                <mesh position={[0, -0.28, 0.005]} scale={[0.035, 0.06, 0.045]} geometry={smallBall()}>
                  {skin()}
                </mesh>
              </group>
            </group>
          ))}
          {/* neck + head */}
          <mesh position={[0, torsoH + 0.02, 0]} geometry={capsule(0.054, 0.05)}>
            {skin()}
          </mesh>
          <group ref={head} position={[0, torsoH + 0.2, 0]}>
            <mesh scale={[1, 1, 1.1]} geometry={headGeo()} castShadow>
              {skin()}
            </mesh>
            {/* ears */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.11, -0.005, -0.005]} scale={[0.018, 0.035, 0.024]} geometry={smallBall()}>
                {skin()}
              </mesh>
            ))}
            {/* eyes: whites, irises, brows */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.042, 0.012, 0.106]}>
                <mesh scale={[0.02, 0.015, 0.01]} geometry={smallBall()}>
                  <meshStandardMaterial color="#F4F0E8" roughness={0.3} transparent={dim} opacity={op} />
                </mesh>
                <mesh position={[0, 0, 0.006]} scale={[0.011, 0.011, 0.006]} geometry={smallBall()}>
                  <meshStandardMaterial color="#1A120D" roughness={0.2} transparent={dim} opacity={op} />
                </mesh>
                <mesh position={[0, 0.033, 0.002]} rotation={[0, 0, side * -0.12]} scale={[0.026, 0.006, 0.008]} geometry={smallBall()}>
                  {mat(look.hairStyle === 'bald' ? lip : look.hair)}
                </mesh>
              </group>
            ))}
            {/* nose */}
            <mesh position={[0, -0.02, 0.12]} scale={[0.014, 0.026, 0.018]} geometry={smallBall()}>
              {skin()}
            </mesh>
            {/* mouth */}
            <mesh position={[0, -0.07, 0.094]} scale={[0.024, 0.007, 0.008]} geometry={smallBall()}>
              {mat(lip, 0.5)}
            </mesh>
            <Hair look={look} dim={dim} />
          </group>
        </group>
      </group>
      {label && (
        <Billboard position={[0, shoulderY + 0.62, 0]} follow lockX lockZ>
          <Text font={FONT} fontSize={0.22} color={labelColor} outlineWidth={0.02} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}


function Hair({ look, dim }: { look: Look; dim: boolean }) {
  const m = (color: string) => <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} transparent={dim} opacity={dim ? 0.75 : 1} />;
  // The hairline tilts up at the front; the nape comes down to the ears at the back.
  const crop = (color = look.hair) => (
    <group rotation={[-0.2, 0, 0]} scale={[1, 1, 1.1]}>
      <mesh position={[0, 0.004, -0.004]} geometry={headShell(0.06, 1.07)}>
        {m(color)}
      </mesh>
      <mesh position={[0, 0.004, -0.004]} geometry={headShell(-0.05, 1.06, true)}>
        {m(color)}
      </mesh>
    </group>
  );
  switch (look.hairStyle) {
    case 'bald':
      return null;
    case 'crop':
      return crop();
    case 'afro':
      return (
        <>
          {crop()}
          <mesh position={[0, 0.07, -0.055]} scale={[0.175, 0.16, 0.16]} geometry={ball()}>
            {m(look.hair)}
          </mesh>
        </>
      );
    case 'bun':
      return (
        <>
          {crop()}
          <mesh position={[0, 0.115, -0.105]} scale={0.058} geometry={ball()}>
            {m(look.hair)}
          </mesh>
        </>
      );
    case 'braids':
    case 'long':
      return (
        <>
          {crop()}
          {look.hairStyle === 'long' ? (
            <mesh position={[0, -0.1, -0.045]} scale={[1, 1, 0.85]} geometry={geo('hair-long', () => new THREE.CylinderGeometry(0.126, 0.145, 0.26, 16, 1, true, Math.PI * 0.5 - 0.35, Math.PI + 0.7))}>
              {m(look.hair)}
            </mesh>
          ) : (
            [-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.1, -0.15, -0.035]} rotation={[0.15, 0, side * 0.05]} geometry={capsule(0.028, 0.26)}>
                {m(look.hair)}
              </mesh>
            ))
          )}
        </>
      );
    case 'cap': {
      const capColor = look.shirtAlt === '#FFFFFF' ? look.pants : look.shirtAlt;
      return (
        <>
          {crop()}
          <mesh position={[0, 0.008, -0.004]} rotation={[-0.12, 0, 0]} scale={[1, 1, 1.1]} geometry={headShell(0.045, 1.11)}>
            {m(capColor)}
          </mesh>
          <mesh position={[0, 0.07, 0.1]} rotation={[0.12, 0, 0]} scale={[1.05, 1, 0.95]} geometry={geo('brim', () => new THREE.CylinderGeometry(0.1, 0.1, 0.012, 18, 1, false, -Math.PI * 0.5, Math.PI))}>
            {m(capColor)}
          </mesh>
        </>
      );
    }
  }
}
