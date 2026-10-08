'use client';
import { forwardRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { Look } from '@/lib/life/look';
import { ball, capsule, denim, geo, headShell, knit, MID, MID_SHADOW, NEAR, onTorso, q, ring, smallBall, torso, torsoPatch, torsoR, torsoTube } from './figureGeo';

// The Figure's clothes: eight tops, six bottoms, four kinds of shoes, and hats, eyewear, a chain, a watch and a
// backpack. Each style is its own shape over the body and takes the look's colours (top: shirt + shirtAlt,
// bottom: pants, shoes: shoes, hat and backpack: accent). Pieces hang off the same joints as the body
// (chest, arms, legs, head), so every walk cycle, move and furniture pose carries them along.

// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
export const FONT = '/fonts/inter-600.woff';

export type Fit = {
  look: Look;
  W: number;
  torsoH: number;
  thigh: number;
  shin: number;
  dim: boolean;
  /** a jersey's number comes from this */
  seed: string;
};

type MatOpts = { r?: number; map?: THREE.Texture; metal?: number; side?: THREE.Side };
export const cloth = (fit: Fit, color: string, o: MatOpts = {}) => (
  <meshStandardMaterial color={color} roughness={o.r ?? 0.8} metalness={o.metal ?? 0} map={o.map} side={o.side} transparent={fit.dim} opacity={fit.dim ? 0.75 : 1} />
);
/** the colour a shade lighter (k > 0) or darker (k < 0) */
export const shade = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color(k > 0 ? '#FFFFFF' : '#000000'), Math.abs(k)).getHexString();
const GOLD = '#E3B341';

/** How far each top stands off the body: a hoodie is bulky, a blazer structured, a tank skin-tight. */
const INFLATE: Record<Look['top'], number> = { tee: 1, hoodie: 1.07, shirt: 1.01, blazer: 1.05, crop: 1, jersey: 1.02, tank: 1, dress: 1 };
/** The torso depth (front to back) relative to its width. */
export const DEPTH = 0.62;

/** Sleeve length as worn: hoodies and blazers always have long sleeves, a tank none. */
export const sleevesOf = (l: Look): 'long' | 'short' | 'none' => (l.top === 'tank' ? 'none' : l.top === 'hoodie' || l.top === 'blazer' ? 'long' : l.sleeves);
/** The bottom as worn: a dress replaces it. */
export const bottomOf = (l: Look): Look['bottom'] | 'dress' => (l.top === 'dress' ? 'dress' : l.bottom);
const hasLegs = (b: Look['bottom'] | 'dress') => b === 'pants' || b === 'jeans' || b === 'joggers' || b === 'cargo';

/** Arm sizes and colours for the current top. */
export function armWear(l: Look) {
  const sl = sleevesOf(l);
  const bulk = l.top === 'hoodie' ? 1.14 : l.top === 'blazer' ? 1.1 : 1;
  return {
    upperR: 0.05 * (sl === 'long' ? bulk : 1),
    foreR: 0.042 * (sl === 'long' ? bulk : 1),
    upper: sl === 'long' ? l.shirt : l.skin,
    fore: sl === 'long' ? l.shirt : l.skin,
    shoulder: sl === 'none' ? l.skin : l.shirt,
    shoulderScale: l.top === 'blazer' ? 1.15 : l.top === 'hoodie' ? 1.12 : 1,
    short: sl === 'short' ? { r: l.top === 'jersey' ? 0.065 : l.top === 'shirt' ? 0.06 : 0.058, len: l.top === 'jersey' ? 0.09 : 0.08 } : null,
  };
}

/** Leg sizes, colours and fabric for the current bottom. */
export function legWear(l: Look) {
  const b = bottomOf(l);
  const map = b === 'jeans' ? denim() : undefined;
  const thighR = { pants: 0.075, jeans: 0.074, joggers: 0.079, cargo: 0.083, shorts: 0.078, skirt: 0.075, dress: 0.075 }[b];
  const shinR = { pants: 0.058, jeans: 0.057, joggers: 0.056, cargo: 0.063, shorts: 0.052, skirt: 0.052, dress: 0.052 }[b];
  return {
    thighR,
    shinR,
    thigh: b === 'skirt' || b === 'dress' ? l.skin : l.pants,
    shin: hasLegs(b) ? l.pants : l.skin,
    pelvis: b === 'dress' ? l.shirt : l.pants,
    map,
  };
}

