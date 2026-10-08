'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';

import type { Placed, StructureKind } from '@/lib/world/geometry';
import { LANTERN } from '@/lib/world/biomes';
import { useWorld } from './store';
import { isFiller } from '@/lib/world/filler';
import { plain3d } from '@/lib/world/text3d';
import { Buildings } from './Buildings';
// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
const FONT = '/fonts/inter-600.woff';

// Buildings (see Buildings.tsx: procedural houses, shops, warehouses, mid-rises, offices and towers,
// instanced), plus lamps (reposts). Post photos are never drawn in the world.
// Low-poly, flat-shaded; no textures.

const SCREEN = '#1B2436';
const tmp = new THREE.Object3D();

const BUILDING_KINDS: StructureKind[] = ['pillar', 'spire', 'monolith', 'obelisk', 'outbuilding'];

export function Structures({ structures, showMetrics, interactive, night = false }: { structures: Placed[]; showMetrics: boolean; interactive: boolean; night?: boolean }) {
  const buildings = useMemo(() => structures.filter((s) => BUILDING_KINDS.includes(s.kind)), [structures]);
  const lamps = useMemo(() => structures.filter((s) => s.kind === 'lantern'), [structures]);
  const screens = useMemo(() => structures.filter((s) => s.kind === 'obelisk'), [structures]);
  void showMetrics;
  return (
    <group>
      <Buildings items={buildings} interactive={interactive} night={night} />
      <Screens items={screens} />
      <Lamps items={lamps} interactive={interactive} />
      <LitLanterns structures={buildings} />
      <Landmark structures={structures} />
    </group>
  );
}

/** Video posts: a dark screen panel across the facade. */
function Screens({ items }: { items: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 0.12), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      const face = s.rot === 0 ? 1 : -1;
      tmp.position.set(s.x, s.y + s.height * 0.55, s.z + face * (s.depth / 2 + 0.07));
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(s.width * 0.8, s.height * 0.5, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
      <meshStandardMaterial color={SCREEN} emissive="#2E4A7A" emissiveIntensity={0.6} roughness={0.3} />
    </instancedMesh>
  );
}

/** Reposts: street lamps — a post and a warm emissive head that blooms. */
function Lamps({ items, interactive }: { items: Placed[]; interactive: boolean }) {
  const post = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(0.08, 0.1, 1, 6), []);
  const headGeo = useMemo(() => new THREE.BoxGeometry(0.5, 0.3, 0.5), []);
  const select = useWorld((s) => s.select);
  useEffect(() => {
    const p = post.current, h = head.current;
    if (!p || !h) return;
    items.forEach((s, i) => {
      tmp.position.set(s.x, s.height / 2, s.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, s.height, 1);
      tmp.updateMatrix();
      p.setMatrixAt(i, tmp.matrix);
      tmp.position.set(s.x, s.height + 0.15, s.z);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      h.setMatrixAt(i, tmp.matrix);
    });
    p.count = h.count = items.length;
    p.instanceMatrix.needsUpdate = h.instanceMatrix.needsUpdate = true;
  }, [items]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    // plain filler buildings have no post behind them
    if (e.instanceId != null && items[e.instanceId] && !isFiller(items[e.instanceId].postId)) select(items[e.instanceId]);
  };
  if (items.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={post} args={[postGeo, undefined, items.length]} castShadow frustumCulled={false} onClick={onClick}>
        <meshStandardMaterial color="#3E434C" roughness={0.7} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={head} args={[headGeo, undefined, items.length]} frustumCulled={false} onClick={onClick}>
        <meshStandardMaterial color={LANTERN} emissive={LANTERN} emissiveIntensity={2.2} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Visitor-lit lanterns: a flame by the door of buildings that have lanternsLit > 0. */
function LitLanterns({ structures }: { structures: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => structures.filter((s) => s.lanternsLit > 0 && s.segment === 0), [structures]);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.22, 0), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      const sc = 1 + Math.log2(1 + Math.min(6, s.lanternsLit)) * 0.5;
      const face = s.rot === 0 ? 1 : -1;
      tmp.position.set(s.x + s.width / 2 + 0.4, 0.5, s.z + face * (s.depth / 2 + 0.5));
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(sc, sc, sc);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(clock.elapsedTime * 5) * 0.3;
  });
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
      <meshStandardMaterial color={LANTERN} emissive={LANTERN} emissiveIntensity={2} toneMapped={false} />
    </instancedMesh>
  );
}

/** The landmark: a light column so it is always on the horizon, and its text readable up close. */
function Landmark({ structures }: { structures: Placed[] }) {
  const lm = useMemo(() => structures.find((s) => s.isLandmark), [structures]);
  const top = useMemo(() => (lm ? structures.filter((s) => s.x === lm.x && s.z === lm.z).reduce((m, s) => Math.max(m, s.y + s.height), 0) : 0), [structures, lm]);
  const playerPos = useWorld((s) => s.playerPos);
  const [near, setNear] = useState(false);
  useFrame(() => {
    if (!lm) return;
    const n = Math.hypot(lm.x - playerPos.x, lm.z - playerPos.z) < 22;
    if (n !== near) setNear(n);
  });
  if (!lm) return null;
  const face = lm.rot === 0 ? 1 : -1;
  return (
    <group position={[lm.x, 0, lm.z]}>
      <mesh position={[0, top + 80, 0]}>
        <cylinderGeometry args={[0.2, 1.2, 160, 6, 1, true]} />
        <meshBasicMaterial color={LANTERN} transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight position={[0, top + 1, 0]} color={LANTERN} intensity={top * 3} distance={60} decay={2} />
      {near && (
        <Text
          font={FONT}
          position={[0, 2.2, face * (lm.depth / 2 + 0.3)]}
          rotation={[0, face === 1 ? 0 : Math.PI, 0]}
          fontSize={0.42}
          maxWidth={Math.max(4, lm.width - 0.6)}
          lineHeight={1.25}
          color="#0B0E14"
          outlineWidth={0.03}
          outlineColor="#FFF4DC"
          anchorX="center"
          anchorY="bottom"
          textAlign="center"
        >
          {plain3d(lm.text) || '(no text)'}
        </Text>
      )}
    </group>
  );
}
