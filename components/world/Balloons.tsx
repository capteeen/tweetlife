'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { create } from 'zustand';
import type { Balloon } from '@/lib/life/balloons';
import { useWorld } from './store';
import { refreshLife } from '@/components/life/useLife';
import { sfx } from '@/lib/audio/sfx';

// Bags on a string: every coin a player holds floats as a balloon tied to their hand, green when they are up on
// it and red when they are down. Everyone in the world sees everyone's balloons, in every world they visit.
// Rug pop: a coin that rugs bursts over its holder's head and they slump; a 2x turns the balloon gold.

const FONT = '/fonts/inter-600.woff';
const GREEN = '#22C55E';
const RED = '#EF4444';
const GOLD = '#FFC83D';
/** how long a player stays slumped after a rug pops */
const SLUMP_MS = 8000;
/** the right hand, in the figure's local space (hanging at rest) */
export const HAND: [number, number, number] = [0.27, 0.78, 0.04];
const POLL_MS = 60_000;

type BalloonState = {
  byHandle: Record<string, Balloon[]>;
  /** `${handle}:${mint}` of rugged balloons that already burst this session */
  popped: Record<string, true>;
  slumpUntil: Record<string, number>;
  set: (b: Record<string, Balloon[]>) => void;
  pop: (handle: string, mint: string) => void;
  slump: (handle: string) => void;
};
const useBalloonStore = create<BalloonState>((set) => ({
  byHandle: {},
  popped: {},
  slumpUntil: {},
  set: (b) => set((s) => ({ byHandle: { ...s.byHandle, ...b } })),
  pop: (handle, mint) => set((s) => ({ popped: { ...s.popped, [`${handle}:${mint}`]: true } })),
  slump: (handle) => set((s) => ({ slumpUntil: { ...s.slumpUntil, [handle]: Date.now() + SLUMP_MS } })),
}));

/** Tell the player what just happened to their own bags (the server already moved their stats). */
const announced = new Set<string>();
function announce(list: Balloon[]) {
  let fresh = false;
  for (const b of list) {
    if (b.state === 'normal' || announced.has(`${b.state}:${b.mint}`)) continue;
    announced.add(`${b.state}:${b.mint}`);
    fresh = true;
    useWorld.getState().pushToast(b.state === 'rug' ? `💥 $${b.symbol} rugged. Your balloon popped. −15 vibes` : `✨ $${b.symbol} did 2x. Gold balloon. +10 clout`, 'balloon');
  }
  if (fresh) refreshLife();
}