// ---------------------------------------------------------------- tops (in the chest group, y = 0 at the waist)

export function TopWear({ fit }: { fit: Fit }) {
  const { look, W, torsoH } = fit;
  const body = look.body;
  const top = look.top;
  const inf = INFLATE[top];
  const c = (color: string, o?: MatOpts) => cloth(fit, color, o);
  // the part of the torso the top covers; the rest is skin
  const from = top === 'crop' ? 0.3 : 0;
  const to = top === 'tank' ? 0.86 : 1;
  const bands = look.pattern === 'stripes' ? [0.2, 0.45, 0.7].map((f) => [f, f + 0.08]) : look.pattern === 'yoke' ? [top === 'tank' ? [0.64, 0.84] : [0.74, 0.985]] : [];
  return (
    <>
      <group scale={[W, torsoH, DEPTH]}>
        {from > 0 && (
          <mesh geometry={torso(body, 0, from)} castShadow userData={MID_SHADOW}>
            {c(look.skin, { r: 0.6 })}
          </mesh>
        )}
        <mesh geometry={torso(body, from, to, inf)} castShadow userData={MID_SHADOW}>
          {c(look.shirt)}
        </mesh>
        {to < 1 && (
          <mesh geometry={torso(body, to, 1)} userData={MID_SHADOW}>
            {c(look.skin, { r: 0.6 })}
          </mesh>
        )}
        {top !== 'blazer' &&
          bands
            .filter(([a, b]) => a >= from && b <= to)
            .map(([a, b]) => (
              <mesh key={a} geometry={torso(body, a, b, inf * 1.02)} userData={NEAR}>
                {c(look.shirtAlt)}
              </mesh>
            ))}
        {top === 'crop' && (
          <mesh geometry={torso(body, from, from + 0.04, 1.02)} userData={NEAR}>
            {c(shade(look.shirt, -0.12))}
          </mesh>
        )}
        {top === 'shirt' && <ShirtFront fit={fit} />}
        {top === 'blazer' && <BlazerFront fit={fit} />}
        {top === 'jersey' && <JerseyNeck fit={fit} />}
        {top === 'hoodie' && (
          <>
            {/* ribbed hem and a kangaroo pocket */}
            <mesh geometry={torso(body, 0, 0.07, inf * 1.015)} userData={MID}>
              {c(shade(look.shirt, -0.1), { map: knit() })}
            </mesh>
            <mesh geometry={torsoPatch('pocket', body, 0.09, 0.34, (t) => -0.62 + (t - 0.09) * 0.5, (t) => 0.62 - (t - 0.09) * 0.5, inf * 1.025)} userData={NEAR}>
              {c(shade(look.shirt, -0.14), { side: THREE.DoubleSide })}
            </mesh>
          </>
        )}
      </group>
      {/* bust, pushed out with the top so it isn't swallowed by bulky ones */}
      {look.body === 'female' &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.062 * W, torsoH * 0.64, 0.05 * inf]} scale={[0.062 * W, 0.055, 0.05]} geometry={ball()} userData={NEAR}>
            {c(look.shirt)}
          </mesh>
        ))}
      {(top === 'tee' || top === 'dress' || top === 'crop') && (
        <mesh position={[0, torsoH * 0.983, 0]} scale={[W * 1.05, 1, 0.82]} geometry={ring(0.07, 0.009)} userData={NEAR}>
          {c(shade(look.shirt, -0.1))}
        </mesh>
      )}
      {top === 'tank' &&
        [-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={torsoTube(`strap${s}`, body, [[s * 0.5, 0.84], [s * 0.62, 0.92], [s * 0.95, 0.975], [s * (Math.PI - 0.95), 0.975], [s * (Math.PI - 0.62), 0.92], [s * (Math.PI - 0.5), 0.84]], 1.03, W, torsoH, DEPTH, 0.017)}
            userData={MID}
          >
            {c(look.shirt)}
          </mesh>
        ))}
      {top === 'hoodie' && <HoodieHood fit={fit} />}
      {top === 'blazer' && (
        // the jacket's skirt over the hips, open at the front
        <mesh position={[0, -0.06, 0]} scale={[W, 1, DEPTH]} geometry={geo(`blazer-hem|${body}`, () => new THREE.CylinderGeometry(torsoR(body, 0) * 1.05, torsoR(body, 0) * 1.12, 0.13, 18, 1, true, 0.3, Math.PI * 2 - 0.6))} castShadow userData={MID}>
          {c(look.shirt, { side: THREE.DoubleSide })}
        </mesh>
      )}
      {top === 'jersey' && (
        <Text
          font={FONT}
          position={onTorso(body, Math.PI, 0.6, inf * 1.04, W, torsoH, DEPTH).toArray()}
          rotation={[0, Math.PI, 0]}
          fontSize={0.12}
          color={look.shirtAlt === look.shirt ? shade(look.shirt, -0.5) : look.shirtAlt}
          anchorX="center"
          anchorY="middle"
          userData={NEAR}
        >
          {String((hashNum(fit.seed) % 98) + 1)}
        </Text>
      )}
    </>
  );
}

