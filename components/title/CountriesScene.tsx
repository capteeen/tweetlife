'use client';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { LogoMonument } from '@/components/world/Landmarks';
import { COUNTRY_LIST, type Country } from '@/lib/world/countries';
import { angleDiff } from './welcomeLayout';
import { BubbleBuilding, FlyingPlane, IslandBase, TreeField, Windows, type Block, type FlightPose } from './welcomeBits';

// The three countries on the welcome page: Solana, BNB and Robinhood as little floating speech-bubble
// islands in their coin's colours, each with its real logo standing in the middle of its capital, and a
// Tweetlife airliner flying a loop between them. Same style and pieces as the hero city (welcomeBits.tsx).

const ISLE_R = 6.4;
/** where each island floats; the camera turns slowly round the middle */
const SPOTS: [number, number][] = [
  [-10.5, -4.5],
  [10.5, -4.5],
  [0, 8.5],
];
/** each country's lawn, a light wash of its colours */
const LAWN: Record<string, string> = { solana: '#9FF0CF', bnb: '#FFE7A1', robinhood: '#BDF59F' };

export function CountriesScene({ paused, onReady, reducedMotion }: { paused: boolean; onReady: () => void; reducedMotion: boolean }) {
  return (
    <Canvas
      flat
      shadows
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 1, far: 400, position: [0, 30, 50] }}
      onCreated={() => requestAnimationFrame(() => requestAnimationFrame(onReady))}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <hemisphereLight args={['#EAF6FF', '#9CCB8E', 1.9]} />
      <directionalLight
        position={[14, 28, 16]}
        intensity={1.8}
        color="#FFF6E4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-bias={-0.0008}
      />
      <Orbit reducedMotion={reducedMotion} />
      {COUNTRY_LIST.map((c, i) => (
        <Isle key={c.id} country={c} at={SPOTS[i]} bob={i * 2.1} />
      ))}
      <FlyingPlane fly={tour} tint="#1D9BF0" scale={0.36} />
    </Canvas>
  );
}

function Orbit({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const t = useRef(0);
  useLayoutEffect(() => {
    cam.fov = size.width / size.height < 1.5 ? 40 : 30;
    cam.updateProjectionMatrix();
  }, [cam, size.width, size.height]);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.1);
    const aspect = size.width / size.height;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // all three islands across the frame, whichever way round the camera is
    const fit = Math.max(21 / (tanHalf * aspect), 12 / tanHalf) + 6;
    const a = (reducedMotion ? 0 : t.current * 0.05) + 0.15;
    const elev = 0.62;
    cam.position.set(Math.sin(a) * fit * Math.cos(elev), fit * Math.sin(elev), Math.cos(a) * fit * Math.cos(elev));
    cam.lookAt(0, 0.5, 1.2);
  });
  return null;
}

/** One country: a bubble island in its colours with its coin's logo on a plinth, ringed by its capital. */
function Isle({ country, at, bob }: { country: Country; at: [number, number]; bob: number }) {
  const t = country.theme;
  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4 + bob;
      const r = 4.2;
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, w: 1.5 + (i % 2) * 0.3, d: 1.4, h: 2.6 + ((i * 7) % 5) * 0.55, antenna: i === 2 });
    }
    return out;
  }, [bob]);
  const trees = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4 + bob + Math.PI / 6;
        return { x: Math.sin(a) * 4.6, z: Math.cos(a) * 4.6, s: 0.55, tint: (i * 0.37) % 1 };
      }),
    [bob],
  );
  const g = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const clock = useRef(bob);
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    if (g.current) g.current.position.y = Math.sin(clock.current * 0.6) * 0.35;
    if (spin.current) spin.current.rotation.y += Math.min(dt, 0.1) * 0.35;
  });
  return (
    <group position={[at[0], 0, at[1]]}>
      <group ref={g}>
        <IslandBase r={ISLE_R} top={LAWN[country.id] ?? '#7DD36F'} depth={1.8} />
        {/* a band of the coin's colour round the island */}
        <mesh position-y={-1.1}>
          <cylinderGeometry args={[ISLE_R + 0.72, ISLE_R + 0.72, 0.5, 64, 1, true]} />
          <meshStandardMaterial color={t.primary} emissive={t.primary} emissiveIntensity={0.25} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        {/* the plaza and the plinth */}
        <mesh position-y={0.05} receiveShadow>
          <cylinderGeometry args={[2.4, 2.4, 0.1, 40]} />
          <meshStandardMaterial color="#F4F6F9" roughness={0.9} />
        </mesh>
        <mesh position-y={0.4} castShadow>
          <cylinderGeometry args={[1.05, 1.2, 0.6, 32]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
        <mesh position-y={0.72}>
          <cylinderGeometry args={[1.08, 1.08, 0.06, 32]} />
          <meshStandardMaterial color={t.primary} emissive={t.primary} emissiveIntensity={0.4} />
        </mesh>
        <group ref={spin} position-y={0.75} scale={0.19}>
          <Suspense fallback={null}>
            <LogoMonument url={country.logo} gradient={country.id === 'solana' ? t.gradient : null} />
          </Suspense>
        </group>
        {blocks.map((b, i) => (
          <BubbleBuilding key={i} b={b} awning={i % 2 ? t.primary : t.accent} roof={false} />
        ))}
        <Windows blocks={blocks} lit={country.id === 'solana' ? '#14F195' : country.id === 'bnb' ? '#FCD535' : '#CCFF00'} seed={3 + Math.round(bob)} />
        <TreeField spots={trees} />
      </group>
    </group>
  );
}

// The plane's loop: over each capital in turn, swinging wide between them. A closed spline through
// waypoints; the bank follows how hard it is turning.
const ROUTE = (() => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < SPOTS.length; i++) {
    const [x, z] = SPOTS[i];
    const [nx, nz] = SPOTS[(i + 1) % SPOTS.length];
    pts.push(new THREE.Vector3(x, 7.2, z));
    // between two islands, swing out away from the middle
    const mx = (x + nx) / 2, mz = (z + nz) / 2;
    const out = Math.hypot(mx, mz) || 1;
    pts.push(new THREE.Vector3(mx + (mx / out) * 9, 8.6, mz + (mz / out) * 9));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return { curve, length: curve.getLength() };
})();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function headingAt(u: number) {
  ROUTE.curve.getTangentAt(((u % 1) + 1) % 1, tmpA);
  return Math.atan2(tmpA.x, tmpA.z);
}

function tour(t: number): FlightPose {
  const speed = 7;
  const u = ((t * speed) / ROUTE.length) % 1;
  ROUTE.curve.getPointAt(u, tmpB);
  ROUTE.curve.getTangentAt(u, tmpA);
  const heading = Math.atan2(tmpA.x, tmpA.z);
  const du = 0.004;
  const turn = angleDiff(headingAt(u + du), headingAt(u - du)) / ((2 * du * ROUTE.length) / speed); // rad/s, + = turning left
  return { x: tmpB.x, y: tmpB.y, z: tmpB.z, heading, pitch: -Math.asin(Math.max(-1, Math.min(1, tmpA.y))), bank: Math.max(-0.6, Math.min(0.6, -turn * 0.9)) };
}
