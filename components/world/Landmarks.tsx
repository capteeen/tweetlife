'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Airport } from '@/lib/world/layout';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { landmarkSpot, themeOf, welcomeLine } from '@/lib/world/cityThemes';

// What makes each country's capital recognisable from anywhere in it: a giant coin-logo monument on its
// own islet in the lagoon (west, opposite the airport), and a welcome arch over the airport road.

const FONT = '/fonts/inter-600.woff';

export function Landmark({ boundaryRadius, country, sand, grass }: { boundaryRadius: number; country: CountryId; sand: string; grass: string }) {
  const spot = landmarkSpot(boundaryRadius);
  const kind = themeOf(country).landmark.kind;
  const c = COUNTRIES[country].theme;
  const spin = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (spin.current) spin.current.rotation.y = clock.elapsedTime * 0.12;
  });
  return (
    <group position={[spot.x, 0, spot.z]}>
      {/* islet: beach, grass, plinth */}
      <mesh position={[0, -0.7, 0]} receiveShadow>
        <cylinderGeometry args={[spot.r, spot.r + 1.5, 1.4, 32]} />
        <meshStandardMaterial color={sand} roughness={1} />
      </mesh>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[spot.r - 1.6, spot.r - 1.2, 0.2, 32]} />
        <meshStandardMaterial color={grass} roughness={1} />
      </mesh>
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[5, 6, 2, 8]} />
        <meshStandardMaterial color={c.ink} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <cylinderGeometry args={[5.05, 5.05, 0.12, 8]} />
        <meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <group ref={spin} position={[0, 2.2, 0]} scale={1.9}>
        {kind === 'solana-bars' && <SolanaBars from={c.secondary} to={c.primary} />}
        {kind === 'bnb-diamond' && <BnbDiamond gold={c.primary} />}
        {kind === 'hood-feather' && <HoodFeather green={c.primary} lime={c.accent} />}
      </group>
      <pointLight position={[0, 22, 0]} color={c.primary} intensity={300} distance={70} decay={2} />
    </group>
  );
}

/** Solana's logo: three slanted bars, green at the top to purple at the bottom, standing upright. */
function SolanaBars({ from, to }: { from: string; to: string }) {
  const geos = useMemo(() => {
    const w = 15, h = 3.4, s = 3.6;
    const bar = (flip: boolean) => {
      const sh = new THREE.Shape();
      if (!flip) {
        sh.moveTo(-w / 2, 0);
        sh.lineTo(w / 2 - s, 0);
        sh.lineTo(w / 2, h);
        sh.lineTo(-w / 2 + s, h);
      } else {
        sh.moveTo(-w / 2 + s, 0);
        sh.lineTo(w / 2, 0);
        sh.lineTo(w / 2 - s, h);
        sh.lineTo(-w / 2, h);
      }
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false });
      g.translate(0, 0, -0.7);
      return g;
    };
    return [bar(false), bar(true), bar(false)];
  }, []);
  const colors = useMemo(() => [0, 0.5, 1].map((t) => '#' + new THREE.Color(to).lerp(new THREE.Color(from), t).getHexString()), [from, to]);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, 1 + i * 5, 0]} castShadow>
          <meshStandardMaterial color={colors[i]} emissive={colors[i]} emissiveIntensity={0.45} metalness={0.4} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** BNB's logo: a big gold diamond ringed by four small ones and four chevrons, standing on its point. */
