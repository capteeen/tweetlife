'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WALL, type WalkIn } from '@/lib/world/interiors';
import { COUNTRIES, type Country } from '@/lib/world/countries';
import { curfew, governmentOf, pct, todaysAddress } from '@/lib/life/government';
import { BENCHES, CABINET, CABINET_CHAIRS, CABINET_SEAT, DESK, DESK_CHAIR, FLAGS, PODIUM } from '@/lib/world/capitol';
import type { FigureAct } from './figureMoves';
import { Figure } from './Figure';
import { DistanceDetail } from './DistanceDetail';
import { useCountry } from './country';

// The government house interior, in the venue's own frame (door at +z). Every piece stands where
// lib/world/capitol.ts says, so the furniture you see is the furniture you bump into and the chairs the
// president and the cabinet sit on. The president's desk is an executive pedestal desk (drawers on the
// president's side, raised panels and the coin's seal on the visitors' side) with a working computer: the
// monitor shows a live chart of the country's coin, its back carries the logo the visitors see.

const FONT = '/fonts/inter-600.woff';
const MARBLE = '#F4F0E8';
const GOLD = '#C9A227';
const BRASS = '#B8913A';
const MAHOGANY = '#4A2616';
const MAHOGANY_LIGHT = '#5E3420';
const MAHOGANY_DARK = '#2A160C';
const LEATHER = '#3A1712';
const LEATHER_GREEN = '#1F3A2B';
const CHROME = '#C9CED6';
const PLASTIC = '#16181D';

type V3 = [number, number, number];

const geos = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}
const unitBox = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const rounded = (s: V3, r: number) => geo(`rb:${s.join(':')}:${r}`, () => new RoundedBoxGeometry(s[0], s[1], s[2], 3, r));

type Look = { c: string; rough?: number; metal?: number; glow?: string; glowI?: number };
const mat = ({ c, rough = 0.6, metal = 0, glow, glowI = 1 }: Look) => (
  <meshStandardMaterial color={c} roughness={rough} metalness={metal} emissive={glow ?? '#000000'} emissiveIntensity={glow ? glowI : 0} />
);

/** A box, or a box with rounded edges when `round` is set. */
function Part({ p, s, round, rot, shadow = true, ...look }: { p: V3; s: V3; round?: number; rot?: V3; shadow?: boolean } & Look) {
  return (
    <mesh position={p} rotation={rot} scale={round ? undefined : s} geometry={round ? rounded(s, round) : unitBox()} castShadow={shadow} receiveShadow>
      {mat(look)}
    </mesh>
  );
}

