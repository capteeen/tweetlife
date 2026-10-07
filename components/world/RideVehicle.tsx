'use client';
import type { ReactNode } from 'react';

// The public rides you can take around the city, low-poly and facing +z like the figure.
// Danfo: the yellow bus with black stripes. Keke: the tricycle. Okada: the motorbike. Cab: yellow with a roof sign.

const m = (color: string, extra?: Record<string, unknown>) => <meshStandardMaterial color={color} flatShading roughness={0.55} metalness={0.15} {...extra} />;

function Wheel({ x, y = 0.32, z, r = 0.32, w = 0.28 }: { x: number; y?: number; z: number; r?: number; w?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, w, 10]} />
      {m('#141414')}
    </mesh>
  );
}

function Box({ p, s, c, extra }: { p: [number, number, number]; s: [number, number, number]; c: string; extra?: Record<string, unknown> }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      {m(c, extra)}
    </mesh>
  );
}

export function RideVehicle({ mode }: { mode: string }) {
  let body: ReactNode = null;
  if (mode === 'danfo') {
    body = (
      <>
        <Box p={[0, 1.05, 0]} s={[2, 1.5, 4.6]} c="#FFC300" />
        <Box p={[0, 0.75, 0]} s={[2.02, 0.16, 4.62]} c="#111" />
        <Box p={[0, 1.15, 0]} s={[2.02, 0.12, 4.62]} c="#111" />
        <Box p={[0, 1.45, 0.2]} s={[2.04, 0.55, 3.6]} c="#1B2436" extra={{ roughness: 0.25 }} />
        <Box p={[0, 1.4, 2.32]} s={[1.7, 0.6, 0.05]} c="#1B2436" extra={{ roughness: 0.25 }} />
        <Box p={[0, 1.9, -0.4]} s={[1.6, 0.18, 2.6]} c="#3A3A3A" />
        {[-1, 1].flatMap((sx) => [-1.5, 1.5].map((sz) => <Wheel key={`${sx}${sz}`} x={sx * 0.95} z={sz} />))}
      </>
    );
  } else if (mode === 'keke') {
    body = (
      <>
        <Box p={[0, 0.65, -0.2]} s={[1.3, 0.55, 2.2]} c="#2E9E4F" />
        <Box p={[0, 1.55, -0.2]} s={[1.36, 0.12, 2.3]} c="#FFD166" />
        {[-1, 1].flatMap((sx) => [-1.2, 0.8].map((sz) => <Box key={`${sx}${sz}`} p={[sx * 0.62, 1.15, sz]} s={[0.08, 0.8, 0.08]} c="#333" />))}
        <Box p={[0, 1.15, 0.85]} s={[1.1, 0.7, 0.05]} c="#BFE3FF" extra={{ transparent: true, opacity: 0.5 }} />
        <Wheel x={0} z={1.05} r={0.28} w={0.18} />
        {[-1, 1].map((sx) => <Wheel key={sx} x={sx * 0.68} z={-1} r={0.28} w={0.18} />)}
      </>
    );
  } else if (mode === 'okada') {
    body = (
      <>
        <Box p={[0, 0.65, 0]} s={[0.35, 0.35, 1.6]} c="#E63946" />
        <Box p={[0, 0.9, -0.25]} s={[0.4, 0.14, 0.9]} c="#1B1B1B" />
        <Box p={[0, 1.05, 0.7]} s={[0.9, 0.06, 0.06]} c="#333" />
        <Wheel x={0} z={0.75} r={0.36} w={0.14} />
        <Wheel x={0} z={-0.75} r={0.36} w={0.14} />
      </>
    );
  } else {
    body = (
      <>
        <Box p={[0, 0.55, 0]} s={[1.8, 0.65, 3.6]} c="#F4D35E" />
        <Box p={[0, 1.1, -0.15]} s={[1.5, 0.55, 1.9]} c="#1B2436" extra={{ roughness: 0.25 }} />
        <Box p={[0, 0.56, 0]} s={[1.82, 0.12, 3.62]} c="#2D2D2D" />
        <Box p={[0, 1.5, -0.15]} s={[0.7, 0.25, 0.3]} c="#FFFFFF" extra={{ emissive: '#FFD089', emissiveIntensity: 0.6 }} />
        {[-1, 1].flatMap((sx) => [-1.15, 1.15].map((sz) => <Wheel key={`${sx}${sz}`} x={sx * 0.9} z={sz} />))}
      </>
    );
  }
  return <group>{body}</group>;
}