function BnbDiamond({ gold }: { gold: string }) {
  const mat = <meshStandardMaterial color={gold} emissive={gold} emissiveIntensity={0.35} metalness={0.8} roughness={0.25} />;
  const cy = 10;
  const d = (x: number, y: number, size: number, key: string) => (
    <mesh key={key} position={[x, cy + y, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
      <boxGeometry args={[size, size, 1.6]} />
      {mat}
    </mesh>
  );
  // a chevron is two bars meeting at a right angle, pointing out along a diagonal
  const chevron = (ax: number, ay: number, key: string) => {
    const ang = Math.atan2(ay, ax);
    const r = 7.6;
    return (
      <group key={key} position={[Math.cos(ang) * r, cy + Math.sin(ang) * r, 0]} rotation={[0, 0, ang - Math.PI / 4]}>
        <mesh position={[-1.6, 0, 0]} castShadow>
          <boxGeometry args={[4.4, 1.6, 1.6]} />
          {mat}
        </mesh>
        <mesh position={[0, -1.6, 0]} castShadow>
          <boxGeometry args={[1.6, 4.4, 1.6]} />
          {mat}
        </mesh>
      </group>
    );
  };
  return (
    <group>
      {d(0, 0, 4.6, 'c')}
      {d(-6.6, 0, 2.6, 'l')}
      {d(6.6, 0, 2.6, 'r')}
      {d(0, -6.6, 2.6, 'b')}
      {d(0, 6.6, 2.6, 't')}
      {chevron(1, 1, 'ne')}
      {chevron(-1, 1, 'nw')}
      {chevron(1, -1, 'se')}
      {chevron(-1, -1, 'sw')}
    </group>
  );
}

/** Robinhood's feather: a tall curved green vane on a quill, tips glowing lime. */
function HoodFeather({ green, lime }: { green: string; lime: string }) {
  const geo = useMemo(() => {
    const H = 20;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(4.2, H * 0.2, 5.4, H * 0.55, 1.2, H);
    sh.bezierCurveTo(-1.6, H * 0.7, -3.4, H * 0.35, 0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 18 });
    g.translate(0, 0, -0.4);
    return g;
  }, []);
  return (
    <group rotation={[0, 0, -0.18]}>
      <mesh position={[0, 3, 0]} geometry={geo} castShadow>
        <meshStandardMaterial color={green} emissive={green} emissiveIntensity={0.4} metalness={0.3} roughness={0.35} />
      </mesh>
      {/* quill down the middle */}
      <mesh position={[0.4, 11, 0]} rotation={[0, 0, -0.05]} castShadow>
        <cylinderGeometry args={[0.18, 0.35, 22, 8]} />
        <meshStandardMaterial color="#F4F1DE" roughness={0.5} />
      </mesh>
      {/* barbs: notches of lime across the vane */}
      {[0.3, 0.45, 0.6, 0.75].map((t, i) => (
        <mesh key={i} position={[0.6 + (i % 2 ? -1 : 1) * 1.6, 3 + t * 20, 0.6]} rotation={[0, 0, (i % 2 ? 1 : -1) * 0.6]}>
          <boxGeometry args={[3.2, 0.22, 0.2]} />
          <meshStandardMaterial color={lime} emissive={lime} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** "WELCOME TO BNB CITY" over the mainland end of the airport bridge, where every arrival drives in. */
export function WelcomeArch({ ap, country }: { ap: Airport; country: CountryId }) {
  const c = COUNTRIES[country];
  const { title, sub } = welcomeLine(country);
  const x = ap.bridge.x - ap.bridge.w / 2 + 2;
  const span = ap.bridge.d + 6;
  return (
    <group position={[x, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 3.8, (s * span) / 2]} castShadow>
          <boxGeometry args={[0.9, 7.6, 0.9]} />
          <meshStandardMaterial color={c.theme.primary} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 8.2, 0]} castShadow>
        <boxGeometry args={[1.1, 2.4, span + 1.6]} />
        <meshStandardMaterial color={c.theme.ink} roughness={0.5} />
      </mesh>
      <mesh position={[0, 9.5, 0]}>
        <boxGeometry args={[1.15, 0.18, span + 1.6]} />
        <meshStandardMaterial color={c.theme.accent} emissive={c.theme.accent} emissiveIntensity={1.3} toneMapped={false} />
      </mesh>
      {/* facing arrivals from the airport (east) */}
      <Text font={FONT} position={[0.6, 8.45, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.72} letterSpacing={0.06} color={c.theme.accent} anchorX="center" anchorY="middle">
        {title}
      </Text>
      <Text font={FONT} position={[0.6, 7.55, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.42} color="#FFFFFF" anchorX="center" anchorY="middle">
        {`${sub} · President ${c.president}`}
      </Text>
      {/* facing the city, for people heading out */}
      <Text font={FONT} position={[-0.6, 8.2, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.6} letterSpacing={0.06} color={c.theme.accent} anchorX="center" anchorY="middle">
        {`AIRPORT · SAFE FLIGHT FROM ${c.capital.toUpperCase()}`}
      </Text>
    </group>
  );
}
