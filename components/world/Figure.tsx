'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';

import { hashString } from '@/lib/world/seed';
import { lookFor, type Look } from '@/lib/life/look';
import { applyTired, poseActivity, settle, type FigureAct, type Rig } from './figureMoves';
import { applyPose, poseKey, type HomePose } from './figurePoses';
// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
const FONT = '/fonts/inter-600.woff';

// A low-poly person. Appearance is the player's chosen look when there is one, otherwise seeded from the handle so a
// visitor looks the same everywhere; limbs swing in a walk cycle while moving. Shared by the player, other visitors and residents.

export type { Look } from '@/lib/life/look';
export { lookFor } from '@/lib/life/look';

type Props = {
  seed: string;
  /** a chosen look; without one the look is seeded from `seed` */
  look?: Look | null;
  /** 0 = standing, 1 = walking at full speed. Read each frame. */
  speedRef?: React.MutableRefObject<number>;
  label?: string;
  labelColor?: string;
  dim?: boolean;
  /** residents always walk */
  alwaysWalk?: boolean;
  /** 0 = upright, 1 = slumped (after a rug). Read each frame. */
  slumpRef?: React.MutableRefObject<number>;
  /** an everyday move to play (dance, stretch...) or a furniture pose (sit, sleep...), or null. Read each frame. */
  actRef?: React.MutableRefObject<FigureAct | HomePose | null>;
  /** 0 = fresh, 1 = exhausted: slower steps and a slouch. Read each frame. */
  tiredRef?: React.MutableRefObject<number>;
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
// The female profile has fuller hips, a narrower waist and narrower shoulders.
const TORSO: Record<Look['body'], [number, number][]> = {
  male: [[0, 0.16], [0.12, 0.155], [0.35, 0.15], [0.6, 0.172], [0.8, 0.19], [0.9, 0.185], [0.97, 0.14], [1, 0.07]],
  female: [[0, 0.178], [0.12, 0.168], [0.38, 0.136], [0.6, 0.155], [0.8, 0.165], [0.9, 0.158], [0.97, 0.122], [1, 0.064]],
};
function torsoR(body: Look['body'], t: number) {
  const P = TORSO[body];
  for (let i = 1; i < P.length; i++) {
    const [t0, r0] = P[i - 1], [t1, r1] = P[i];
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
  }
  return P[P.length - 1][1];
}
/** A lathe of the torso profile between t0 and t1, `inflate` pushes it out (for stripes and yokes over the shirt). */
const torso = (body: Look['body'], t0: number, t1: number, inflate = 1) =>
  geo(`torso|${body}|${q(t0)}|${q(t1)}|${q(inflate)}`, () => {
    const pts: THREE.Vector2[] = [];
    const closeTop = t1 >= 1, closeBottom = t0 <= 0;
    if (closeBottom) pts.push(new THREE.Vector2(0.0001, t0));
    for (let i = 0; i <= 10; i++) {
      const t = t0 + ((t1 - t0) * i) / 10;
      pts.push(new THREE.Vector2(torsoR(body, t) * inflate, t));
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

export function Figure({ seed, look: chosen, speedRef, label, labelColor = '#FFFFFF', dim = false, alwaysWalk = false, actRef, tiredRef, slumpRef }: Props) {
  const look = useMemo(() => chosen ?? lookFor(seed), [chosen, seed]);
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
  const phone = useRef<THREE.Mesh>(null);
  // the move being played (kept while it fades out), its start time, and its blend weight
  const move = useRef<{ act: FigureAct | HomePose | null; key: string; t: number; w: number }>({ act: null, key: '', t: 0, w: 0 });
  const eyes = useRef<(THREE.Group | null)[]>([null, null]);
  const blink = useRef(2 + (hashString(seed) % 30) / 10);

  // Rekt (a rug just popped): shoulders roll forward and the head drops, on top of whatever pose is playing.
  // `layered`: a pose was set this frame, so lean at least this far; otherwise the slump owns the lean.
  const slumpOver = (layered: boolean) => {
    const k = slumpRef?.current ?? 0;
    if (!slumpRef) return;
    if (chest.current) chest.current.rotation.x = layered ? Math.max(chest.current.rotation.x, 0.32 * k) : 0.32 * k;
    if (head.current) head.current.rotation.x = layered ? Math.max(head.current.rotation.x, 0.45 * k) : 0.45 * k;
    if (lArm.current) lArm.current.rotation.x -= 0.3 * k; // hang straight down despite the lean
    if (rArm.current) rArm.current.rotation.x -= 0.3 * k;
  };

  useFrame((_, dt) => {
    const target = alwaysWalk ? 1 : speedRef?.current ?? 0;
    cur.current += (target - cur.current) * Math.min(1, dt * 8);
    const s = cur.current;
    const tired = tiredRef?.current ?? 0;
    phase.current += dt * (6 + 4 * s) * (s > 0.02 ? 1 : 0) * (1 - 0.35 * tired);
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
    // a blink every few seconds
    blink.current -= dt;
    if (blink.current < -0.12) blink.current = 2.5 + Math.random() * 3;
    for (const e of eyes.current) if (e) e.scale.y = blink.current < 0 ? 0.12 : 1;

    // everyday moves and tiredness, layered over the walk (components/world/figureMoves.ts)
    if (!actRef && !tiredRef) return slumpOver(false);
    const rig: Rig = {
      body: body.current, chest: chest.current, head: head.current, lArm: lArm.current, rArm: rArm.current, lElbow: lElbow.current, rElbow: rElbow.current,
      lLeg: lLeg.current, rLeg: rLeg.current, lKnee: lKnee.current, rKnee: rKnee.current, phone: phone.current, eyes: eyes.current, hipY,
    };
    settle(rig);
    if (blink.current < 0) for (const e of eyes.current) if (e) e.scale.y = 0.12;
    const want = actRef?.current ?? null;
    const m = move.current;
    const key = want == null ? '' : typeof want === 'string' ? want : poseKey(want);
    if (want && key !== m.key) (m.act = want), (m.key = key), (m.t = 0), (m.w = m.w > 0 && typeof want !== 'string' ? m.w * 0.5 : 0);
    m.t += dt;
    m.w = Math.max(0, Math.min(1, m.w + (want ? dt : -dt) * 4));
    if (m.w === 0 && !want) (m.act = null), (m.key = '');
    if (m.w < 1) applyTired(rig, tired * (1 - m.w), idle.current);
    if (typeof m.act === 'string') poseActivity(rig, m.act, m.t, smoothW(m.w));
    else if (m.act) applyPose(rig, m.act, m.t, smoothW(m.w));
    slumpOver(true);
  });

  const fem = look.body === 'female';
  const H = look.height * (fem ? 0.96 : 1);
  const W = look.build;
  const op = dim ? 0.75 : 1;
  const mat = (color: string, roughness = 0.8) => <meshStandardMaterial color={color} roughness={roughness} transparent={dim} opacity={op} />;
  const skin = (r = 0.6) => mat(look.skin, r);
  const lip = useMemo(() => '#' + new THREE.Color(look.skin).lerp(new THREE.Color(look.body === 'female' ? '#9E3B4A' : '#6E2A2A'), 0.45).getHexString(), [look.skin, look.body]);
  const legLen = 0.82 * H;
  const torsoH = 0.56 * H;
  const hipY = legLen;
  const shoulderY = hipY + torsoH;
  const thigh = legLen * 0.5;
  const shin = legLen * 0.5;
  const sleeve = look.sleeves === 'long' ? look.shirt : look.skin;
  // Shorts (knee length) show the shins; a skirt shows the legs and hangs from the hips on its own.
  const thighColor = look.bottom === 'skirt' ? look.skin : look.pants;
  const shinColor = look.bottom === 'pants' ? look.pants : look.skin;
  const shoulderX = (fem ? 0.165 : 0.19) * W + 0.03;
  const armR = fem ? 0.9 : 1;

  return (
    <group scale={[1, 1, 1]}>
      <group ref={body}>
        {/* legs: pivot at hip, bend at knee */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? lLeg : rLeg} position={[side * 0.085 * W, hipY, 0]}>
            <mesh position={[0, -thigh * 0.5, 0]} geometry={capsule(0.075 * W, thigh - 0.1)} castShadow>
              {mat(thighColor)}
            </mesh>

            <group ref={side < 0 ? lKnee : rKnee} position={[0, -thigh, 0]}>
              <mesh position={[0, -shin * 0.47, 0]} geometry={capsule((look.bottom === 'pants' ? 0.058 : 0.052) * W, shin - 0.1)} castShadow>
                {mat(shinColor)}
              </mesh>
              <mesh position={[0, -shin + 0.045, 0.045]} scale={[0.062 * W, 0.05, 0.13]} geometry={ball()} castShadow>
                {mat(look.shoes, 0.55)}
              </mesh>
            </group>
          </group>
        ))}
        {/* pelvis */}
        <mesh position={[0, hipY + 0.03, 0]} scale={[(fem ? 0.168 : 0.155) * W, 0.11, 0.098]} geometry={ball()} castShadow>
          {mat(look.pants)}
        </mesh>
        {look.bottom === 'skirt' && (
          <mesh position={[0, hipY - thigh * 0.45, 0]} scale={[W, 1, 0.8]} geometry={geo(`skirt|${q(thigh)}`, () => new THREE.CylinderGeometry(0.19, 0.28, thigh * 1.05, 20, 1, true))} castShadow>
            <meshStandardMaterial color={look.pants} roughness={0.8} side={THREE.DoubleSide} transparent={dim} opacity={op} />
          </mesh>
        )}
        <group ref={chest} position={[0, hipY, 0]}>
          {/* torso: a lathed body, flattened front to back */}
          <group scale={[W, torsoH, 0.62]}>
            <mesh geometry={torso(look.body, 0, 1)} castShadow>
              {mat(look.shirt)}
            </mesh>
            {look.pattern === 'stripes' &&
              [0.2, 0.45, 0.7].map((f) => (
                <mesh key={f} geometry={torso(look.body, f, f + 0.08, 1.02)}>
                  {mat(look.shirtAlt)}
                </mesh>
              ))}
            {look.pattern === 'yoke' && (
              <mesh geometry={torso(look.body, 0.74, 0.985, 1.02)}>
                {mat(look.shirtAlt)}
              </mesh>
            )}
          </group>
          {fem &&
            [-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.062 * W, torsoH * 0.64, 0.05]} scale={[0.062 * W, 0.055, 0.05]} geometry={ball()}>
                {mat(look.shirt)}
              </mesh>
            ))}
          {/* arms: pivot at shoulder, bend at elbow */}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? lArm : rArm} position={[side * shoulderX, torsoH - 0.07, 0]} scale={[armR, 1, armR]}>
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
                {side > 0 && actRef && (
                  <mesh ref={phone} visible={false} position={[0, -0.31, 0.045]} rotation={[0.4, 0, 0]} geometry={geo('phone', () => new THREE.BoxGeometry(0.075, 0.14, 0.014))}>
                    <meshStandardMaterial color="#2B3245" roughness={0.25} metalness={0.3} />
                  </mesh>
                )}
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
                <group ref={(g) => void (eyes.current[side < 0 ? 0 : 1] = g)} rotation={[0, 0, look.eyes === 'almond' ? side * 0.14 : 0]}>
                  <mesh scale={look.eyes === 'almond' ? [0.022, 0.0095, 0.01] : [0.02, 0.015, 0.01]} geometry={smallBall()}>
                    <meshStandardMaterial color="#F4F0E8" roughness={0.3} transparent={dim} opacity={op} />
                  </mesh>
                  <mesh position={[0, look.eyes === 'almond' ? -0.001 : 0, 0.006]} scale={look.eyes === 'almond' ? [0.01, 0.0085, 0.006] : [0.011, 0.011, 0.006]} geometry={smallBall()}>
                    <meshStandardMaterial color="#1A120D" roughness={0.2} transparent={dim} opacity={op} />
                  </mesh>
                  {/* almond eyes: a soft upper lid; female figures: lashes along the lid */}
                  {look.eyes === 'almond' && (
                    <mesh position={[0, 0.007, 0.003]} scale={[0.024, 0.006, 0.01]} geometry={smallBall()}>
                      {skin()}
                    </mesh>
                  )}
                  {fem && (
                    <mesh position={[side * 0.006, look.eyes === 'almond' ? 0.011 : 0.014, 0.006]} rotation={[0, 0, side * -0.15]} scale={[0.022, 0.0035, 0.006]} geometry={smallBall()}>
                      <meshStandardMaterial color="#0E0B09" roughness={0.5} transparent={dim} opacity={op} />
                    </mesh>
                  )}
                </group>
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
            <mesh position={[0, -0.07, 0.094]} scale={fem ? [0.023, 0.009, 0.01] : [0.024, 0.007, 0.008]} geometry={smallBall()}>
              {mat(lip, 0.5)}
            </mesh>
            <Hair look={look} dim={dim} />
          </group>
        </group>
      </group>
      {label && (
        <Billboard position={[0, shoulderY + 0.62, 0]} follow>
          <Text font={FONT} fontSize={0.22} color={labelColor} outlineWidth={0.02} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}


const smoothW = (w: number) => w * w * (3 - 2 * w);

// Locs hang around the sides and back: [angle around the head (0 = front), length].
const LOCS: [number, number][] = [-2.9, -2.5, -2.1, -1.7, -1.35, 1.35, 1.7, 2.1, 2.5, 2.9, Math.PI].map((a, i) => [a, 0.16 + (i % 3) * 0.03]);

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
    case 'buzz':
      return (
        <group rotation={[-0.2, 0, 0]} scale={[1, 1, 1.1]}>
          <mesh geometry={headShell(0.07, 1.025)}>{m(look.hair)}</mesh>
          <mesh geometry={headShell(-0.04, 1.02, true)}>{m(look.hair)}</mesh>
        </group>
      );
    case 'ponytail':
      return (
        <>
          {crop()}
          <mesh position={[0, 0.085, -0.125]} scale={0.035} geometry={ball()}>
            {m(look.hair)}
          </mesh>
          <mesh position={[0, -0.02, -0.15]} rotation={[0.35, 0, 0]} geometry={capsule(0.034, 0.17)}>
            {m(look.hair)}
          </mesh>
        </>
      );
    case 'locs':
      return (
        <>
          {crop()}
          {LOCS.map(([a, len], i) => (
            <mesh key={i} position={[Math.sin(a) * 0.112, -0.045 - len * 0.5, Math.cos(a) * 0.108 - 0.012]} rotation={[Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.08]} geometry={capsule(0.019, len)}>
              {m(look.hair)}
            </mesh>
          ))}
        </>
      );
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