const hashNum = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** A button-up: a collar open at the throat, a placket and buttons down the front. */
function ShirtFront({ fit }: { fit: Fit }) {
  const { look } = fit;
  const inf = INFLATE.shirt;
  return (
    <>
      <mesh geometry={torsoPatch('placket', look.body, 0.02, 0.95, () => -0.07, () => 0.07, inf * 1.012)} userData={NEAR}>
        {cloth(fit, shade(look.shirt, -0.08), { side: THREE.DoubleSide })}
      </mesh>
      {[0.2, 0.4, 0.6, 0.8].map((t) => {
        const r = torsoR(look.body, t) * inf * 1.03;
        return (
          // inside the torso's scaled group, so undo its squash to keep the buttons round
          <mesh key={t} position={[0, t, r]} scale={[0.011 / fit.W, 0.011 / fit.torsoH, 0.006 / DEPTH]} geometry={smallBall()} userData={NEAR}>
            {cloth(fit, look.shirtAlt === look.shirt ? shade(look.shirt, -0.35) : look.shirtAlt, { r: 0.4 })}
          </mesh>
        );
      })}
      <mesh position={[0, 0.985, 0]} scale={[1, 0.07 / fit.torsoH, 1]} geometry={geo('shirt-collar', () => new THREE.CylinderGeometry(0.085, 0.125, 1, 16, 1, true, 0.5, Math.PI * 2 - 1))} userData={MID}>
        {cloth(fit, look.shirt, { side: THREE.DoubleSide })}
      </mesh>
    </>
  );
}

/** A blazer: the shirt underneath showing in a V, lapels either side of it and two buttons below. */
function BlazerFront({ fit }: { fit: Fit }) {
  const { look } = fit;
  const inf = INFLATE.blazer;
  const v = (t: number) => 0.04 + 0.5 * Math.max(0, (t - 0.48) / 0.51);
  return (
    <>
      <mesh geometry={torsoPatch('blazer-v', look.body, 0.48, 0.995, (t) => -v(t), (t) => v(t), inf * 1.006)} userData={MID}>
        {cloth(fit, look.shirtAlt, { side: THREE.DoubleSide })}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={torsoPatch(`lapel${s}`, look.body, 0.48, 0.97, (t) => (s < 0 ? -v(t) - 0.24 * Math.min(1, (t - 0.48) * 4) : v(t)), (t) => (s < 0 ? -v(t) : v(t) + 0.24 * Math.min(1, (t - 0.48) * 4)), inf * 1.015)}
          userData={NEAR}
        >
          {cloth(fit, shade(look.shirt, 0.08), { side: THREE.DoubleSide })}
        </mesh>
      ))}
      {[0.38, 0.26].map((t) => (
        <mesh key={t} position={[0, t, torsoR(look.body, t) * inf * 1.02]} scale={[0.012 / fit.W, 0.012 / fit.torsoH, 0.006 / DEPTH]} geometry={smallBall()} userData={NEAR}>
          {cloth(fit, shade(look.shirt, -0.45), { r: 0.35 })}
        </mesh>
      ))}
    </>
  );
}

