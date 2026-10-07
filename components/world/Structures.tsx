'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Placed, StructureKind } from '@/lib/world/geometry';
import { LANTERN, STONE } from '@/lib/world/biomes';
import { useWorld } from './store';

// One InstancedMesh per structure kind, plus an instanced window mesh and lazy image planes on monoliths.
// Geometry is low-poly and flat-shaded; the only textures are real post images.

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

function geometryFor(kind: StructureKind): THREE.BufferGeometry {
  switch (kind) {
    case 'pillar':
      return new THREE.CylinderGeometry(0.5, 0.58, 1, 6, 1); // hex prism
    case 'spire':
      return new THREE.CylinderGeometry(0.42, 0.5, 1, 6, 1);
    case 'monolith':
      return new THREE.BoxGeometry(1, 1, 0.32);
    case 'obelisk':
      return new THREE.CylinderGeometry(0.18, 0.5, 1, 4, 1);
    case 'outbuilding':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'lantern':
      return new THREE.OctahedronGeometry(0.5, 0);
  }
}

const KINDS: StructureKind[] = ['pillar', 'spire', 'monolith', 'obelisk', 'outbuilding', 'lantern'];

function tone(kind: StructureKind, s: Placed) {
  // three stone tones by kind + lanterns emissive
  if (kind === 'lantern') return LANTERN;
  if (kind === 'outbuilding') return STONE[2];
  if (kind === 'monolith' || kind === 'obelisk') return STONE[1];
  return s.isLandmark ? STONE[0] : s.segment % 2 ? STONE[1] : STONE[0];
}

export function Structures({ structures, showMetrics, interactive }: { structures: Placed[]; showMetrics: boolean; interactive: boolean }) {
  const byKind = useMemo(() => {
    const m: Record<StructureKind, Placed[]> = { pillar: [], spire: [], monolith: [], obelisk: [], outbuilding: [], lantern: [] };
    for (const s of structures) m[s.kind].push(s);
    return m;
  }, [structures]);
  return (
    <group>
      {KINDS.map((k) => (
        <KindInstances key={k} kind={k} items={byKind[k]} interactive={interactive} />
      ))}
      <Windows structures={structures} />
      <LitLanterns structures={structures} />
      <Landmark structures={structures} />
      <NearbyImages structures={byKind.monolith} />
      {showMetrics ? null : null}
    </group>
  );
}

function KindInstances({ kind, items, interactive }: { kind: StructureKind; items: Placed[]; interactive: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => geometryFor(kind), [kind]);
  const select = useWorld((s) => s.select);
  const selected = useWorld((s) => s.selected);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      const h = s.height;
      const w = s.width;
      tmp.position.set(s.x, s.y + (kind === 'lantern' ? 1.2 : h / 2), s.z);
      tmp.rotation.set(0, s.rot, 0);
      if (kind === 'lantern') tmp.scale.set(w, w, w);
      else if (kind === 'outbuilding') tmp.scale.set(w, h, w * 0.8);
      else if (kind === 'monolith') tmp.scale.set(w * 1.25, h, 1);
      else tmp.scale.set(w, h, w);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      tmpColor.set(tone(kind, s));
      // impressions -> glow: brighten the stone with the glow factor
      if (kind !== 'lantern') tmpColor.lerp(new THREE.Color('#FFF4DC'), s.glow * 0.35);
      mesh.setColorAt(i, tmpColor);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, kind]);

  // Selected structure pulses a little.
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || !selected) return;
    const i = items.findIndex((s) => s.id === selected.id);
    if (i < 0) return;
    const s = items[i];
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.015;
    tmp.position.set(s.x, s.y + (kind === 'lantern' ? 1.2 : s.height / 2), s.z);
    tmp.rotation.set(0, s.rot, 0);
    if (kind === 'lantern') tmp.scale.set(s.width * pulse, s.width * pulse, s.width * pulse);
    else if (kind === 'outbuilding') tmp.scale.set(s.width * pulse, s.height, s.width * 0.8 * pulse);
    else if (kind === 'monolith') tmp.scale.set(s.width * 1.25 * pulse, s.height, 1);
    else tmp.scale.set(s.width * pulse, s.height, s.width * pulse);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const i = e.instanceId;
    if (i == null) return;
    select(items[i] ?? null);
  };

  if (items.length === 0) return null;
  const isLantern = kind === 'lantern';
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, Math.max(1, items.length)]}
      castShadow={!isLantern}
      receiveShadow={!isLantern}
      onClick={onClick}
      frustumCulled
    >
      {isLantern ? (
        <meshStandardMaterial color={LANTERN} emissive={LANTERN} emissiveIntensity={2.2} flatShading toneMapped={false} />
      ) : (
        <meshStandardMaterial flatShading roughness={0.9} metalness={0} />
      )}
    </instancedMesh>
  );
}

