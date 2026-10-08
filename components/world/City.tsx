'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Block, CityGrid, Placed, TerrainClass } from '@/lib/world/geometry';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { themeOf, themedPalette } from '@/lib/world/cityThemes';
import { useWorld } from './store';
import { placementSite } from '@/lib/world/placement';
import { cityTrees } from '@/lib/world/scatter';

// The ground of the city: countryside disc, asphalt grid, sidewalks, block slabs coloured by posting
// cadence (lush / dry / sand), vacant lots, lane dashes, crosswalks, trees, and water past the boundary.
// Everything is instanced; the only per-frame work is nothing.

const ASPHALT = '#3E434C';
const CURB = '#B9BCC2';
const DASH = '#E9EDF2';
const DIRT = '#B99B74';
const TRUNK = '#5C4033';
const CANOPY = ['#3E8E41', '#4FA653', '#2F7A3A', '#6BBF59'];
const CANOPY_DRY = ['#8C9A4C', '#A3A14E'];

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

type Props = {
  blocks: Block[];
  grid: CityGrid;
  outside: TerrainClass;
  boundaryRadius: number;
  biome: string;
  handle: string;
  paths: { x: number; z: number }[][];
  structures: Placed[];
};

function clsColor(pal: (typeof PALETTES)[Biome], cls: TerrainClass) {
  return cls === 'lush' ? pal.lush : cls === 'dry' ? pal.dry : pal.sand;
}

export function City({ blocks, grid, outside, boundaryRadius, biome, handle, paths, structures }: Props) {
  const country = useWorld((s) => s.country);
  const theme = themeOf(country);
  const pal = themedPalette(PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'], country);
  const { K, pitchX, pitchZ, blockW, blockD, road, sidewalk } = grid;
  const cityW = (2 * K + 1) * pitchX, cityD = (2 * K + 1) * pitchZ;
  const R = boundaryRadius;

  // Lane dashes along every road centreline; crosswalk stripes at every intersection.
  const dashes = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const half = cityW / 2, halfD = cityD / 2;
    for (let j = -K; j <= K + 1; j++) {
      const z = (j - 0.5) * pitchZ; // road centre between block rows j-1 and j
      for (let x = -half + 2; x < half; x += 5) out.push({ x, z, rot: 0 });
    }
    for (let i = -K; i <= K + 1; i++) {
      const x = (i - 0.5) * pitchX;
      for (let z = -halfD + 2; z < halfD; z += 5) out.push({ x, z, rot: Math.PI / 2 });
    }
    return out;
  }, [K, pitchX, pitchZ, cityW, cityD]);

  const stripes = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const hw = blockW / 2 + sidewalk, hd = blockD / 2 + sidewalk;
    for (let i = -K; i <= K + 1; i++)
      for (let j = -K; j <= K + 1; j++) {
        const cx = (i - 0.5) * pitchX, cz = (j - 0.5) * pitchZ;
        // four approaches, 5 stripes each
        for (let s = -2; s <= 2; s++) {
          const o = s * 1.25;
          out.push({ x: cx + o, z: cz - road / 2 - 0.9, rot: 0 });
          out.push({ x: cx + o, z: cz + road / 2 + 0.9, rot: 0 });
          out.push({ x: cx - road / 2 - 0.9, z: cz + o, rot: Math.PI / 2 });
          out.push({ x: cx + road / 2 + 0.9, z: cz + o, rot: Math.PI / 2 });
        }
        void hw;
        void hd;
      }
    return out;
  }, [K, pitchX, pitchZ, road, blockW, blockD, sidewalk]);

  // Trees: street trees on lush blocks, a few on dry, none on sand; vacant lush lots get a cluster; the countryside
  // beyond the city gets scattered trees by its own class
  // and the country (Robinhood City sits in Sherwood Forest). Never on a road, a crossing, a doorway or a plaza.
  const site = useMemo(() => placementSite({ blocks, grid, boundaryRadius: R, structures }), [blocks, grid, R, structures]);
  const trees = useMemo(() => cityTrees(site, { blocks, grid, outside, boundaryRadius: R, handle, wooded: theme.trees }), [site, blocks, grid, outside, R, handle, theme.trees]);

  return (
    <group>
      {/* countryside */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R + 2, 72]} />
        <meshStandardMaterial color={clsColor(pal, outside)} roughness={1} />
      </mesh>
      {/* water beyond the boundary */}
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R - 0.5, R + 500, 96, 1]} />
        <meshStandardMaterial color={pal.water} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* asphalt under the whole city */}
      {blocks.length > 0 && (
        <mesh position={[0, 0.0, 0]} receiveShadow>
          <boxGeometry args={[cityW + road, 0.08, cityD + road]} />
          <meshStandardMaterial color={ASPHALT} roughness={0.95} />
        </mesh>
      )}
      <Slabs
        items={blocks.map((b) => ({ x: b.x, z: b.z, w: blockW + 2 * sidewalk, d: blockD + 2 * sidewalk, color: CURB }))}
        y={0.08}
        h={0.12}
        receive
      />
      <Slabs items={blocks.map((b) => ({ x: b.x, z: b.z, w: blockW, d: blockD, color: clsColor(pal, b.cls) }))} y={0.16} h={0.1} receive />
      <Slabs
        items={blocks.flatMap((b) => b.vacant.map((v) => ({ x: v.x, z: v.z, w: v.w - 0.6, d: v.d - 0.6, color: v.cls === 'sand' ? DIRT : v.cls === 'dry' ? pal.dry : pal.lush })))}
        y={0.2}
        h={0.08}
      />
      {blocks.length > 0 && <Dashes items={dashes} w={2.2} d={0.25} color={DASH} />}
      {blocks.length > 0 && <Dashes items={stripes} w={0.8} d={road * 0.42} color={DASH} />}
      <Trees items={trees} canopy={theme.canopy} />
      {paths.map((p, i) =>
        p.length > 1 ? (
          <Line key={i} points={p.map((q) => [q.x, 0.32, q.z] as [number, number, number])} color="#E8DCC8" lineWidth={3} transparent opacity={0.85} />
        ) : null,
      )}
    </group>
  );
}

