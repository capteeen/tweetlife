'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { CAPITAL_SLOT, plotEntrance, plotRect } from '@/lib/world/country-map';
import { BLOCK_W, SIDEWALK } from '@/lib/world/geometry';
import { COUNTRIES } from '@/lib/world/countries';
import { DistanceDetail } from './DistanceDetail';
import { useWorld } from './store';

// Street signs on a country map: a tall post at the front corner of every player's block with their handle
// (yours in gold), and one for Capital Square. Read from the street; hidden from far away.
const FONT = '/fonts/inter-600.woff';
const tmpA = new THREE.Vector3();

export function PlotSigns() {
  const cm = useWorld((s) => s.countryMap);
  const mine = useWorld((s) => s.mine);
  if (!cm) return null;
  const c = COUNTRIES[cm.country];
  return (
    <group>
      <Sign slot={CAPITAL_SLOT} title="Capital Square" sub={c.capital} color={c.theme.primary} />
      {cm.plots.map((p) => (
        <Sign key={p.slot} slot={p.slot} title={`@${p.handle}`} sub={mine?.country === cm.country && mine.slot === p.slot ? 'your block' : `${p.shown} posts`} color={mine?.country === cm.country && mine.slot === p.slot ? '#F5C451' : '#E9EDF2'} />
      ))}
    </group>
  );
}

function Sign({ slot, title, sub, color }: { slot: number; title: string; sub: string; color: string }) {
  const e = plotEntrance(slot);
  const r = plotRect(slot);
  void r;
  // on the front sidewalk, at the left corner of the centre block, clear of the door
  const x = e.front.x - BLOCK_W / 2 + 1.2, z = e.front.z - SIDEWALK / 2 + 0.6;
  return (
    <DistanceDetail shadowWithin={40} hideBeyond={150}>
      <group position={[x, 0, z]}>
        <mesh position={[0, 2.2, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 4.4, 6]} />
          <meshStandardMaterial color="#2B313B" roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[0, 4.6, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
        </mesh>
        <Facing y={5.3}>
          <Text font={FONT} fontSize={0.9} color={color} outlineWidth={0.05} outlineColor="#0B0E14" anchorX="center" anchorY="bottom">
            {title}
          </Text>
          <Text font={FONT} fontSize={0.45} position={[0, -0.15, 0]} color="#FFFFFF" outlineWidth={0.03} outlineColor="#0B0E14" anchorX="center" anchorY="top">
            {sub}
          </Text>
        </Facing>
      </group>
    </DistanceDetail>
  );
}

/** Turns to the camera around the vertical axis only (never Billboard lockX/lockZ, which flips from behind). */
function Facing({ y, children }: { y: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const o = g.current;
    if (!o) return;
    o.getWorldPosition(tmpA);
    o.rotation.y = Math.atan2(camera.position.x - tmpA.x, camera.position.z - tmpA.z);
  });
  return (
    <group ref={g} position={[0, y, 0]}>
      {children}
    </group>
  );
}
