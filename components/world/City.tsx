'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Block, CityGrid, Placed, TerrainClass } from '@/lib/world/geometry';
import { TreeField, type TreeItem } from './Trees';
import { withDetail, type Detail } from './groundDetail';
import { StreetLights, StreetProps } from './StreetProps';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { themeOf, themedPalette } from '@/lib/world/cityThemes';
import { useWorld } from './store';
import { placementSite } from '@/lib/world/placement';
import { cityTrees, streetFurniture } from '@/lib/world/scatter';
import { prng, hashString } from '@/lib/world/seed';

// The ground of the city: countryside disc, asphalt grid, sidewalks, block slabs coloured by posting
// cadence (lush / dry / sand), vacant lots, lane dashes, crosswalks, trees, and water past the boundary.
// Everything is instanced; the only per-frame work is nothing.

const ASPHALT = '#3E434C';
const CURB = '#B9BCC2';
const WHITE_LINE = '#E9EDF2';
const YELLOW_LINE = '#E8B923';
const DRAIN = '#24262A';
const LANE = 1.75; // lane centre from the road centreline, as in Cars.tsx

type Paint = { x: number; z: number; w: number; d: number; c: string };
const DIRT = '#B99B74';
// leaf tints per tree: lush ones vary a little around the model's own greens; dry ones go olive and straw
const LUSH_TINTS = ['#FFFFFF', '#EEF6E2', '#F6FFE8', '#DCEBD0', '#FFF4DA', '#E6F0EA'];
const DRY_TINTS = ['#E2CF7E', '#D6C06C', '#EAD898', '#C9B868'];
const LEAF_REF = new THREE.Color('#5A9A45');
const canopyTint = (hex: string) => {
  const c = new THREE.Color(hex);
  const k = (a: number, b: number) => THREE.MathUtils.clamp(a / b, 0.4, 1.8);
  return new THREE.Color(k(c.r, LEAF_REF.r), k(c.g, LEAF_REF.g), k(c.b, LEAF_REF.b));
};

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
  /** walking: trees between the camera and the player dissolve */
  player?: boolean;
  /** street lights on */
  night?: boolean;
};

function clsColor(pal: (typeof PALETTES)[Biome], cls: TerrainClass) {
  return cls === 'lush' ? pal.lush : cls === 'dry' ? pal.dry : pal.sand;
}