/** reply_count -> windows. Small emissive quads on the structure faces, only for structures near the player. */
function Windows({ structures }: { structures: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const playerPos = useWorld((s) => s.playerPos);
  const lastRef = useRef({ x: NaN, z: NaN });
  const geometry = useMemo(() => new THREE.BoxGeometry(0.14, 0.22, 0.06), []);
  const max = 1600;

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { x: px, z: pz } = playerPos;
    if (Math.hypot(px - lastRef.current.x, pz - lastRef.current.z) < 6) return;
    lastRef.current = { x: px, z: pz };
    let n = 0;
    for (const s of structures) {
      if (s.windows === 0 || s.kind === 'lantern' || n >= max) continue;
      if (Math.hypot(s.x - px, s.z - pz) > 70) continue;
      const cols = Math.min(4, Math.max(1, Math.round(s.width * 2)));
      const rows = Math.ceil(s.windows / cols);
      for (let i = 0; i < s.windows && n < max; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const u = (c + 0.5) / cols - 0.5;
        const v = (r + 0.5) / Math.max(1, rows);
        const lx = u * s.width * 0.8;
        const ly = s.y + 0.4 + v * (s.height - 0.8);
        const lz = s.width * 0.5 + 0.02;
        tmp.position.set(s.x + Math.cos(s.rot) * lx - Math.sin(s.rot) * lz, ly, s.z + Math.sin(s.rot) * lx + Math.cos(s.rot) * lz);
        tmp.rotation.set(0, s.rot, 0);
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
      <meshStandardMaterial color="#FFE9C2" emissive="#FFD089" emissiveIntensity={0.9} flatShading />
    </instancedMesh>
  );
}

/** Visitor-lit lanterns: a small flame at the foot of structures that have lanternsLit > 0. */
function LitLanterns({ structures }: { structures: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => structures.filter((s) => s.lanternsLit > 0 && s.kind !== 'lantern'), [structures]);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.16, 0), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((s, i) => {
      const n = Math.min(6, s.lanternsLit);
      // one flame per structure, scaled by how many lanterns have been lit (log)
      const sc = 1 + Math.log2(1 + n) * 0.5;
      tmp.position.set(s.x + Math.cos(s.rot + 0.8) * (s.width * 0.6 + 0.3), s.y + 0.35, s.z + Math.sin(s.rot + 0.8) * (s.width * 0.6 + 0.3));
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
    <instancedMesh ref={ref} args={[geometry, undefined, Math.max(1, items.length)]} frustumCulled={false}>
      <meshStandardMaterial color={LANTERN} emissive={LANTERN} emissiveIntensity={2} toneMapped={false} />
    </instancedMesh>
  );
}

/** The landmark: a light column so it is always on the horizon, and its text readable up close. */
function Landmark({ structures }: { structures: Placed[] }) {
  const lm = useMemo(() => structures.find((s) => s.isLandmark), [structures]);
  const playerPos = useWorld((s) => s.playerPos);
  const [near, setNear] = useState(false);
  useFrame(() => {
    if (!lm) return;
    const d = Math.hypot(lm.x - playerPos.x, lm.z - playerPos.z);
    const n = d < 14;
    if (n !== near) setNear(n);
  });
  if (!lm) return null;
  const top = lm.y + lm.height;
  return (
    <group position={[lm.x, 0, lm.z]}>
      <mesh position={[0, top + 60, 0]}>
        <cylinderGeometry args={[0.12, 0.6, 120, 6, 1, true]} />
        <meshBasicMaterial color={LANTERN} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight position={[0, top + 1, 0]} color={LANTERN} intensity={lm.height * 2} distance={30} decay={2} />
      {near && (
        <Text
          position={[0, top + 0.9, 0]}
          rotation={[0, Math.atan2(playerPos.x - lm.x, playerPos.z - lm.z), 0]}
          fontSize={0.38}
          maxWidth={7}
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

/** Real post images on monoliths, loaded only when near, at most 12 at a time. */
function NearbyImages({ structures }: { structures: Placed[] }) {
  const playerPos = useWorld((s) => s.playerPos);
  const [near, setNear] = useState<Placed[]>([]);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.5) return;
    last.current = clock.elapsedTime;
    const n = structures
      .filter((s) => s.mediaUrl)
      .map((s) => ({ s, d: Math.hypot(s.x - playerPos.x, s.z - playerPos.z) }))
      .filter((e) => e.d < 28)
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
  // X media URLs are public CDN URLs; a failed load leaves the monolith blank (handled by ErrorBoundary-less fallback: suspense catches).
  const tex = useLoader(THREE.TextureLoader, s.mediaUrl as string);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 1;
  const w = s.width * 1.25 * 0.86;
  const h = Math.min(s.height * 0.86, w / aspect);
  const ww = Math.min(w, h * aspect);
  return (
    <group position={[s.x, s.y + s.height / 2, s.z]} rotation={[0, s.rot, 0]}>
      <mesh position={[0, 0, 0.17]}>
        <planeGeometry args={[ww, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.17]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ww, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}
