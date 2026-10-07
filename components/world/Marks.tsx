'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

import type { MarkModel } from '@/lib/world/load';
import { LANTERN } from '@/lib/world/biomes';
import { useWorld } from './store';
import { plain3d } from '@/lib/world/text3d';
// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
const FONT = '/fonts/inter-600.woff';

// Guestbook stones. Bright stones (owner follows the visitor back) glow harder.

const tmp = new THREE.Object3D();

export function Marks({ marks }: { marks: MarkModel[] }) {
  const dimRef = useRef<THREE.InstancedMesh>(null);
  const brightRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(0.3, 0), []);
  const dim = useMemo(() => marks.filter((m) => !m.bright), [marks]);
  const bright = useMemo(() => marks.filter((m) => m.bright), [marks]);
  const playerPos = useWorld((s) => s.playerPos);
  const [near, setNear] = useState<MarkModel | null>(null);

  useEffect(() => {
    for (const [ref, items] of [[dimRef, dim], [brightRef, bright]] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      items.forEach((m, i) => {
        tmp.position.set(m.x, 0.3, m.z);
        tmp.rotation.set(0.3, (m.x * 7 + m.z * 3) % 6.28, 0.2);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [dim, bright]);

  useFrame(() => {
    let best: MarkModel | null = null, bd = 3.2;
    for (const m of marks) {
      const d = Math.hypot(m.x - playerPos.x, m.z - playerPos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best?.id !== near?.id) setNear(best);
  });

  return (
    <group>
      {dim.length > 0 && (
        <instancedMesh ref={dimRef} args={[geometry, undefined, dim.length]} castShadow>
          <meshStandardMaterial color="#E8DCC8" emissive={LANTERN} emissiveIntensity={0.5} flatShading />
        </instancedMesh>
      )}
      {bright.length > 0 && (
        <instancedMesh ref={brightRef} args={[geometry, undefined, bright.length]} castShadow>
          <meshStandardMaterial color="#FFF1D6" emissive={LANTERN} emissiveIntensity={2.4} flatShading toneMapped={false} />
        </instancedMesh>
      )}
      {near && (
        <group position={[near.x, 1.1, near.z]} rotation={[0, Math.atan2(playerPos.x - near.x, playerPos.z - near.z), 0]}>
          <Text font={FONT} fontSize={0.22} color="#0B0E14" outlineWidth={0.02} outlineColor="#FFF4DC" anchorX="center" anchorY="bottom" maxWidth={4} textAlign="center">
            {`@${near.byHandle}\n${plain3d(near.text)}`}
          </Text>
        </group>
      )}
    </group>
  );
}