/** A sports jersey: a V neck trimmed in the accent colour. */
function JerseyNeck({ fit }: { fit: Fit }) {
  const { look } = fit;
  const inf = INFLATE.jersey;
  const v = (t: number) => 0.55 * Math.max(0, (t - 0.8) / 0.19);
  return (
    <>
      <mesh geometry={torsoPatch('jersey-trim', look.body, 0.77, 0.99, (t) => -v(t) - 0.1, (t) => v(t) + 0.1, inf * 1.006)} userData={NEAR}>
        {cloth(fit, look.shirtAlt === look.shirt ? shade(look.shirt, 0.4) : look.shirtAlt, { side: THREE.DoubleSide })}
      </mesh>
      <mesh geometry={torsoPatch('jersey-v', look.body, 0.8, 0.995, (t) => -v(t), (t) => v(t), inf * 1.012)} userData={NEAR}>
        {cloth(fit, look.skin, { r: 0.6, side: THREE.DoubleSide })}
      </mesh>
    </>
  );
}

/** A hood bunched behind the neck, and drawstrings. */
function HoodieHood({ fit }: { fit: Fit }) {
  const { look, W, torsoH } = fit;
  const strings = look.shirtAlt === look.shirt ? shade(look.shirt, 0.5) : look.shirtAlt;
  return (
    <>
      <mesh position={[0, torsoH * 0.985, -0.012]} rotation={[-0.3, 0, 0]} scale={[W * 1.1, 1, 0.95]} geometry={ring(0.075, 0.03)} userData={MID}>
        {cloth(fit, look.shirt)}
      </mesh>
      <mesh position={[0, torsoH * 0.95, -0.085]} rotation={[0.5, 0, 0]} scale={[0.115 * W, 0.08, 0.06]} geometry={ball()} castShadow userData={MID}>
        {cloth(fit, shade(look.shirt, -0.06))}
      </mesh>
      {[-1, 1].map((s) => {
        const p = onTorso(look.body, s * 0.2, 0.86, INFLATE.hoodie * 1.03, W, torsoH, DEPTH);
        return (
          <mesh key={s} position={p.toArray()} rotation={[-0.15, 0, 0]} geometry={capsule(0.006, 0.1)} userData={NEAR}>
            {cloth(fit, strings)}
          </mesh>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- arms

/** Cuffs and trims on the upper arm (in the arm group). */
export function UpperArmWear({ fit }: { fit: Fit }) {
  const { look } = fit;
  const a = armWear(look);
  if (look.top !== 'jersey' || !a.short) return null;
  return (
    <mesh position={[0, -0.06 - a.short.len * 0.5 - 0.01, 0]} geometry={ring(a.short.r - 0.002, 0.008)} userData={NEAR}>
      {cloth(fit, look.shirtAlt === look.shirt ? shade(look.shirt, 0.4) : look.shirtAlt)}
    </mesh>
  );
}

/** Cuffs and the watch on the forearm (in the elbow group). `side` -1 is the left arm. */
export function ForearmWear({ fit, side }: { fit: Fit; side: number }) {
  const { look } = fit;
  const a = armWear(look);
  return (
    <>
      {look.top === 'hoodie' && (
        <mesh position={[0, -0.205, 0]} geometry={capsule(a.foreR + 0.004, 0.025)} userData={MID}>
          {cloth(fit, shade(look.shirt, -0.1), { map: knit() })}
        </mesh>
      )}
      {look.top === 'blazer' && (
        // the shirt cuff peeking out of the jacket sleeve
        <mesh position={[0, -0.228, 0]} geometry={ring(0.04, 0.008)} userData={NEAR}>
          {cloth(fit, look.shirtAlt)}
        </mesh>
      )}
      {side < 0 && look.extras.includes('watch') && (
        <group position={[0, -0.22, 0]}>
          <mesh geometry={ring(sleevesOf(look) === 'long' ? a.foreR + 0.006 : 0.039, 0.007)} userData={NEAR}>
            {cloth(fit, '#1E1E22', { r: 0.5 })}
          </mesh>
          <mesh position={[-0.042, 0, 0.004]} rotation={[0, 0, Math.PI / 2]} geometry={geo('watch-face', () => new THREE.CylinderGeometry(0.017, 0.017, 0.01, 14))} userData={NEAR}>
            {cloth(fit, GOLD, { r: 0.3, metal: 0.8 })}
          </mesh>
        </group>
      )}
    </>
  );
}

// ---------------------------------------------------------------- legs, hips and shoes

/** Pockets, stripes and cuffs on a thigh (in the leg group). */
export function ThighWear({ fit, side }: { fit: Fit; side: number }) {
  const { look, W, thigh } = fit;
  const b = bottomOf(look);
  const lw = legWear(look);
  if (b === 'cargo')
    return (
      <mesh position={[side * (lw.thighR * W + 0.002), -thigh * 0.58, 0.005]} geometry={geo('cargo-pocket', () => new RoundedBoxGeometry(0.024, 0.11, 0.095, 2, 0.01))} userData={NEAR}>
        {cloth(fit, shade(look.pants, -0.08))}
      </mesh>
    );
  if (b === 'joggers') return <SideStripe fit={fit} side={side} r={lw.thighR * W} len={thigh - 0.06} y={-thigh * 0.5} />;
  if (b === 'shorts')
    return (
      <mesh position={[0, -thigh + 0.035, 0]} geometry={ring(lw.thighR * W + 0.004, 0.008)} userData={NEAR}>
        {cloth(fit, shade(look.pants, -0.12))}
      </mesh>
    );
  return null;
}

/** Cuffs and stripes on a shin (in the knee group). */
export function ShinWear({ fit, side }: { fit: Fit; side: number }) {
  const { look, W, shin } = fit;
  const b = bottomOf(look);
  const lw = legWear(look);
  if (b !== 'joggers' && b !== 'cargo') return null;
  return (
    <>
      {b === 'joggers' && <SideStripe fit={fit} side={side} r={lw.shinR * W} len={shin - 0.2} y={-shin * 0.42} />}
      {look.shoeStyle !== 'boots' && (
        <mesh position={[0, -shin + 0.13, 0]} geometry={capsule(lw.shinR * W + 0.005, 0.03)} userData={MID}>
          {cloth(fit, shade(look.pants, -0.12), { map: b === 'joggers' ? knit() : undefined })}
        </mesh>
      )}
    </>
  );
}

function SideStripe({ fit, side, r, len, y }: { fit: Fit; side: number; r: number; len: number; y: number }) {
  const color = fit.look.shirtAlt === fit.look.pants ? shade(fit.look.pants, 0.6) : fit.look.pants === '#FFFFFF' ? '#0B0E14' : '#FFFFFF';
  return (
    <mesh position={[side * (r - 0.004), y, 0]} scale={[1, 1, 0.6]} geometry={capsule(0.01, len)} userData={NEAR}>
      {cloth(fit, color)}
    </mesh>
  );
}

/**
 * Skirts and dresses, which hang from the hips on their own; belts and back pockets. The skirt group is
 * returned through the ref so the Figure can swing it forward over the thighs when sitting.
 */
export const HipWear = forwardRef<THREE.Group, { fit: Fit; hipY: number }>(function HipWear({ fit, hipY }, skirtRef) {
  const { look, W, thigh } = fit;
  const b = bottomOf(look);
  const lw = legWear(look);
  const long = b === 'dress';
  const len = thigh * (long ? 1.18 : 1.02);
  return (
    <>
      {(b === 'skirt' || b === 'dress') && (
        // two halves: the front swings up over the thighs when sitting, the back tucks under (see Figure)
        <group ref={skirtRef} position={[0, hipY + 0.04, 0]}>
          {[0, Math.PI].map((ry) => (
            <group key={ry} rotation={[0, ry, 0]}>
              <mesh position={[0, -len * 0.5, 0]} scale={[W, 1, 0.8]} geometry={geo(`skirt|${q(len)}|${long}`, () => new THREE.CylinderGeometry(0.19, long ? 0.3 : 0.28, len, 12, 2, true, -Math.PI / 2, Math.PI))} castShadow userData={MID_SHADOW}>
                {cloth(fit, long ? look.shirt : look.pants, { side: THREE.DoubleSide })}
              </mesh>
              <mesh position={[0, -len + 0.012, 0]} scale={[W, 1, 0.8]} geometry={geo(`hem|${long}`, () => new THREE.TorusGeometry(long ? 0.298 : 0.278, 0.008, 5, 12, Math.PI).rotateX(Math.PI / 2))} userData={NEAR}>
                {cloth(fit, shade(long ? look.shirt : look.pants, -0.15))}
              </mesh>
            </group>
          ))}
        </group>
      )}
      {b === 'jeans' &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.062 * W, hipY - 0.005, -0.091]} rotation={[0.15, s * -0.35, 0]} geometry={geo('jeans-pocket', () => new RoundedBoxGeometry(0.075, 0.07, 0.012, 2, 0.005))} userData={NEAR}>
            {cloth(fit, shade(look.pants, -0.1), { map: lw.map })}
          </mesh>
        ))}
    </>
  );
});

/** A belt over the waist, shown where the top is tucked in or ends above it. In the chest group. */
export function Belt({ fit }: { fit: Fit }) {
  const { look, W, torsoH } = fit;
  const b = bottomOf(look);
  if (!(b === 'jeans' || b === 'cargo' || b === 'pants') || !(look.top === 'shirt' || look.top === 'crop' || look.top === 'tank')) return null;
  return (
    <>
      <group scale={[W, torsoH, DEPTH]}>
        <mesh geometry={torso(look.body, 0, 0.055, 1.035)} userData={MID}>
          {cloth(fit, b === 'cargo' ? '#2D2D2D' : '#4A3020', { r: 0.5 })}
        </mesh>
      </group>
      <mesh position={[0, torsoH * 0.028, torsoR(look.body, 0.03) * 1.035 * DEPTH + 0.004]} geometry={geo('buckle', () => new THREE.BoxGeometry(0.04, 0.026, 0.008))} userData={NEAR}>
        {cloth(fit, '#C9CED6', { r: 0.3, metal: 0.8 })}
      </mesh>
    </>
  );
}

/** A shoe, in the knee group (the sole sits at -shin). */
export function Shoe({ fit }: { fit: Fit }) {
  const { look, W, shin } = fit;
  const c = look.shoes;
  const sole = c.toUpperCase() === '#FFFFFF' ? '#D9D9D9' : '#F2F2F2';
  switch (look.shoeStyle) {
    case 'boots':
      return (
        <>
          <mesh position={[0, -shin + 0.055, 0.04]} scale={[0.068 * W, 0.058, 0.135]} geometry={ball()} castShadow userData={MID}>
            {cloth(fit, c, { r: 0.65 })}
          </mesh>
          <mesh position={[0, -shin + 0.13, 0]} geometry={capsule(0.066 * W, 0.11)} userData={MID}>
            {cloth(fit, c, { r: 0.65 })}
          </mesh>
          <mesh position={[0, -shin + 0.014, 0.042]} scale={[0.072 * W, 0.024, 0.142]} geometry={ball()} userData={NEAR}>
            {cloth(fit, '#2A1E16', { r: 0.9 })}
          </mesh>
        </>
      );
    case 'slides':
      return (
        <>
          <mesh position={[0, -shin + 0.03, 0.04]} scale={[0.05 * W, 0.032, 0.115]} geometry={ball()} userData={MID}>
            {cloth(fit, look.skin, { r: 0.6 })}
          </mesh>
          <mesh position={[0, -shin + 0.008, 0.04]} geometry={geo(`slide-sole|${q(W)}`, () => new RoundedBoxGeometry(0.115 * W, 0.02, 0.26, 1, 0.008))} userData={MID}>
            {cloth(fit, c, { r: 0.6 })}
          </mesh>
          <mesh position={[0, -shin + 0.035, 0.07]} geometry={geo(`slide-strap|${q(W)}`, () => new RoundedBoxGeometry(0.12 * W, 0.04, 0.08, 2, 0.015))} userData={MID}>
            {cloth(fit, c, { r: 0.6 })}
          </mesh>
        </>
      );
    case 'heels':
      return (
        <>
          <mesh position={[0, -shin + 0.055, 0.045]} rotation={[0.3, 0, 0]} scale={[0.05 * W, 0.04, 0.12]} geometry={ball()} castShadow userData={MID}>
            {cloth(fit, c, { r: 0.35 })}
          </mesh>
          <mesh position={[0, -shin + 0.035, -0.045]} geometry={geo('heel', () => new THREE.CylinderGeometry(0.012, 0.007, 0.07, 8))} userData={NEAR}>
            {cloth(fit, shade(c, -0.3), { r: 0.35 })}
          </mesh>
        </>
      );
    default:
      return (
        <>
          <mesh position={[0, -shin + 0.05, 0.045]} scale={[0.062 * W, 0.048, 0.13]} geometry={ball()} castShadow userData={MID}>
            {cloth(fit, c, { r: 0.55 })}
          </mesh>
          <mesh position={[0, -shin + 0.012, 0.048]} scale={[0.066 * W, 0.022, 0.138]} geometry={ball()} userData={NEAR}>
            {cloth(fit, sole, { r: 0.7 })}
          </mesh>
        </>
      );
  }
}

// ---------------------------------------------------------------- head

/** Cap or beanie, in the head group. */
export function HeadWear({ fit }: { fit: Fit }) {
  const { look } = fit;
  const m = (color: string, map?: THREE.Texture) => cloth(fit, color, { r: 0.85, map, side: THREE.DoubleSide });
  if (look.hat === 'cap')
    return (
      <>
        <mesh position={[0, 0.008, -0.004]} rotation={[-0.12, 0, 0]} scale={[1, 1, 1.1]} geometry={headShell(0.045, 1.11)}>
          {m(look.accent)}
        </mesh>
        <mesh position={[0, 0.07, 0.1]} rotation={[0.12, 0, 0]} scale={[1.05, 1, 0.95]} geometry={geo('brim', () => new THREE.CylinderGeometry(0.1, 0.1, 0.012, 18, 1, false, -Math.PI * 0.5, Math.PI))}>
          {m(look.accent)}
        </mesh>
      </>
    );
  if (look.hat === 'beanie')
    return (
      <group rotation={[-0.2, 0, 0]} scale={[1, 1, 1.1]}>
        <mesh position={[0, 0.006, -0.006]} scale={[1, 1.1, 1]} geometry={headShell(0.04, 1.12)}>
          {m(look.accent, knit())}
        </mesh>
        <mesh position={[0, 0.002, -0.006]} geometry={headShell(0.015, 1.17, false, 0.065)} userData={MID}>
          {m(shade(look.accent, -0.12), knit())}
        </mesh>
      </group>
    );
  return null;
}

/** Glasses or shades, in the head group. */
export function Eyewear({ fit }: { fit: Fit }) {
  const { look } = fit;
  if (look.eyewear === 'none') return null;
  const shades = look.eyewear === 'shades';
  const frame = cloth(fit, shades ? '#0B0E14' : '#2A2320', { r: 0.4, metal: 0.2 });
  return (
    <group position={[0, 0.012, 0.127]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.043, 0, 0]}>
          <mesh geometry={geo(`lens-rim|${shades}`, () => new THREE.TorusGeometry(0.024, shades ? 0.0045 : 0.003, 6, 20))} userData={shades ? MID : NEAR}>
            {frame}
          </mesh>
          {shades && (
            <mesh scale={[1, 0.86, 1]} geometry={geo('lens', () => new THREE.CircleGeometry(0.024, 20))} userData={MID}>
              <meshStandardMaterial color="#10131A" roughness={0.1} metalness={0.6} transparent={fit.dim} opacity={fit.dim ? 0.75 : 1} />
            </mesh>
          )}
          {/* the arm back to the ear */}
          <mesh position={[s * 0.047, 0.004, -0.063]} rotation={[0, -s * 0.34, 0]} geometry={geo('temple', () => new THREE.BoxGeometry(0.004, 0.005, 0.135))} userData={NEAR}>
            {frame}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.006, 0.004]} rotation={[0, 0, Math.PI / 2]} geometry={capsule(0.003, 0.03)} userData={NEAR}>
        {frame}
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- chest extras

/** A gold chain around the neck, in the chest group. */
export function Chain({ fit }: { fit: Fit }) {
  const { look, W, torsoH } = fit;
  if (!look.extras.includes('chain')) return null;
  const inf = INFLATE[look.top] * 1.035;
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const phi = -Math.PI + (i / 16) * Math.PI * 2;
    pts.push([phi, 0.985 - 0.14 * Math.pow(Math.max(0, Math.cos(phi)), 1.6)]);
  }
  const pendant = onTorso(look.body, 0, 0.83, inf * 1.02, W, torsoH, DEPTH);
  return (
    <>
      <mesh geometry={torsoTube(`chain|${look.top}`, look.body, pts, inf, W, torsoH, DEPTH, 0.0055, true)} userData={NEAR}>
        {cloth(fit, GOLD, { r: 0.25, metal: 0.9 })}
      </mesh>
      <mesh position={pendant.toArray()} scale={[0.018, 0.022, 0.008]} geometry={smallBall()} userData={NEAR}>
        {cloth(fit, GOLD, { r: 0.25, metal: 0.9 })}
      </mesh>
    </>
  );
}

