'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';

import { hashString } from '@/lib/world/seed';
import { lookFor, withCapAsHat, type Look } from '@/lib/life/look';
import { applyTired, poseActivity, settle, type FigureAct, type Rig } from './figureMoves';
import { applyPose, poseKey, type HomePose } from './figurePoses';
import { ball, capsule, geo, headGeo, headShell, MID, MID_SHADOW, NEAR, onTorso, smallBall, torsoPatch } from './figureGeo';
import { armWear, Backpack, Belt, Chain, cloth, DEPTH, Eyewear, FONT, ForearmWear, HeadWear, HipWear, legWear, Shoe, ShinWear, ThighWear, TopWear, UpperArmWear, type Fit } from './FigureOutfit';

// A low-poly person. Appearance is the player's chosen look when there is one, otherwise seeded from the handle so a
// visitor looks the same everywhere; limbs swing in a walk cycle while moving. Shared by the player, other visitors and residents.
// Clothes (tops, bottoms, shoes, accessories) are drawn by FigureOutfit.tsx on the same joints.

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
  /** a presidential sash across the chest, in these two colours */
  sash?: [string, string];
  /** an everyday move to play (dance, stretch...) or a furniture pose (sit, sleep...), or null. Read each frame. */
  actRef?: React.MutableRefObject<FigureAct | HomePose | null>;
  /** 0 = fresh, 1 = exhausted: slower steps and a slouch. Read each frame. */
  tiredRef?: React.MutableRefObject<number>;
};