function Cyl({ p, r, h, rt, seg = 16, rot, shadow = true, ...look }: { p: V3; r: number; h: number; rt?: number; seg?: number; rot?: V3; shadow?: boolean } & Look) {
  return (
    <mesh position={p} rotation={rot} geometry={geo(`cyl:${rt ?? r}:${r}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt ?? r, r, h, seg))} castShadow={shadow}>
      {mat(look)}
    </mesh>
  );
}

// ------------------------------------------------------------------ logos, flags, columns

const logoCache = new Map<string, THREE.CanvasTexture>();
/** The coin's official logo (Country.logo, an SVG) drawn onto a canvas texture, or null while it loads. */
function useLogo(src: string) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(() => logoCache.get(src) ?? null);
  useEffect(() => {
    const hit = logoCache.get(src);
    if (hit) return void setTex(hit);
    let live = true;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      logoCache.set(src, t);
      if (live) setTex(t);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return tex;
}

/** The logo on a square, transparent around its shape. */
function Logo({ c, size, position, rotation, glow = 0.35 }: { c: Country; size: number; position: V3; rotation?: V3; glow?: number }) {
  const tex = useLogo(c.logo);
  if (!tex) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.05} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={glow} toneMapped={false} />
    </mesh>
  );
}

/** A round gold seal: rim, the coin's ink and its logo. Faces +z. */
function Seal({ c, r, position, rotation }: { c: Country; r: number; position: V3; rotation?: V3 }) {
  return (
    <group position={position} rotation={rotation}>
      <Cyl p={[0, 0, 0]} r={r} h={0.02} seg={32} rot={[Math.PI / 2, 0, 0]} c={GOLD} metal={0.85} rough={0.25} shadow={false} />
      <mesh position={[0, 0, 0.011]}>
        <circleGeometry args={[r * 0.82, 32]} />
        <meshStandardMaterial color={c.theme.ink} roughness={0.5} />
      </mesh>
      <Logo c={c} size={r * 1.25} position={[0, 0, 0.013]} />
    </group>
  );
}

/** A flag on a pole: the coin's two colours with its logo. */
function Flag({ c, position, dir = 1 }: { c: Country; position: V3; dir?: 1 | -1 }) {
  const cloth = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 1.3 + position[0]) * 0.12;
  });
  return (
    <group position={position}>
      <Cyl p={[0, 0.05, 0]} r={0.16} rt={0.12} h={0.1} c={MAHOGANY_DARK} />
      <Cyl p={[0, 1.3, 0]} r={0.03} h={2.5} c={GOLD} metal={0.8} rough={0.3} />
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.25} />
      </mesh>
      <group ref={cloth} position={[dir * 0.03, 2.1, 0]}>
        <Part p={[dir * 0.55, 0.18, 0]} s={[1.1, 0.36, 0.02]} c={c.theme.primary} rough={0.9} />
        <Part p={[dir * 0.55, -0.18, 0]} s={[1.1, 0.36, 0.02]} c={c.theme.secondary} rough={0.9} />
        <Part p={[dir * 1.1, 0, 0]} s={[0.03, 0.74, 0.03]} c={GOLD} metal={0.7} rough={0.3} shadow={false} />
        <mesh position={[dir * 0.55, 0, 0.012]}>
          <circleGeometry args={[0.24, 24]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.32} position={[dir * 0.55, 0, 0.016]} />
      </group>
    </group>
  );
}

function Column({ position, h }: { position: V3; h: number }) {
  return (
    <group position={position}>
      <Part p={[0, 0.15, 0]} s={[0.9, 0.3, 0.9]} c={MARBLE} rough={0.5} />
      <Cyl p={[0, h / 2, 0]} r={0.34} rt={0.3} h={h - 0.4} seg={18} c={MARBLE} rough={0.45} />
      <Part p={[0, h - 0.1, 0]} s={[0.9, 0.25, 0.9]} c={MARBLE} rough={0.5} />
    </group>
  );
}

// ------------------------------------------------------------------ the president's desk

/** Executive pedestal desk. Top at DESK.h; the president's side (with the drawers and the kneehole) is -z. */
function ExecutiveDesk({ c }: { c: Country }) {
  const { w, d, h } = DESK;
  const plinth = 0.08;
  const bodyTop = h - 0.072;
  const bodyH = bodyTop - plinth;
  const pedW = 0.86;
  const pedX = w / 2 - pedW / 2;
  const drawers = [0.24, 0.19, 0.19];
  return (
    <group>
      {/* the top: mahogany with a gold band under its edge, a leather writing surface with a gold inlay */}
      <Part p={[0, h - 0.03, 0]} s={[w + 0.1, 0.06, d + 0.1]} round={0.022} c={MAHOGANY} rough={0.32} />
      <Part p={[0, h - 0.066, 0]} s={[w + 0.03, 0.014, d + 0.03]} c={GOLD} metal={0.85} rough={0.28} shadow={false} />
      <Part p={[0, h + 0.0015, -0.04]} s={[w - 0.62, 0.003, d - 0.38]} c={GOLD} metal={0.85} rough={0.3} shadow={false} />
      <Part p={[0, h + 0.003, -0.04]} s={[w - 0.66, 0.003, d - 0.42]} c={LEATHER_GREEN} rough={0.85} shadow={false} />

      {/* two pedestals of three drawers each on the president's side, brass pulls */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * pedX, 0, 0]}>
          <Part p={[0, plinth + bodyH / 2, 0]} s={[pedW, bodyH, d - 0.06]} c={MAHOGANY} rough={0.4} />
          <Part p={[0, plinth / 2, 0]} s={[pedW - 0.06, plinth, d - 0.14]} c={MAHOGANY_DARK} rough={0.6} />
          {/* a raised panel on the outer side */}
          <Part p={[s * (pedW / 2 + 0.006), plinth + bodyH / 2, 0.02]} s={[0.012, bodyH - 0.16, d - 0.36]} c={MAHOGANY_LIGHT} rough={0.4} shadow={false} />
          {drawers.map((dh, i) => {
            const top = bodyTop - 0.03 - drawers.slice(0, i).reduce((a, b) => a + b, 0);
            const y = top - dh / 2;
            return (
              <group key={i} position={[0, y, -(d - 0.06) / 2]}>
                <Part p={[0, 0, -0.012]} s={[pedW - 0.1, dh - 0.03, 0.024]} round={0.008} c={MAHOGANY_LIGHT} rough={0.38} shadow={false} />
                <Part p={[0, 0.01, -0.032]} s={[0.2, 0.022, 0.018]} round={0.008} c={BRASS} metal={0.9} rough={0.25} shadow={false} />
              </group>
            );
          })}
        </group>
      ))}

      {/* the modesty panel across the visitors' side: three raised panels in gold frames, the seal in the middle */}
      <Part p={[0, plinth + bodyH / 2, d / 2 - 0.05]} s={[w - 0.02, bodyH, 0.04]} c={MAHOGANY} rough={0.4} />
      <Part p={[0, plinth / 2, d / 2 - 0.09]} s={[w - 0.08, plinth, 0.06]} c={MAHOGANY_DARK} rough={0.6} />
      {[
        [-pedX, pedW - 0.18],
        [0, w - 2 * pedW - 0.12],
        [pedX, pedW - 0.18],
      ].map(([x, pw], i) => (
        <group key={i} position={[x, plinth + bodyH / 2, d / 2 - 0.03]}>
          <Part p={[0, 0, 0.004]} s={[pw + 0.035, bodyH - 0.13, 0.01]} c={GOLD} metal={0.8} rough={0.3} shadow={false} />
          <Part p={[0, 0, 0.012]} s={[pw, bodyH - 0.165, 0.016]} round={0.006} c={MAHOGANY_LIGHT} rough={0.36} shadow={false} />
        </group>
      ))}
      <Seal c={c} r={0.17} position={[0, plinth + bodyH / 2 + 0.02, d / 2 + 0.002]} />
    </group>
  );
}

// a chart of the country's coin for the president's monitor: a random walk that moves on every tick
function walk(seed: number, n: number, from: number) {
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < n + from; i++) {
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    v *= 1 + ((x - Math.floor(x)) - 0.48) * 0.035;
    if (i >= from) out.push(v);
  }
  return out;
}

function useChart(c: Country) {
  const logo = useLogo(c.logo);
  const [tex] = useState(() => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 300;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  useEffect(() => {
    const seed = c.ticker.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 1000;
    const draw = () => {
      const cv = tex.image as HTMLCanvasElement;
      const g = cv.getContext('2d')!;
      const step = Math.floor(Date.now() / 2000);
      const pts = walk(seed, 64, step % 5000);
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const last = pts[pts.length - 1], first = pts[0];
      const up = last >= first;
      g.fillStyle = '#0B0E14';
      g.fillRect(0, 0, 512, 300);
      // header: logo, ticker, price and change
      g.fillStyle = c.theme.ink;
      g.fillRect(0, 0, 512, 52);
      if (logo) g.drawImage(logo.image as HTMLCanvasElement, 12, 8, 36, 36);
      g.font = '600 24px Inter, Arial, sans-serif';
      g.fillStyle = '#FFFFFF';
      g.fillText(`${c.ticker} / USD`, 58, 34);
      g.textAlign = 'right';
      g.fillStyle = up ? '#14F195' : '#FF4D6D';
      g.fillText(`${(last * 1.37).toFixed(2)}  ${up ? '+' : ''}${(((last - first) / first) * 100).toFixed(2)}%`, 500, 34);
      g.textAlign = 'left';
      // grid
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        g.beginPath();
        g.moveTo(0, 52 + i * 48);
        g.lineTo(512, 52 + i * 48);
        g.stroke();
      }
      // volume bars, then the price line with a fill under it
      const x = (i: number) => 10 + (i / (pts.length - 1)) * 492;
      const y = (v: number) => 268 - ((v - lo) / (hi - lo || 1)) * 196;
      pts.forEach((v, i) => {
        const prev = pts[Math.max(0, i - 1)];
        g.fillStyle = v >= prev ? 'rgba(20,241,149,0.35)' : 'rgba(255,77,109,0.35)';
        const vh = 6 + (Math.abs(v - prev) / (hi - lo || 1)) * 120;
        g.fillRect(x(i) - 3, 296 - vh, 6, vh);
      });
      const line = up ? '#14F195' : '#FF4D6D';
      const grad = g.createLinearGradient(0, 60, 0, 290);
      grad.addColorStop(0, up ? 'rgba(20,241,149,0.35)' : 'rgba(255,77,109,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath();
      pts.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
      g.lineTo(x(pts.length - 1), 296);
      g.lineTo(x(0), 296);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.beginPath();
      pts.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
      g.strokeStyle = line;
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.arc(x(pts.length - 1), y(last), 5, 0, Math.PI * 2);
      g.fillStyle = '#FFFFFF';
      g.fill();
      tex.needsUpdate = true;
    };
    draw();
    const id = setInterval(draw, 2000);
    return () => clearInterval(id);
  }, [c, logo, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

let keysTex: THREE.CanvasTexture | null = null;
function keyboardTexture() {
  if (keysTex) return keysTex;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 80;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0E1014';
  g.fillRect(0, 0, 256, 80);
  g.fillStyle = '#2A2E36';
  const rows = [14, 14, 13, 12];
  rows.forEach((n, r) => {
    const kw = 256 / 15;
    for (let i = 0; i < n; i++) g.fillRect(4 + i * kw + r * 4, 4 + r * 15, kw - 3, 12);
  });
  g.fillRect(60, 64, 130, 12); // space bar
  keysTex = new THREE.CanvasTexture(cv);
  keysTex.colorSpace = THREE.SRGBColorSpace;
  return keysTex;
}

/** The monitor faces the president; its back, with the coin's logo, faces the visitors. */
function Computer({ c, on }: { c: Country; on: boolean }) {
  const chart = useChart(c);
  return (
    <group>
      {/* stand: a weighted foot, a neck, the panel tilted back a touch */}
      <Part p={[0, 0.008, 0]} s={[0.28, 0.016, 0.2]} round={0.007} c="#2B2F36" metal={0.7} rough={0.35} />
      <Part p={[0, 0.2, -0.055]} s={[0.06, 0.38, 0.025]} round={0.01} c="#2B2F36" metal={0.7} rough={0.35} rot={[0.12, 0, 0]} />
      <group position={[0, 0.43, 0]} rotation={[-0.08, 0, 0]}>
        <Part p={[0, 0, 0]} s={[0.76, 0.46, 0.032]} round={0.012} c={PLASTIC} rough={0.4} />
        <mesh position={[0, 0.012, 0.0165]}>
          <planeGeometry args={[0.72, 0.4]} />
          <meshStandardMaterial map={on ? chart : null} color={on ? '#FFFFFF' : '#06070A'} emissive="#FFFFFF" emissiveMap={on ? chart : null} emissiveIntensity={on ? 0.9 : 0} roughness={0.25} toneMapped={false} />
        </mesh>
        <Logo c={c} size={0.12} position={[0, 0.03, -0.0175]} rotation={[0, Math.PI, 0]} glow={on ? 0.8 : 0.1} />
        <mesh position={[0, -0.212, 0.0165]}>
          <circleGeometry args={[0.005, 8]} />
          <meshBasicMaterial color={on ? '#7CFF9A' : '#333333'} />
        </mesh>
      </group>
    </group>
  );
}

/** Everything on the desk. Positions are on the desk top, in the desk's frame (president at -z). */
function DeskProps({ c, president, on }: { c: Country; president: string; on: boolean }) {
  const { w, d, h } = DESK;
  const keys = useMemo(() => keyboardTexture(), []);
  return (
    <group position={[0, h, 0]}>
      {/* the computer on the president's right, keyboard and mouse in front of it */}
      <group position={[0.9, 0, -0.18]} rotation={[0, Math.PI + 0.95, 0]}>
        <Computer c={c} on={on} />
      </group>
      <group position={[0.42, 0, -0.36]} rotation={[0, 0.32, 0]}>
        <Part p={[0, 0.01, 0]} s={[0.44, 0.02, 0.14]} round={0.006} c="#20232A" rough={0.5} shadow={false} />
        <mesh position={[0, 0.0205, 0]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[0.42, 0.125]} />
          <meshStandardMaterial map={keys} roughness={0.6} />
        </mesh>
      </group>
      <Part p={[0.8, 0.0015, -0.44]} s={[0.24, 0.003, 0.2]} c="#0E1014" rough={0.9} shadow={false} />
      <Part p={[0.8, 0.013, -0.45]} s={[0.06, 0.022, 0.1]} round={0.01} c={PLASTIC} rough={0.35} shadow={false} />

      {/* a banker's lamp: brass foot and stem, the green glass shade lit from inside */}
      <group position={[-1.2, 0, -0.12]}>
        <Cyl p={[0, 0.015, 0]} r={0.1} rt={0.085} h={0.03} c={BRASS} metal={0.9} rough={0.25} />
        <Cyl p={[0, 0.17, 0]} r={0.012} h={0.3} c={BRASS} metal={0.9} rough={0.25} />
        <Part p={[0, 0.31, 0]} s={[0.3, 0.012, 0.012]} c={BRASS} metal={0.9} rough={0.25} shadow={false} />
        <mesh position={[0, 0.33, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.075, 0.075, 0.38, 20, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color="#1F6B3A" roughness={0.2} metalness={0.1} side={THREE.DoubleSide} emissive="#3DFF8A" emissiveIntensity={on ? 0.25 : 0} />
        </mesh>
        <Cyl p={[0, 0.29, 0]} r={0.018} h={0.3} rot={[0, 0, Math.PI / 2]} c="#FFF4C8" glow="#FFE39A" glowI={on ? 2.2 : 0} shadow={false} />
        <Cyl p={[0.1, 0.2, 0.05]} r={0.004} h={0.2} c={BRASS} metal={0.9} shadow={false} />
      </group>

      {/* the nameplate on the visitors' edge */}
      <group position={[0, 0, d / 2 - 0.1]}>
        <Part p={[0, 0.014, 0]} s={[0.7, 0.028, 0.09]} round={0.008} c={MAHOGANY_DARK} rough={0.4} shadow={false} />
        <Part p={[0, 0.06, 0.012]} s={[0.66, 0.085, 0.012]} c={GOLD} metal={0.6} rough={0.3} glow="#8A6A1A" glowI={0.6} rot={[-0.3, 0, 0]} shadow={false} />
        <Text font={FONT} position={[0, 0.062, 0.02]} rotation={[-0.3, 0, 0]} fontSize={0.04} color="#2A1A0A" anchorX="center" anchorY="middle" maxWidth={0.62}>
          {`PRESIDENT ${president.toUpperCase()}`}
        </Text>
      </group>

      {/* a desk phone with its handset and keypad */}
      <group position={[-0.72, 0, -0.26]} rotation={[0, -0.3, 0]}>
        <Part p={[0, 0.03, 0]} s={[0.2, 0.06, 0.18]} round={0.02} c={PLASTIC} rough={0.4} shadow={false} />
        <Part p={[0, 0.075, -0.04]} s={[0.23, 0.035, 0.055]} round={0.016} c={PLASTIC} rough={0.35} shadow={false} />
        <Part p={[0, 0.061, 0.045]} s={[0.11, 0.004, 0.07]} c="#3A3F48" rough={0.6} shadow={false} rot={[0.25, 0, 0]} />
      </group>

      {/* the open folder he signs on, in the country's colour, and a fountain pen */}
      <group position={[-0.12, 0, -0.34]} rotation={[0, 0.12, 0]}>
        <Part p={[0, 0.005, 0]} s={[0.46, 0.01, 0.3]} c={c.theme.primary} rough={0.7} shadow={false} />
        <Part p={[0.11, 0.012, 0]} s={[0.2, 0.004, 0.27]} c="#F7F3E8" rough={0.9} shadow={false} />
        <Part p={[-0.11, 0.012, 0]} s={[0.2, 0.004, 0.27]} c="#F7F3E8" rough={0.9} shadow={false} />
        <Logo c={c} size={0.07} position={[-0.11, 0.0145, -0.08]} rotation={[-Math.PI / 2, 0, 0]} glow={0.1} />
        <Cyl p={[0.13, 0.02, 0.04]} r={0.007} h={0.15} rot={[Math.PI / 2, 0, 0.6]} c="#101010" metal={0.4} rough={0.3} shadow={false} />
      </group>

      {/* a pen cup, a stack of bills to sign and a mug */}
      <group position={[-1.38, 0, 0.28]}>
        <Cyl p={[0, 0.055, 0]} r={0.04} h={0.11} c={LEATHER} rough={0.6} shadow={false} />
        <Cyl p={[0.01, 0.13, 0]} r={0.005} h={0.12} rot={[0, 0, 0.15]} c="#1A1A1A" shadow={false} />
        <Cyl p={[-0.012, 0.13, 0.01]} r={0.005} h={0.12} rot={[0.15, 0, -0.1]} c={GOLD} metal={0.8} shadow={false} />
      </group>
      <group position={[-0.62, 0, 0.2]} rotation={[0, 0.08, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <Part key={i} p={[i * 0.006, 0.006 + i * 0.012, i * 0.004]} s={[0.24, 0.011, 0.32]} c={i % 2 ? '#F2EEE3' : '#E8E2D2'} rough={0.95} shadow={false} rot={[0, i * 0.05, 0]} />
        ))}
      </group>
      <group position={[1.3, 0, 0.25]}>
        <Cyl p={[0, 0.048, 0]} r={0.042} h={0.096} c={c.theme.primary} rough={0.4} shadow={false} />
        <mesh position={[0.045, 0.05, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.024, 0.007, 6, 12]} />
          <meshStandardMaterial color={c.theme.primary} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.093, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.036, 16]} />
          <meshStandardMaterial color="#3B2414" roughness={0.2} />
        </mesh>
      </group>
      {/* the desk's own little flag */}
      <group position={[w / 2 - 0.22, 0, d / 2 - 0.18]}>
        <Cyl p={[0, 0.01, 0]} r={0.05} h={0.02} c={GOLD} metal={0.85} rough={0.25} shadow={false} />
        <Cyl p={[0, 0.17, 0]} r={0.004} h={0.32} c={GOLD} metal={0.85} shadow={false} />
        <Part p={[0.075, 0.29, 0]} s={[0.15, 0.05, 0.003]} c={c.theme.primary} shadow={false} />
        <Part p={[0.075, 0.24, 0]} s={[0.15, 0.05, 0.003]} c={c.theme.secondary} shadow={false} />
      </group>
    </group>
  );
}

/** A tall leather executive chair: back at -z, the top of the cushion at `seat`, on a five-star base. */
function ExecutiveChair({ seat }: { seat: number }) {
  const look = { c: LEATHER, rough: 0.45 };
  return (
    <group>
      {/* five-star base with casters, a chrome gas lift, the tilt plate */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <Part p={[0, 0.075, 0.17]} s={[0.05, 0.035, 0.32]} round={0.012} c={CHROME} metal={0.9} rough={0.2} rot={[-0.08, 0, 0]} />
            <mesh position={[0, 0.032, 0.32]} rotation={[0, 0, Math.PI / 2]} geometry={geo('caster', () => new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12))}>
              <meshStandardMaterial color={PLASTIC} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
      <Cyl p={[0, 0.09, 0]} r={0.055} rt={0.045} h={0.06} c={CHROME} metal={0.9} rough={0.2} />
      <Cyl p={[0, 0.2, 0]} r={0.035} h={0.2} c={PLASTIC} rough={0.4} />
      <Cyl p={[0, (0.3 + seat - 0.13) / 2, 0]} r={0.022} h={seat - 0.13 - 0.3} c={CHROME} metal={0.95} rough={0.15} />
      <Part p={[0, seat - 0.13, -0.02]} s={[0.3, 0.035, 0.3]} c="#2A2D33" metal={0.5} rough={0.4} />
      {/* the seat cushion, piped at the edge */}
      <Part p={[0, seat - 0.055, 0]} s={[0.6, 0.11, 0.56]} round={0.045} {...look} />
      <Part p={[0, seat - 0.11, 0]} s={[0.62, 0.02, 0.58]} round={0.008} c="#1E0B08" rough={0.5} shadow={false} />
      {/* the tall tufted back with its headrest, leaning back a little */}
      <group position={[0, seat + 0.05, -0.3]} rotation={[-0.12, 0, 0]}>
        <Part p={[0, 0.42, 0]} s={[0.58, 0.84, 0.13]} round={0.05} {...look} />
        {[0.13, 0.31, 0.49, 0.67].map((y) => (
          <Part key={y} p={[0, y, 0.06]} s={[0.48, 0.16, 0.05]} round={0.024} {...look} shadow={false} />
        ))}
        {[-0.12, 0, 0.12].flatMap((x) =>
          [0.22, 0.4, 0.58].map((y) => (
            <mesh key={`${x}:${y}`} position={[x, y, 0.086]} geometry={geo('tuft', () => new THREE.SphereGeometry(0.011, 8, 6))}>
              <meshStandardMaterial color="#1E0B08" roughness={0.4} />
            </mesh>
          )),
        )}
        <Part p={[0, 0.93, 0.01]} s={[0.46, 0.17, 0.14]} round={0.06} {...look} />
        <Part p={[0, 0.42, -0.07]} s={[0.5, 0.7, 0.02]} round={0.008} c="#1E0B08" rough={0.6} shadow={false} />
      </group>
      {/* armrests on chrome uprights */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.33, seat, -0.07]}>
          <Part p={[0, 0.06, -0.02]} s={[0.035, 0.16, 0.05]} round={0.01} c={CHROME} metal={0.9} rough={0.2} />
          <Part p={[0, 0.15, 0]} s={[0.075, 0.04, 0.32]} round={0.018} {...look} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ the rest of the room

/** A town-hall pew facing the desk (back at +z), with a cushion in the country's colour. */
function Bench({ w, d, color }: { w: number; d: number; color: string }) {
  return (
    <group>
      <Part p={[0, 0.42, 0]} s={[w, 0.06, d - 0.08]} round={0.015} c={MAHOGANY} rough={0.4} />
      <Part p={[0, 0.465, -0.03]} s={[w - 0.16, 0.04, d - 0.2]} round={0.018} c={color} rough={0.85} shadow={false} />
      <Part p={[0, 0.74, d / 2 - 0.06]} s={[w, 0.58, 0.05]} round={0.012} c={MAHOGANY} rough={0.4} rot={[0.1, 0, 0]} />
      <Part p={[0, 1.04, d / 2 - 0.03]} s={[w + 0.04, 0.05, 0.09]} round={0.015} c={MAHOGANY_DARK} rough={0.4} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.025), 0, 0]}>
          <Part p={[0, 0.33, 0.02]} s={[0.05, 0.66, d]} round={0.012} c={MAHOGANY_DARK} rough={0.45} />
          <Part p={[0, 0.68, 0.02]} s={[0.08, 0.04, d + 0.02]} round={0.015} c={MAHOGANY_DARK} rough={0.45} />
        </group>
      ))}
    </group>
  );
}

/** A cabinet chair: leather seat at CABINET_SEAT on a swivel column, back at -z. */
function CabinetChair({ color }: { color: string }) {
  const seat = CABINET_SEAT;
  const leather = '#26282E';
  return (
    <group>
      <Cyl p={[0, 0.03, 0]} r={0.26} rt={0.22} h={0.04} seg={20} c={CHROME} metal={0.9} rough={0.25} />
      <Cyl p={[0, (seat - 0.1) / 2, 0]} r={0.025} h={seat - 0.1} c={CHROME} metal={0.9} rough={0.2} />
      <Part p={[0, seat - 0.05, 0]} s={[0.52, 0.1, 0.5]} round={0.04} c={leather} rough={0.45} />
      <Part p={[0, seat - 0.095, 0]} s={[0.54, 0.014, 0.52]} round={0.006} c={color} rough={0.5} shadow={false} />
      <group position={[0, seat + 0.36, -0.25]} rotation={[-0.1, 0, 0]}>
        <Part p={[0, 0, 0]} s={[0.5, 0.6, 0.09]} round={0.04} c={leather} rough={0.45} />
        <Part p={[0, 0.06, 0.046]} s={[0.36, 0.36, 0.01]} round={0.004} c={color} rough={0.5} shadow={false} />
        <Part p={[0, 0.06, 0.05]} s={[0.33, 0.33, 0.01]} round={0.004} c={leather} rough={0.45} shadow={false} />
      </group>
      {[-1, 1].map((s) => (
        <Part key={s} p={[s * 0.28, seat + 0.15, -0.05]} s={[0.06, 0.04, 0.32]} round={0.015} c={PLASTIC} rough={0.4} />
      ))}
    </group>
  );
}

/** The cabinet table: a long mahogany top with a runner in the country's colour, notepads at each seat. */
function CabinetTable({ c }: { c: Country }) {
  const { w, d, h } = CABINET;
  return (
    <group>
      <Part p={[0, h - 0.03, 0]} s={[w, 0.06, d]} round={0.025} c={MAHOGANY} rough={0.3} />
      <Part p={[0, h - 0.065, 0]} s={[w - 0.06, 0.012, d - 0.06]} c={GOLD} metal={0.85} rough={0.3} shadow={false} />
      <Part p={[0, h + 0.002, 0]} s={[0.42, 0.004, d - 0.5]} c={c.theme.primary} rough={0.9} shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * (d / 2 - 0.7)]}>
          <Part p={[0, (h - 0.06) / 2 + 0.04, 0]} s={[0.36, h - 0.14, 0.36]} c={MAHOGANY_DARK} rough={0.45} />
          <Part p={[0, 0.03, 0]} s={[0.9, 0.06, 0.5]} round={0.02} c={MAHOGANY_DARK} rough={0.45} />
        </group>
      ))}
      {CABINET_CHAIRS.map((ch, i) => {
        const x = ch.x - CABINET.x + -ch.side * 0.5;
        return (
          <group key={i} position={[x, h, ch.z - CABINET.z]}>
            <Part p={[0, 0.006, 0]} s={[0.22, 0.012, 0.3]} c="#F7F3E8" rough={0.95} shadow={false} />
            <Cyl p={[-ch.side * 0.05, 0.016, 0.02]} r={0.006} h={0.14} rot={[Math.PI / 2, 0, 0.3]} c="#1A1A1A" shadow={false} />
          </group>
        );
      })}
      {/* water carafe and glasses */}
      <Cyl p={[0, h + 0.13, 0]} r={0.07} rt={0.04} h={0.26} c="#CFE8F5" rough={0.05} metal={0.1} shadow={false} />
      {[-0.4, 0.4].map((z) => (
        <Cyl key={z} p={[0.12, h + 0.05, z]} r={0.032} h={0.1} c="#DDEFF8" rough={0.05} shadow={false} />
      ))}
    </group>
  );
}

/** A lectern with a slanted top, the seal on its front and a gooseneck microphone. Faces +z. */
function Lectern({ c }: { c: Country }) {
  const { w, d, h } = PODIUM;
  return (
    <group>
      <Part p={[0, 0.04, 0]} s={[w + 0.1, 0.08, d + 0.1]} round={0.02} c={MAHOGANY_DARK} rough={0.45} />
      <Part p={[0, h / 2, 0]} s={[w - 0.1, h - 0.1, d - 0.1]} round={0.02} c={MAHOGANY} rough={0.4} />
      <Part p={[0, h - 0.02, -0.02]} s={[w, 0.05, d]} round={0.015} c={MAHOGANY_LIGHT} rough={0.35} rot={[0.18, 0, 0]} />
      <Part p={[0, h / 2, d / 2 - 0.045]} s={[w - 0.3, h - 0.4, 0.012]} c={GOLD} metal={0.8} rough={0.3} shadow={false} />
      <Seal c={c} r={0.2} position={[0, h / 2 + 0.03, d / 2 - 0.035]} />
      <Cyl p={[0.25, h + 0.14, 0]} r={0.008} h={0.3} rot={[-0.5, 0, 0]} c="#1A1A1A" metal={0.6} shadow={false} />
      <Cyl p={[0.25, h + 0.28, -0.1]} r={0.022} rt={0.018} h={0.07} rot={[-1.1, 0, 0]} c="#2A2A2A" rough={0.6} shadow={false} />
    </group>
  );
}

function Guard({ seed, position }: { seed: string; position: V3 }) {
  const act = useRef<FigureAct | null>(null);
  const speed = useRef(0);
  return (
    <group position={position}>
      <Figure seed={seed} actRef={act} speedRef={speed} dim />
    </group>
  );
}

/** The government house: the president's desk and chair under the seal, flags, the lectern with today's
 *  address on the big screen behind it, benches for town halls, the cabinet table, columns and a dome. */
export function Capitol({ k, y }: { k: WalkIn; y: number }) {
  const country = useCountry();
  const c = COUNTRIES[country];
  const g = governmentOf(country);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const address = todaysAddress(country, now);
  const closed = curfew(now).on;
  const back = -k.d / 2 + WALL;
  const right = k.w / 2 - WALL;
  const seal = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (seal.current) (seal.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 1.5) * 0.25;
  });
  return (
    <group>
      {/* the carpet from the door to the desk, in the country's colour with a gold border */}
      <Part p={[0, y + 0.012, 0.9]} s={[2.0, 0.02, k.d - 4.0]} c={GOLD} rough={1} shadow={false} />
      <Part p={[0, y + 0.02, 0.9]} s={[1.84, 0.02, k.d - 4.16]} c={c.theme.primary} rough={1} shadow={false} />
      <Part p={[0, y + 0.026, 0.9]} s={[1.3, 0.02, k.d - 4.6]} c={c.theme.ink} rough={1} shadow={false} />
      {/* a rug under the desk */}
      <Part p={[DESK.x, y + 0.012, DESK.z - 0.3]} s={[4.6, 0.02, 2.6]} c={c.theme.ink} rough={1} shadow={false} />
      <Part p={[DESK.x, y + 0.016, DESK.z - 0.3]} s={[4.3, 0.02, 2.3]} c="#7A1F1F" rough={1} shadow={false} />

      {/* the desk, the president's chair, what's on the desk */}
      <group position={[DESK.x, y, DESK.z]}>
        <ExecutiveDesk c={c} />
        <DistanceDetail shadowWithin={16} hideBeyond={40}>
          {/* the desk runs on the State House generator, so the computer and the lamp stay on through NEPA */}
          <DeskProps c={c} president={c.president} on />
        </DistanceDetail>
      </group>
      <group position={[DESK_CHAIR.x, y, DESK_CHAIR.z]}>
        <ExecutiveChair seat={DESK_CHAIR.seat} />
      </group>

      {/* the seal and the motto on the back wall */}
      <group position={[0, y + 3.2, back + 0.06]}>
        <mesh ref={seal} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.05, 1.05, 0.08, 40]} />
          <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} emissive={c.theme.primary} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[0.85, 40]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.78} position={[0, 0.12, 0.07]} />
        <Text font={FONT} position={[0, -0.5, 0.07]} fontSize={0.11} color="#FFFFFF" anchorX="center" anchorY="middle" maxWidth={1.4} textAlign="center">
          {`REPUBLIC OF ${c.name.toUpperCase()}`}
        </Text>
      </group>
      <Text font={FONT} position={[0, y + 4.75, back + 0.05]} fontSize={0.24} color={MAHOGANY} anchorX="center" anchorY="middle">
        {`"${c.motto}"`}
      </Text>
      {FLAGS.map((f) => (
        <Flag key={f.x} c={c} position={[f.x, y, f.z]} dir={f.dir} />
      ))}

      {/* the lectern, and today's address on the big screen behind it */}
      <group position={[PODIUM.x, y, PODIUM.z]} rotation={[0, PODIUM.rot, 0]}>
        <Lectern c={c} />
      </group>
      <group position={[-5.1, y + 3.0, back + 0.08]}>
        <Part p={[0, 0, 0]} s={[4.8, 2.6, 0.1]} round={0.03} c="#0B0E14" rough={0.4} />
        <Part p={[0, 0, 0.06]} s={[4.6, 2.4, 0.02]} c={c.theme.ink} glow={c.theme.ink} glowI={0.4} shadow={false} />
        <mesh position={[0, 0.98, 0.075]}>
          <planeGeometry args={[4.6, 0.44]} />
          <meshStandardMaterial color={c.theme.primary} emissive={c.theme.primary} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>
        <mesh position={[-2.0, 0.98, 0.08]}>
          <circleGeometry args={[0.19, 24]} />
          <meshStandardMaterial color={c.theme.ink} />
        </mesh>
        <Logo c={c} size={0.26} position={[-2.0, 0.98, 0.085]} />
        <Text font={FONT} position={[0.15, 0.98, 0.085]} fontSize={0.19} color="#FFFFFF" anchorX="center" anchorY="middle">
          {closed ? 'CURFEW · NEPA HAS TAKEN LIGHT' : `TODAY'S ADDRESS · PRESIDENT ${c.president.toUpperCase()}`}
        </Text>
        <Text font={FONT} position={[0, 0.0, 0.085]} fontSize={0.2} lineHeight={1.25} color="#FFFFFF" anchorX="center" anchorY="middle" maxWidth={4.2} textAlign="center">
          {`"${address.text}"`}
        </Text>
        <Text font={FONT} position={[0, -0.95, 0.085]} fontSize={0.16} color={c.theme.accent} anchorX="center" anchorY="middle" maxWidth={4.4}>
          {`TRADE TAX ${pct(g.rules.tradeTax)} · STIPEND ${g.rules.stipend} BAGS A DAY`}
        </Text>
      </group>

      {/* town-hall benches */}
      {BENCHES.map((b) => (
        <group key={`${b.x}:${b.z}`} position={[b.x, y, b.z]}>
          <Bench w={b.w} d={b.d} color={c.theme.primary} />
        </group>
      ))}

      {/* the cabinet table and its chairs, with the room's name on the wall */}
      <group position={[CABINET.x, y, CABINET.z]}>
        <CabinetTable c={c} />
      </group>
      {CABINET_CHAIRS.map((ch, i) => (
        <group key={i} position={[ch.x, y, ch.z]} rotation={[0, -ch.side * (Math.PI / 2), 0]}>
          <CabinetChair color={c.theme.primary} />
        </group>
      ))}
      <Text font={FONT} position={[right - 0.02, y + 2.6, CABINET.z]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.3} color={MAHOGANY} anchorX="center" anchorY="middle">
        CABINET ROOM
      </Text>
      <Seal c={c} r={0.35} position={[right - 0.03, y + 3.4, CABINET.z]} rotation={[0, -Math.PI / 2, 0]} />

      {/* marble columns at the front corners, and a dome over the back */}
      {[-1, 1].map((s) => <Column key={s} position={[s * (k.w / 2 - 0.3), y, k.d / 2 + 0.6]} h={k.h + 0.4} />)}
      <group position={[0, y + k.h, back - 0.4]}>
        <Cyl p={[0, 0.6, 0]} r={2.3} h={1.2} seg={28} c={MARBLE} rough={0.5} />
        <mesh position={[0, 1.2, 0]} castShadow>
          <sphereGeometry args={[2.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={c.theme.primary} metalness={0.5} roughness={0.35} />
        </mesh>
        <Cyl p={[0, 3.7, 0]} r={0.05} h={1.2} seg={8} c={GOLD} metal={0.8} rough={0.3} />
        <Part p={[0.35, 4.05, 0]} s={[0.7, 0.4, 0.03]} c={c.theme.secondary} />
      </group>
      {/* honour guards at the door */}
      {[-1, 1].map((s) => (
        <Guard key={s} seed={`guard:${country}:${s}`} position={[s * (k.door / 2 + 0.7), y, k.d / 2 + 1.9]} />
      ))}
      <pointLight position={[0, y + 3.6, -3]} intensity={closed ? 0 : 12} distance={12} color="#FFE8B0" />
    </group>
  );
}