/** A backpack with straps over both shoulders, in the chest group. Hidden while sitting or lying (see Figure). */
export const Backpack = forwardRef<THREE.Group, { fit: Fit }>(function Backpack({ fit }, ref) {
  const { look, W, torsoH } = fit;
  if (!look.extras.includes('backpack')) return null;
  const inf = INFLATE[look.top];
  const back = torsoR(look.body, 0.6) * inf * DEPTH;
  const strap = shade(look.accent, -0.25);
  return (
    <group ref={ref}>
      <mesh position={[0, torsoH * 0.58, -(back + 0.06)]} scale={[W, 1, 1]} geometry={geo('pack', () => new RoundedBoxGeometry(0.27, 0.32, 0.12, 3, 0.045))} castShadow userData={MID_SHADOW}>
        {cloth(fit, look.accent)}
      </mesh>
      <mesh position={[0, torsoH * 0.47, -(back + 0.13)]} scale={[W, 1, 1]} geometry={geo('pack-pocket', () => new RoundedBoxGeometry(0.19, 0.13, 0.04, 2, 0.015))} userData={NEAR}>
        {cloth(fit, shade(look.accent, -0.1))}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={torsoTube(
            `pack-strap${s}|${look.top}`,
            look.body,
            [[s * 0.48, 0.72], [s * 0.52, 0.83], [s * 0.62, 0.94], [s * 0.85, 0.985], [s * (Math.PI - 0.85), 0.985], [s * (Math.PI - 0.55), 0.9]],
            inf * 1.05,
            W,
            torsoH,
            DEPTH,
            0.014,
          )}
          userData={MID}
        >
          {cloth(fit, strap)}
        </mesh>
      ))}
    </group>
  );
});