export function Figure({ seed, look: chosen, speedRef, label, labelColor = '#FFFFFF', dim = false, alwaysWalk = false, actRef, tiredRef, slumpRef, sash }: Props) {
  const look = useMemo(() => withCapAsHat(chosen ?? lookFor(seed)), [chosen, seed]);
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
  const root = useRef<THREE.Group>(null);
  const skirt = useRef<THREE.Group>(null);
  const pack = useRef<THREE.Group>(null);
  const lod = useRef({ level: -1, tick: 0 });

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

  useFrame(({ camera }, dt) => {
    if (root.current) applyLod(root.current, camera, lod.current);
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
    if (!actRef && !tiredRef) {
      if (skirt.current && lLeg.current && rLeg.current) swingSkirt(skirt.current, lLeg.current, rLeg.current);
      return slumpOver(false);
    }
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
    // The backpack comes off for furniture; a skirt or dress swings forward over the thighs when they lift (sitting).
    if (pack.current) pack.current.visible = !(m.act && typeof m.act !== 'string' && m.w > 0.5);
    if (skirt.current && lLeg.current && rLeg.current) swingSkirt(skirt.current, lLeg.current, rLeg.current);
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
  const fit: Fit = { look, W, torsoH, thigh, shin, dim, seed };
  const arm = armWear(look);
  const leg = legWear(look);
  const shoulderX = (fem ? 0.165 : 0.19) * W + 0.03;
  const armR = fem ? 0.9 : 1;

  return (
    <group ref={root}>
      <group ref={body}>
        {/* legs: pivot at hip, bend at knee */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? lLeg : rLeg} position={[side * 0.085 * W, hipY, 0]}>
            <mesh position={[0, -thigh * 0.5, 0]} geometry={capsule(leg.thighR * W, thigh - 0.1)} castShadow userData={MID_SHADOW}>
              {cloth(fit, leg.thigh, { map: leg.thigh === look.skin ? undefined : leg.map })}
            </mesh>
            <ThighWear fit={fit} side={side} />

            <group ref={side < 0 ? lKnee : rKnee} position={[0, -thigh, 0]}>
              <mesh position={[0, -shin * 0.47, 0]} geometry={capsule(leg.shinR * W, shin - 0.1)} castShadow userData={MID_SHADOW}>
                {cloth(fit, leg.shin, { map: leg.shin === look.skin ? undefined : leg.map })}
              </mesh>
              <ShinWear fit={fit} side={side} />
              <Shoe fit={fit} />
            </group>
          </group>
        ))}
        {/* pelvis */}
        <mesh position={[0, hipY + 0.03, 0]} scale={[(fem ? 0.168 : 0.155) * W, 0.11, 0.098]} geometry={ball()} castShadow userData={MID_SHADOW}>
          {cloth(fit, leg.pelvis, { map: leg.map })}
        </mesh>
        <HipWear ref={skirt} fit={fit} hipY={hipY} />
        <group ref={chest} position={[0, hipY, 0]}>
          {/* torso and top: a lathed body, flattened front to back, dressed in FigureOutfit.tsx */}
          <TopWear fit={fit} />
          <Belt fit={fit} />
          <Chain fit={fit} />
          <Backpack ref={pack} fit={fit} />
          {sash && (
            // a presidential sash: a band laid on the torso from one shoulder across to the opposite hip, front and
            // back, with a gold medal where it crosses the chest
            <group scale={[W, torsoH, DEPTH]}>
              {[0, 1].map((back) => {
                const c = (t: number) => (back ? -Math.PI - 1.0 : 1.0) + (back ? 2.0 : -2.0) * ((t - 0.06) / 0.88);
                return (
                  <group key={back}>
                    <mesh geometry={torsoPatch(`sash${back}`, look.body, 0.06, 0.94, (t) => c(t) - 0.2, (t) => c(t) + 0.2, 1.1)} userData={MID}>
                      {cloth(fit, sash[0], { r: 0.45, side: THREE.DoubleSide })}
                    </mesh>
                    <mesh geometry={torsoPatch(`sash-stripe${back}`, look.body, 0.06, 0.94, (t) => c(t) - 0.05, (t) => c(t) + 0.05, 1.112)} userData={NEAR}>
                      {cloth(fit, sash[1], { r: 0.45, side: THREE.DoubleSide })}
                    </mesh>
                  </group>
                );
              })}
            </group>
          )}
          {sash && (
            <mesh position={onTorso(look.body, -0.25, 0.55, 1.13, W, torsoH, DEPTH)} rotation={[0, -0.25, 0]} geometry={geo('medal', () => new THREE.CylinderGeometry(0.032, 0.032, 0.012, 20).rotateX(Math.PI / 2))} userData={NEAR}>
              <meshStandardMaterial color="#E3B341" metalness={0.85} roughness={0.25} />
            </mesh>
          )}
          {/* arms: pivot at shoulder, bend at elbow */}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? lArm : rArm} position={[side * shoulderX, torsoH - 0.07, 0]} scale={[armR, 1, armR]}>
              <mesh position={[side * -0.012, -0.01, 0]} scale={[0.06 * arm.shoulderScale, 0.058 * arm.shoulderScale, 0.062 * arm.shoulderScale]} geometry={smallBall()} userData={NEAR}>
                {mat(arm.shoulder)}
              </mesh>
              <mesh position={[0, -0.14, 0]} geometry={capsule(arm.upperR, 0.2)} castShadow>
                {mat(arm.upper)}
              </mesh>
              {arm.short && (
                <mesh position={[0, -0.06, 0]} geometry={capsule(arm.short.r, arm.short.len)} userData={NEAR}>
                  {mat(look.shirt)}
                </mesh>
              )}
              <UpperArmWear fit={fit} />
              <group ref={side < 0 ? lElbow : rElbow} position={[0, -0.28, 0]}>
                <mesh position={[0, -0.12, 0]} geometry={capsule(arm.foreR, 0.19)} castShadow>
                  {mat(arm.fore)}
                </mesh>
                <ForearmWear fit={fit} side={side} />
                <mesh position={[0, -0.28, 0.005]} scale={[0.035, 0.06, 0.045]} geometry={smallBall()} userData={NEAR}>
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
          <mesh position={[0, torsoH + 0.02, 0]} geometry={capsule(0.054, 0.05)} userData={MID}>
            {skin()}
          </mesh>
          <group ref={head} position={[0, torsoH + 0.2, 0]}>
            <mesh scale={[1, 1, 1.1]} geometry={headGeo()} castShadow userData={MID_SHADOW}>
              {skin()}
            </mesh>
            {/* the face: ears, eyes, brows, nose and mouth, drawn only up close */}
            <group userData={NEAR}>
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
            </group>
            <Hair look={look} dim={dim} />
            <HeadWear fit={fit} />
            <Eyewear fit={fit} />
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

/**
 * A skirt or dress is two halves hung from the hips. The front follows the thighs forward (a little while walking,
 * along them when seated) and widens when the knees part; the back tucks under when sitting.
 */
function swingSkirt(skirt: THREE.Object3D, l: THREE.Object3D, r: THREE.Object3D) {
  const [front, back] = skirt.children;
  const fl = -l.rotation.x, fr = -r.rotation.x; // forward thigh angles
  const avg = Math.max(0, (fl + fr) / 2);
  const seated = Math.min(1, avg / 1.4);
  const spread = Math.min(1, Math.abs(l.rotation.z - r.rotation.z) / 1.4);
  front.rotation.x = -Math.min(1.4, 0.75 * avg + 0.35 * Math.max(0, fl, fr));
  front.scale.set(1 - 0.25 * seated + 0.5 * spread, 1 - 0.15 * seated, 1);
  back.rotation.x = 0.35 * Math.max(0, -fl, -fr) * (1 - seated);
  back.scale.set(1, 1 - 0.7 * seated, 1);
}

