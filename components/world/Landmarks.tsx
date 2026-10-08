'use client';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Text } from '@react-three/drei';
import type { Airport } from '@/lib/world/layout';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { landmarkSpot, welcomeLine } from '@/lib/world/cityThemes';

// What makes each country's capital recognisable from anywhere in it: its coin's real logo
// (public/countries/*.svg), extruded into a giant monument on an islet in the lagoon (west, opposite the
// airport), and a welcome arch carrying the logo at the airport bridge.

const FONT = '/fonts/inter-600.woff';

export function Landmark({ boundaryRadius, country, sand, grass }: { boundaryRadius: number; country: CountryId; sand: string; grass: string }) {
  const spot = landmarkSpot(boundaryRadius);
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
      <group ref={spin} position={[0, 2.2, 0]}>
        <Suspense fallback={null}>
          <LogoMonument url={COUNTRIES[country].logo} gradient={country === 'solana' ? c.gradient : null} />
        </Suspense>
      </group>
      <pointLight position={[0, 22, 0]} color={c.primary} intensity={300} distance={70} decay={2} />
    </group>
  );
}

/** The coin's logo file, extruded and standing upright, about 26 units tall. Solana's gradient fill is
 * applied per bar (purple at the bottom left to green at the top right, as in the logo). */
function LogoMonument({ url, gradient }: { url: string; gradient: [string, string] | null }) {
  const svg = useLoader(SVGLoader, url);
  const parts = useMemo(() => {
    const out: { geo: THREE.ExtrudeGeometry; color: string }[] = [];
    for (const p of svg.paths) {
      const fill = (p.userData?.style?.fill as string | undefined) ?? '';
      for (const shape of SVGLoader.createShapes(p)) {
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1, curveSegments: 16 });
        let color = fill.startsWith('#') ? fill : '#FFFFFF';
        if (gradient) {
          geo.computeBoundingBox();
          const b = geo.boundingBox!;
          const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
          const t = Math.max(0, Math.min(1, (cx / 24 + (1 - cy / 24)) / 2));
          color = '#' + new THREE.Color(gradient[0]).lerp(new THREE.Color(gradient[1]), t).getHexString();
        }
        out.push({ geo, color });
      }
    }
    // centre on x and depth, base on the plinth; SVG y runs down, so the group flips it
    const box = new THREE.Box3();
    out.forEach(({ geo }) => {
      geo.computeBoundingBox();
      box.union(geo.boundingBox!);
    });
    out.forEach(({ geo }) => geo.translate(-(box.min.x + box.max.x) / 2, -box.max.y, -1));
    return { out, h: box.max.y - box.min.y };
  }, [svg, gradient]);
  useEffect(() => () => parts.out.forEach(({ geo }) => geo.dispose()), [parts]);
  const k = 26 / Math.max(1, parts.h);
  return (
    <group scale={[k, -k, k]}>
      {parts.out.map(({ geo, color }, i) => (
        <mesh key={i} geometry={geo} castShadow>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.15} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** A coin logo rasterised onto a canvas texture (SVGs have no useful pixel size of their own). */
export function logoImage(url: string, size: number, onReady: (canvas: HTMLCanvasElement) => void) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    onReady(c);
  };
  img.src = url;
}

function useLogoTexture(url: string) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(document.createElement('canvas'));
    t.colorSpace = THREE.SRGBColorSpace;
    logoImage(url, 256, (c) => {
      t.image = c;
      t.needsUpdate = true;
    });
    return t;
  }, [url]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** "WELCOME TO BNB CITY" over the mainland end of the airport bridge, where every arrival drives in. */
export function WelcomeArch({ ap, country }: { ap: Airport; country: CountryId }) {
  const c = COUNTRIES[country];
  const { title, sub } = welcomeLine(country);
  const x = ap.bridge.x - ap.bridge.w / 2 + 2;
  const span = ap.bridge.d + 6;
  const logo = useLogoTexture(c.logo);
  return (
    <group position={[x, 0, 0]}>
      {/* the real coin logo on a dark disc above the beam, readable from both sides */}
      <mesh position={[0, 11, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.5, 1.5, 0.3, 32]} />
        <meshStandardMaterial color={c.theme.ink} roughness={0.5} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.17, 11, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <planeGeometry args={[2.1, 2.1]} />
          <meshBasicMaterial map={logo} transparent toneMapped={false} />
        </mesh>
      ))}
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