function Slabs({ items, y, h, receive }: { items: { x: number; z: number; w: number; d: number; color: string }[]; y: number; h: number; receive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, y + h / 2, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(it.w, h, it.d);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tmpColor.set(it.color));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, y, h]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} receiveShadow={receive} frustumCulled={false}>
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

function Dashes({ items, w, d, color }: { items: { x: number; z: number; rot: number }[]; w: number; d: number; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(w, 0.03, d), [w, d]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, 0.09, it.z);
      tmp.rotation.set(0, it.rot, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
      <meshStandardMaterial color={color} roughness={0.9} />
    </instancedMesh>
  );
}

function Trees({ items, canopy: green = CANOPY }: { items: { x: number; z: number; s: number; dry: boolean }[]; canopy?: string[] }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.12, 0.18, 1, 5), []);
  const canopyGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  useEffect(() => {
    const t = trunk.current, c = canopy.current;
    if (!t || !c) return;
    items.forEach((it, i) => {
      const h = 1.6 * it.s;
      tmp.position.set(it.x, 0.2 + h / 2, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(it.s, h, it.s);
      tmp.updateMatrix();
      t.setMatrixAt(i, tmp.matrix);
      tmp.position.set(it.x, 0.2 + h + 0.9 * it.s, it.z);
      tmp.rotation.set(0, (it.x * 3.1 + it.z * 1.7) % 6.28, 0);
      tmp.scale.set(1.3 * it.s, 1.5 * it.s, 1.3 * it.s);
      tmp.updateMatrix();
      c.setMatrixAt(i, tmp.matrix);
      const palette = it.dry ? CANOPY_DRY : green;
      c.setColorAt(i, tmpColor.set(palette[Math.abs(Math.round(it.x * 7 + it.z * 13)) % palette.length]));
    });
    t.count = c.count = items.length;
    t.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [items, green]);
  if (items.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={trunk} args={[trunkGeo, undefined, items.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color={TRUNK} flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopy} args={[canopyGeo, undefined, items.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