// Level of detail (tags in figureGeo.ts). Beyond NEAR_D the face, hands and small details are hidden and only the body,
// legs and head cast shadows; beyond MID_D the shoes and neck go too and nothing casts a shadow.
const NEAR_D = 22, MID_D = 55, HYST = 3;
const castsShadow = new WeakMap<THREE.Object3D, boolean>();
const tmpPos = new THREE.Vector3();
function applyLod(root: THREE.Object3D, camera: THREE.Camera, st: { level: number; tick: number }) {
  const d = root.getWorldPosition(tmpPos).distanceTo(camera.position);
  let level = st.level < 0 ? (d < NEAR_D ? 0 : d < MID_D ? 1 : 2) : st.level;
  if (level === 0 && d > NEAR_D + HYST) level = 1;
  if (level === 1 && d < NEAR_D - HYST) level = 0;
  if (level === 1 && d > MID_D + HYST) level = 2;
  if (level === 2 && d < MID_D - HYST) level = 1;
  // re-apply now and then too, so meshes added by a look change pick up the current level
  if (level === st.level && ++st.tick < 30) return;
  st.level = level;
  st.tick = 0;
  root.traverse((o) => {
    const u = o.userData as { lod?: number; shadow?: number };
    if (u.lod != null) o.visible = level <= u.lod;
    if (!(o as THREE.Mesh).isMesh) return;
    if (!castsShadow.has(o)) castsShadow.set(o, o.castShadow);
    o.castShadow = castsShadow.get(o)! && level <= (u.shadow ?? 0);
  });
}

// Locs hang around the sides and back: [angle around the head (0 = front), length].
const LOCS: [number, number][] = [-2.9, -2.5, -2.1, -1.7, -1.35, 1.35, 1.7, 2.1, 2.5, 2.9, Math.PI].map((a, i) => [a, 0.16 + (i % 3) * 0.03]);

/** The hair. Under a hat (FigureOutfit.tsx) an afro or bun is tucked away; hair that hangs below it still shows. */
function Hair({ look, dim }: { look: Look; dim: boolean }) {
  const hat = look.hat !== 'none';
  const m = (color: string) => <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} transparent={dim} opacity={dim ? 0.75 : 1} />;
  // The hairline tilts up at the front; the nape comes down to the ears at the back.
  const crop = (color = look.hair) => (
    <group rotation={[-0.2, 0, 0]} scale={[1, 1, 1.1]}>
      <mesh position={[0, 0.004, -0.004]} geometry={headShell(0.06, 1.07)}>
        {m(color)}
      </mesh>
      <mesh position={[0, 0.004, -0.004]} geometry={headShell(-0.05, 1.06, true)} userData={NEAR}>
        {m(color)}
      </mesh>
    </group>
  );
  switch (look.hairStyle) {
    case 'bald':
      return null;
    case 'crop':
    case 'cap': // a hat now (withCapAsHat), drawn over short hair
      return crop();
    case 'buzz':
      return (
        <group rotation={[-0.2, 0, 0]} scale={[1, 1, 1.1]}>
          <mesh geometry={headShell(0.07, 1.025)}>{m(look.hair)}</mesh>
          <mesh geometry={headShell(-0.04, 1.02, true)} userData={NEAR}>{m(look.hair)}</mesh>
        </group>
      );
    case 'ponytail':
      return (
        <>
          {crop()}
          <mesh position={[0, 0.085, -0.125]} scale={0.035} geometry={ball()} userData={NEAR}>
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
            <mesh key={i} position={[Math.sin(a) * 0.112, -0.045 - len * 0.5, Math.cos(a) * 0.108 - 0.012]} rotation={[Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.08]} geometry={capsule(0.019, len)} userData={NEAR}>
              {m(look.hair)}
            </mesh>
          ))}
        </>
      );
    case 'afro':
      if (hat) return crop();
      return (
        <>
          {crop()}
          <mesh position={[0, 0.07, -0.055]} scale={[0.175, 0.16, 0.16]} geometry={ball()}>
            {m(look.hair)}
          </mesh>
        </>
      );
    case 'bun':
      if (hat) return crop();
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
              <mesh key={side} position={[side * 0.1, -0.15, -0.035]} rotation={[0.15, 0, side * 0.05]} geometry={capsule(0.028, 0.26)} userData={MID}>
                {m(look.hair)}
              </mesh>
            ))
          )}
        </>
      );
  }
}