let wanted = new Set<string>();
let inflight = false;
async function fetchBalloons(handles: string[]) {
  if (!handles.length || inflight) return;
  inflight = true;
  try {
    const r = await fetch(`/api/life/balloons?h=${encodeURIComponent(handles.join(','))}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { balloons } = (await r.json()) as { balloons: Record<string, Balloon[]> };
    // a handle with no wallet (or nothing held) comes back missing: no balloons
    useBalloonStore.getState().set(Object.fromEntries(handles.map((h) => [h, balloons[h] ?? []])));
    const mine = useWorld.getState().me?.handle.toLowerCase();
    if (mine && balloons[mine]) announce(balloons[mine]);
  } catch {
    /* keep what we had */
  } finally {
    inflight = false;
  }
}

/** Ask for fresh balloons for everyone in view now (after a swap, say). */
export function refreshBalloons() {
  return fetchBalloons([...wanted]);
}

/** Keeps the balloons of the player and every visitor in view fresh. Render once per world. */
export function BalloonFeed() {
  const me = useWorld((s) => s.me);
  const peerKey = useWorld((s) =>
    Object.values(s.peers)
      .map((p) => p.handle.toLowerCase())
      .sort()
      .join(','),
  );
  useEffect(() => {
    const handles = [...new Set([me?.handle.toLowerCase(), ...peerKey.split(',')].filter((h): h is string => !!h))].slice(0, 20);
    const known = useBalloonStore.getState().byHandle;
    wanted = new Set(handles);
    // someone new walked in: fetch straight away
    if (handles.some((h) => !(h in known))) fetchBalloons(handles);
  }, [me?.handle, peerKey]);
  useEffect(() => {
    const t = setInterval(() => fetchBalloons([...wanted]), POLL_MS);
    return () => clearInterval(t);
  }, []);
  return null;
}

// Logos come from DexScreener's CDN. Loaded once per URL; if one can't load, the balloon shows the ticker instead.
const LOGOS = new Map<string, THREE.Texture | null | Promise<THREE.Texture | null>>();
function useLogo(url: string | null) {
  const [tex, setTex] = useState<THREE.Texture | null>(() => {
    const c = url ? LOGOS.get(url) : null;
    return c instanceof THREE.Texture ? c : null;
  });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let c = LOGOS.get(url);
    if (c === undefined) {
      c = new Promise<THREE.Texture | null>((resolve) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          url,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            resolve(t);
          },
          undefined,
          () => resolve(null),
        );
      }).then((t) => (LOGOS.set(url, t), t));
      LOGOS.set(url, c);
    }
    Promise.resolve(c).then((t) => alive && setTex(t));
    return () => {
      alive = false;
    };
  }, [url]);
  return tex;
}

const balloonGeo = new THREE.SphereGeometry(1, 20, 16);
const knotGeo = new THREE.ConeGeometry(0.05, 0.08, 8);
const discGeo = new THREE.CircleGeometry(1, 28);

type Props = {
  handle: string;
  /** an object placed at the figure's hand; balloons hang from its world position */
  hand: React.RefObject<THREE.Object3D>;
  /** how big the figure is drawn (riders are scaled) */
  scale?: number;
  visible?: boolean;
};

/** The balloons for one person. Simulated in world space so they trail behind when the person walks. */
export function Balloons({ handle, hand, scale = 1, visible = true }: Props) {
  const h = handle.toLowerCase();
  const all = useBalloonStore((s) => s.byHandle[h]);
  const popped = useBalloonStore((s) => s.popped);
  const list = useMemo(() => (all ?? []).filter((b) => !popped[`${h}:${b.mint}`]), [all, popped, h]);
  const scene = useThree((s) => s.scene);
  // your own new balloon (you just bought a coin): the sound of it being blown up
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!all) return;
    const mints = new Set(all.map((b) => b.mint));
    if (known.current && h === useWorld.getState().me?.handle.toLowerCase() && [...mints].some((m) => !known.current!.has(m))) sfx('inflate');
    known.current = mints;
  }, [all, h]);
  if (!list.length || !visible) return null;
  return createPortal(
    <group>
      {list.map((b, i) => (
        <OneBalloon key={b.mint} b={b} i={i} n={list.length} hand={hand} scale={scale} onBurst={() => useBalloonStore.getState().slump(h)} onGone={() => useBalloonStore.getState().pop(h, b.mint)} />
      ))}
    </group>,
    scene,
  );
}

/** 0..1, how slumped this player is right now: 1 just after a rug pops, easing back up when it wears off. */
export function useSlumpRef(handle: string) {
  const ref = useRef(0);
  const h = handle.toLowerCase();
  useFrame((_, dt) => {
    const until = useBalloonStore.getState().slumpUntil[h] ?? 0;
    const target = Date.now() < until ? 1 : 0;
    ref.current += (target - ref.current) * Math.min(1, dt * (target ? 6 : 1.5));
  });
  return ref;
}

const tmp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

const POP_SWELL = 0.9; // seconds the rugged balloon swells and shakes before it bursts

function OneBalloon({ b, i, n, hand, scale, onBurst, onGone }: { b: Balloon; i: number; n: number; hand: React.RefObject<THREE.Object3D>; scale: number; onBurst: () => void; onGone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const rug = b.state === 'rug';
  const popT = useRef(0);
  const [burst, setBurst] = useState<THREE.Vector3 | null>(null);
  const vel = useRef(new THREE.Vector3());
  const placed = useRef(false);
  const logo = useLogo(b.icon);
  const color = b.state === 'gold' ? GOLD : b.state === 'rug' ? RED : b.up ? GREEN : RED;
  // fan the bunch out around the hand; strings get a little longer for each extra balloon
  const spread = useMemo(() => {
    const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2.2;
    return { x: Math.sin(a) * 0.45, z: Math.cos(a) * 0.35 - 0.2, y: 2.0 + (i % 2) * 0.3, phase: i * 1.7 };
  }, [i, n]);
  const string = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#F4F1DE', transparent: true, opacity: 0.85 }));
  }, []);
  useEffect(() => () => string.geometry.dispose(), [string]);

  useFrame((state, dt) => {
    const g = ref.current, h = hand.current;
    if (!g || !h || burst) return;
    const d = Math.min(dt, 0.05);
    // a rug: the balloon swells and shakes, then bursts
    if (rug && body.current) {
      popT.current += d;
      const k = popT.current / POP_SWELL;
      body.current.scale.setScalar(1 + k * 0.45);
      body.current.position.x = Math.sin(popT.current * 60) * 0.03 * k;
      if (k >= 1) {
        setBurst(g.position.clone());
        sfx('rugPop', { at: g.position });
        string.visible = false;
        onBurst();
      }
    }
    const s = scale;
    const handPos = h.getWorldPosition(tmp);
    const t = state.clock.elapsedTime + spread.phase;
    // the bunch floats out to the hand's side of the body, so it never sits over the head and name label
    const side = new THREE.Vector3(spread.x + 0.5, 0, spread.z).applyQuaternion(h.getWorldQuaternion(tmpQ)).setY(0).multiplyScalar(s);
    const target = new THREE.Vector3(handPos.x + side.x + Math.sin(t * 0.9) * 0.08, handPos.y + spread.y * s + Math.sin(t * 1.3) * 0.05, handPos.z + side.z + Math.cos(t * 0.7) * 0.08);
    if (!placed.current) {
      g.position.copy(target);
      placed.current = true;
    }
    // a damped spring toward the target: the bunch lags and bobs when the player walks or turns
    const acc = target.sub(g.position).multiplyScalar(28);
    vel.current.addScaledVector(acc, d).multiplyScalar(Math.exp(-4.5 * d));
    g.position.addScaledVector(vel.current, d);
    // a tether: never further from the hand than the string allows
    const off = g.position.clone().sub(handPos);
    const max = (spread.y + 0.9) * s;
    if (off.length() > max) g.position.copy(handPos).add(off.setLength(max));
    g.rotation.z = THREE.MathUtils.clamp(-vel.current.x * 0.15, -0.4, 0.4);
    g.rotation.x = THREE.MathUtils.clamp(vel.current.z * 0.15, -0.4, 0.4);
    // the string: from the hand to the knot, sagging a little toward the middle
    const knot = g.localToWorld(new THREE.Vector3(0, -0.4, 0));
    const pos = string.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < 9; k++) {
      const f = k / 8;
      const sag = Math.sin(f * Math.PI) * 0.06 * s;
      pos.setXYZ(k, handPos.x + (knot.x - handPos.x) * f + sag, handPos.y + (knot.y - handPos.y) * f, handPos.z + (knot.z - handPos.z) * f);
    }
    pos.needsUpdate = true;
    string.geometry.computeBoundingSphere();
  });

  if (burst) return <Confetti at={burst} scale={scale} onDone={onGone} />;
  const gold = b.state === 'gold';
  return (
    <>
      <primitive object={string} />
      <group ref={ref} scale={scale}>
        <group ref={body}>
        <mesh geometry={balloonGeo} scale={[0.3, 0.36, 0.3]} castShadow>
          <meshStandardMaterial color={color} roughness={gold ? 0.18 : 0.25} metalness={gold ? 0.3 : 0.05} emissive={color} emissiveIntensity={gold ? 0.5 : 0.18} />
        </mesh>
        <mesh geometry={knotGeo} position={[0, -0.38, 0]} rotation={[Math.PI, 0, 0]}>
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
        <Billboard position={[0, 0, 0]} follow>
          {logo ? (
            <mesh geometry={discGeo} position={[0, 0, 0.31]} scale={0.17}>
              <meshBasicMaterial map={logo} toneMapped={false} />
            </mesh>
          ) : (
            <Text font={FONT} position={[0, 0, 0.31]} fontSize={0.1} color="#FFFFFF" outlineWidth={0.012} outlineColor="#0B0E14" anchorX="center" anchorY="middle" maxWidth={0.5}>
              {'$' + b.symbol.slice(0, 7)}
            </Text>
          )}
        </Billboard>
        </group>
      </group>
    </>
  );
}

const shardGeo = new THREE.PlaneGeometry(0.07, 0.05);

/** The burst: red shreds that fly out and flutter down; when they have fallen the balloon is gone for good. */
function Confetti({ at, scale, onDone }: { at: THREE.Vector3; scale: number; onDone: () => void }) {
  const done = useRef(false);
  const group = useRef<THREE.Group>(null);
  const bits = useMemo(
    () =>
      Array.from({ length: 22 }, (_, k) => {
        const a = (k / 22) * Math.PI * 2;
        return { v: new THREE.Vector3(Math.cos(a) * (1.2 + (k % 3) * 0.6), 1.5 + (k % 4) * 0.5, Math.sin(a) * (1.2 + (k % 5) * 0.4)).multiplyScalar(scale), spin: 4 + (k % 6) };
      }),
    [scale],
  );
  const life = useRef(0);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const d = Math.min(dt, 0.05);
    life.current += d;
    g.children.forEach((m, k) => {
      const bit = bits[k];
      bit.v.y -= 6 * d; // gravity
      bit.v.multiplyScalar(Math.exp(-1.8 * d)); // flutter: air drag
      m.position.addScaledVector(bit.v, d);
      m.rotation.x += bit.spin * d;
      m.rotation.y += bit.spin * 0.7 * d;
    });
    if (life.current > 2.2 && !done.current) {
      done.current = true;
      g.visible = false;
      onDone();
    }
  });
  return (
    <group ref={group} position={at}>
      {bits.map((_, k) => (
        <mesh key={k} geometry={shardGeo}>
          <meshStandardMaterial color={k % 3 === 0 ? '#F4F1DE' : RED} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
