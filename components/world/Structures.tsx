'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';

import type { Placed, StructureKind } from '@/lib/world/geometry';
import { LANTERN } from '@/lib/world/biomes';
import { useWorld } from './store';
// Self-hosted label font (Inter, SIL OFL) so no label ever fetches from a CDN.
const FONT = '/fonts/inter-600.woff';

// Buildings. One InstancedMesh for all building bodies, one for roofs, one for windows, plus lamps
// (reposts), sheds (replies) and lazily loaded real post images on photo buildings.
// Low-poly, flat-shaded; the only textures are real post images.

const WALL = ['#8A96A8', '#9AA6B8', '#A9B3C2', '#B8C0CC', '#D4C3A5', '#E8DCC8', '#C9CFD8'];
const ROOF = ['#C0392B', '#E67E22', '#6B7280', '#8A96A8'];
const SCREEN = '#1B2436';
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

const BUILDING_KINDS: StructureKind[] = ['pillar', 'spire', 'monolith', 'obelisk', 'outbuilding'];

function wallColor(s: Placed) {
  // a stable tone per building; landmark is the pale stone; glow brightens toward warm white
  const i = Math.abs(Math.round(s.x * 3 + s.z * 7 + s.segment * 11)) % WALL.length;
  tmpColor.set(s.isLandmark ? '#F1E8D6' : WALL[i]);
  tmpColor.lerp(new THREE.Color('#FFF4DC'), s.glow * 0.3);
  return tmpColor;
}

export function Structures({ structures, showMetrics, interactive }: { structures: Placed[]; showMetrics: boolean; interactive: boolean }) {
  const buildings = useMemo(() => structures.filter((s) => BUILDING_KINDS.includes(s.kind)), [structures]);
  const lamps = useMemo(() => structures.filter((s) => s.kind === 'lantern'), [structures]);
  const photos = useMemo(() => structures.filter((s) => s.kind === 'monolith' && s.mediaUrl), [structures]);
  const screens = useMemo(() => structures.filter((s) => s.kind === 'obelisk'), [structures]);
  void showMetrics;
  return (
    <group>
      <Bodies items={buildings} interactive={interactive} />
      <Roofs items={buildings} />
      <Windows structures={buildings} />
      <Screens items={screens} />
      <Lamps items={lamps} interactive={interactive} />
      <LitLanterns structures={buildings} />
      <Landmark structures={structures} />
      <NearbyImages structures={photos} />
    </group>
  );
}

function placeBody(s: Placed) {
  tmp.position.set(s.x, s.y + s.height / 2, s.z);
  tmp.rotation.set(0, s.rot, 0);
  tmp.scale.set(s.width, s.height, s.depth);
  tmp.updateMatrix();
}

function Bodies({ items, interactive }: { items: Placed[]; interactive: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const select = useWorld((s) => s.select);
  const selected = useWorld((s) => s.selected);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      placeBody(s);
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, wallColor(s));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  // The selected building breathes a little.
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || !selected) return;
    const i = items.findIndex((s) => s.id === selected.id);
    if (i < 0) return;
    const s = items[i];
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.012;
    tmp.position.set(s.x, s.y + s.height / 2, s.z);
    tmp.rotation.set(0, s.rot, 0);
    tmp.scale.set(s.width * pulse, s.height, s.depth * pulse);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    if (e.instanceId == null) return;
    select(items[e.instanceId] ?? null);
  };

  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow receiveShadow onClick={onClick} frustumCulled={false}>
      <meshStandardMaterial flatShading roughness={0.9} metalness={0} />
    </instancedMesh>
  );
}

/** A slab on top of every building and tower segment, in one of four roof colours. */
function Roofs({ items }: { items: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      const lip = s.kind === 'outbuilding' ? 0.2 : 0.35;
      tmp.position.set(s.x, s.y + s.height + 0.14, s.z);
      tmp.rotation.set(0, s.rot, 0);
      tmp.scale.set(s.width + lip, 0.28, s.depth + lip);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tmpColor.set(ROOF[s.roof % ROOF.length]));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial flatShading roughness={0.8} />
    </instancedMesh>
  );
}

/** reply_count -> windows on the street-facing facade, only for buildings near the player. */
function Windows({ structures }: { structures: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const playerPos = useWorld((s) => s.playerPos);
  const lastRef = useRef({ x: NaN, z: NaN });
  const geometry = useMemo(() => new THREE.BoxGeometry(0.6, 0.8, 0.08), []);
  const max = 2400;

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { x: px, z: pz } = playerPos;
    if (Math.hypot(px - lastRef.current.x, pz - lastRef.current.z) < 8) return;
    lastRef.current = { x: px, z: pz };
    let n = 0;
    for (const s of structures) {
      if (s.windows === 0 || n >= max) continue;
      if (Math.hypot(s.x - px, s.z - pz) > 90) continue;
      const cols = Math.max(1, Math.floor((s.width - 0.8) / 1.1));
      const rows = Math.max(1, Math.floor((s.height - 1.2) / 1.3));
      const count = Math.min(s.windows, cols * rows);
      const face = s.rot === 0 ? 1 : -1;
      for (let i = 0; i < count && n < max; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const lx = (c + 0.5) / cols - 0.5;
        tmp.position.set(s.x + lx * (s.width - 0.6), s.y + 0.9 + r * 1.3, s.z + face * (s.depth / 2 + 0.03));
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        mesh.setMatrixAt(n++, tmp.matrix);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, max]} frustumCulled={false}>
      <meshStandardMaterial color="#FFE9C2" emissive="#FFD089" emissiveIntensity={0.7} />
    </instancedMesh>
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
    if (e.instanceId != null) select(items[e.instanceId] ?? null);
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
          {lm.text}
        </Text>
      )}
    </group>
  );
}

/** Real post images as billboards on photo buildings, loaded only when near, at most 12 at a time. */
function NearbyImages({ structures }: { structures: Placed[] }) {
  const playerPos = useWorld((s) => s.playerPos);
  const [near, setNear] = useState<Placed[]>([]);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.5) return;
    last.current = clock.elapsedTime;
    const n = structures
      .map((s) => ({ s, d: Math.hypot(s.x - playerPos.x, s.z - playerPos.z) }))
      .filter((e) => e.d < 60)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((e) => e.s);
    if (n.length !== near.length || n.some((s, i) => s.id !== near[i]?.id)) setNear(n);
  });
  return (
    <>
      {near.map((s) => (
        <ImagePlane key={s.id} s={s} />
      ))}
    </>
  );
}

function ImagePlane({ s }: { s: Placed }) {
  const tex = useLoader(THREE.TextureLoader, s.mediaUrl as string);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 1;
  const w = s.width * 0.86;
  const h = Math.min(s.height * 0.7, w / aspect);
  const ww = Math.min(w, h * aspect);
  const face = s.rot === 0 ? 1 : -1;
  return (
    <group position={[s.x, s.y + s.height * 0.55, s.z + face * (s.depth / 2 + 0.06)]} rotation={[0, face === 1 ? 0 : Math.PI, 0]}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[ww + 0.3, h + 0.3]} />
        <meshStandardMaterial color="#F1E8D6" />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[ww, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}