export function City({ blocks, grid, outside, boundaryRadius, biome, handle, paths, structures, player = false, night = false }: Props) {
  const country = useWorld((s) => s.country);
  const theme = themeOf(country);
  const pal = themedPalette(PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'], country);
  const { K, pitchX, pitchZ, blockW, blockD, road, sidewalk } = grid;
  const cityW = (2 * K + 1) * pitchX, cityD = (2 * K + 1) * pitchZ;
  const R = boundaryRadius;
  // a country's own canopy greens (theme.canopy) become leaf tints over the tree models' greens
  const lushTints = useMemo<THREE.ColorRepresentation[]>(() => (theme.canopy ? theme.canopy.map(canopyTint) : LUSH_TINTS), [theme.canopy]);
  const countryside = useMemo(() => withDetail(new THREE.MeshStandardMaterial({ color: clsColor(pal, outside), roughness: 1 }), 'grass'), [pal, outside]);
  const asphalt = useMemo(() => withDetail(new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 }), 'asphalt'), []);

  // Road paint, US style: a double yellow centre line and white edge lines along every block-long stretch of road,
  // zebra crosswalks on all four approaches of each intersection, and a white stop bar across the lane that
  // arrives at it (traffic keeps right; see Cars.tsx). Plus manhole covers and kerbside storm drains.
  const paint = useMemo(() => {
    const out: Paint[] = [];
    const nodes: { cx: number; cz: number }[] = [];
    for (let i = -K; i <= K + 1; i++) for (let j = -K; j <= K + 1; j++) nodes.push({ cx: (i - 0.5) * pitchX, cz: (j - 0.5) * pitchZ });
    const walk = road / 2 + 2.4; // centre to the far edge of a crosswalk
    for (const { cx, cz } of nodes) {
      for (let s = -2; s <= 2; s++) {
        const o = s * 1.25;
        out.push({ x: cx + o, z: cz - road / 2 - 0.9, w: 0.8, d: road * 0.42, c: WHITE_LINE });
        out.push({ x: cx + o, z: cz + road / 2 + 0.9, w: 0.8, d: road * 0.42, c: WHITE_LINE });
        out.push({ x: cx - road / 2 - 0.9, z: cz + o, w: road * 0.42, d: 0.8, c: WHITE_LINE });
        out.push({ x: cx + road / 2 + 0.9, z: cz + o, w: road * 0.42, d: 0.8, c: WHITE_LINE });
      }
      // stop bars: heading (hx, hz) into the junction, the lane is to the right of the heading, (-hz, hx)
      for (const [hx, hz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bx = cx - hx * (walk + 0.45) - hz * LANE, bz = cz - hz * (walk + 0.45) + hx * LANE;
        out.push({ x: bx, z: bz, w: hx ? 0.45 : road / 2 - 0.4, d: hx ? road / 2 - 0.4 : 0.45, c: WHITE_LINE });
      }
    }
    // stretches between neighbouring junctions
    const stretch = (x0: number, z0: number, x1: number, z1: number) => {
      const along = x0 !== x1;
      const len = (along ? x1 - x0 : z1 - z0) - 2 * (walk + 0.9);
      if (len <= 1) return;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      for (const off of [-0.13, 0.13]) out.push(along ? { x: mx, z: mz + off, w: len, d: 0.12, c: YELLOW_LINE } : { x: mx + off, z: mz, w: 0.12, d: len, c: YELLOW_LINE });
      for (const off of [-(road / 2 - 0.35), road / 2 - 0.35]) out.push(along ? { x: mx, z: mz + off, w: len + 1.2, d: 0.13, c: WHITE_LINE } : { x: mx + off, z: mz, w: 0.13, d: len + 1.2, c: WHITE_LINE });
    };
    for (let j = -K; j <= K + 1; j++) for (let i = -K; i <= K; i++) stretch((i - 0.5) * pitchX, (j - 0.5) * pitchZ, (i + 0.5) * pitchX, (j - 0.5) * pitchZ);
    for (let i = -K; i <= K + 1; i++) for (let j = -K; j <= K; j++) stretch((i - 0.5) * pitchX, (j - 0.5) * pitchZ, (i - 0.5) * pitchX, (j + 0.5) * pitchZ);
    return out;
  }, [K, pitchX, pitchZ, road]);

  const covers = useMemo(() => {
    const rnd = prng(hashString(handle + '|covers'));
    const manholes: { x: number; z: number }[] = [];
    const drains: Paint[] = [];
    for (let i = -K; i <= K + 1; i++)
      for (let j = -K; j <= K + 1; j++) {
        const cx = (i - 0.5) * pitchX, cz = (j - 0.5) * pitchZ;
        if (rnd() < 0.7) manholes.push({ x: cx + (rnd() < 0.5 ? -LANE : LANE), z: cz + pitchZ * (0.3 + rnd() * 0.4) });
        if (rnd() < 0.5) manholes.push({ x: cx + pitchX * (0.3 + rnd() * 0.4), z: cz + (rnd() < 0.5 ? -LANE : LANE) });
        // a grate in the gutter just past each corner
        for (const [sx, sz] of [[1, 1], [-1, -1]]) {
          drains.push({ x: cx + sx * (road / 2 + 3.2), z: cz + sz * (road / 2 - 0.22), w: 0.9, d: 0.32, c: DRAIN });
          drains.push({ x: cx + sx * (road / 2 - 0.22), z: cz - sz * (road / 2 + 3.2), w: 0.32, d: 0.9, c: DRAIN });
        }
      }
    return { manholes, drains };
  }, [K, pitchX, pitchZ, road, handle]);

  // Trees, sidewalk furniture and street lights, all from lib/world/scatter.ts so the world check tests what is
  // drawn: never on a road, a crossing, a doorway or a plaza. Countries change how wooded the countryside is
  // (Robinhood City sits in Sherwood Forest) and tint the leaves with their own greens.
  const site = useMemo(() => placementSite({ blocks, grid, boundaryRadius: R, structures }), [blocks, grid, R, structures]);
  const spots = useMemo(() => cityTrees(site, { blocks, grid, outside, boundaryRadius: R, handle, wooded: theme.trees }), [site, blocks, grid, outside, R, handle, theme.trees]);
  const furniture = useMemo(() => streetFurniture(site, { blocks, grid, trees: spots, handle }), [site, blocks, grid, spots, handle]);
  const trees = useMemo<TreeItem[]>(
    () =>
      [...spots, ...furniture.shrubs].map((t) => {
        const tints = t.dry ? DRY_TINTS : lushTints;
        return { species: t.species, x: t.x, y: t.y, z: t.z, s: t.s, yaw: t.yaw, tint: tints[Math.min(tints.length - 1, Math.floor(t.tone * tints.length))] };
      }),
    [spots, furniture, lushTints],
  );

  return (
    <group>
      {/* countryside */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={countryside}>
        <circleGeometry args={[R + 2, 72]} />
      </mesh>
      {/* water beyond the boundary */}
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R - 0.5, R + 500, 96, 1]} />
        <meshStandardMaterial color={pal.water} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* asphalt under the whole city */}
      {blocks.length > 0 && (
        <mesh position={[0, 0.0, 0]} receiveShadow material={asphalt}>
          <boxGeometry args={[cityW + road, 0.08, cityD + road]} />
        </mesh>
      )}
      <Slabs
        items={blocks.map((b) => ({ x: b.x, z: b.z, w: blockW + 2 * sidewalk, d: blockD + 2 * sidewalk, color: CURB }))}
        y={0.08}
        h={0.12}
        receive
        detail="paving"
      />
      <Slabs items={blocks.map((b) => ({ x: b.x, z: b.z, w: blockW, d: blockD, color: clsColor(pal, b.cls) }))} y={0.16} h={0.1} receive detail="grass" />
      <Slabs
        items={blocks.flatMap((b) => b.vacant.map((v) => ({ x: v.x, z: v.z, w: v.w - 0.6, d: v.d - 0.6, color: v.cls === 'sand' ? DIRT : v.cls === 'dry' ? pal.dry : pal.lush })))}
        y={0.2}
        h={0.08}
        detail="grass"
      />
      {blocks.length > 0 && <RoadPaint items={paint} />}
      {blocks.length > 0 && <RoadPaint items={covers.drains} rough={0.6} y={0.1} />}
      {blocks.length > 0 && <Manholes items={covers.manholes} />}
      <TreeField items={trees} player={player} />
      <StreetProps items={furniture.props} />
      <StreetLights items={furniture.lights} night={night} />
      {paths.map((p, i) =>
        p.length > 1 ? (
          <Line key={i} points={p.map((q) => [q.x, 0.32, q.z] as [number, number, number])} color="#E8DCC8" lineWidth={3} transparent opacity={0.85} />
        ) : null,
      )}
    </group>
  );
}

function Slabs({ items, y, h, receive, detail }: { items: { x: number; z: number; w: number; d: number; color: string }[]; y: number; h: number; receive?: boolean; detail?: Detail }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1 });
    return detail ? withDetail(m, detail) : m;
  }, [detail]);
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
    <instancedMesh ref={ref} args={[geometry, material, items.length]} receiveShadow={receive} frustumCulled={false} />
  );
}

/** Flat marks on the asphalt, each its own size and colour: one draw call for all the paint in the city. */
function RoadPaint({ items, rough = 0.85, y = 0.09 }: { items: Paint[]; rough?: number; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 0.03, 1), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, y, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(it.w, 1, it.d);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tmpColor.set(it.c));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, y]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} receiveShadow frustumCulled={false}>
      <meshStandardMaterial roughness={rough} />
    </instancedMesh>
  );
}

/** Round cast-iron covers in the lanes, with a raised rim. */
function Manholes({ items }: { items: { x: number; z: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16);
    return g;
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, 0.095, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} receiveShadow frustumCulled={false}>
      <meshStandardMaterial color="#2A2C30" roughness={0.55} metalness={0.5} />
    </instancedMesh>
  );
}
