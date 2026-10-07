'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';

import type { Placed } from '@/lib/world/geometry';
import { planBuilding, type Part, type PartGeo, type PartMat, type PlanInput } from '@/lib/world/buildings';
import { useWorld } from './store';

// Post buildings, drawn from lib/world/buildings.ts plans. Every part of every building goes into one
// InstancedMesh per (geometry, material) pair, so the whole city is a dozen draw calls. Massing (bodies,
// roofs, tiers) is drawn for every building; facade detail (windows, ledges, balconies, awnings, rooftop
// units) only for buildings within `detailRadius` of the player, refreshed as they walk.

const KEYS: [PartGeo, PartMat][] = [
  ['box', 'solid'],
  ['box', 'glass'],
  ['box', 'lit'],
  ['gable', 'solid'],
  ['cyl', 'solid'],
  ['pyramid', 'solid'],
];
const keyOf = (g: PartGeo, m: PartMat) => `${g}:${m}`;
const MAX_DETAIL = 60000;

function gableGeometry() {
  // triangular prism, ridge along x, centred on the origin, base y=-0.5 apex y=0.5
  const a = [-0.5, -0.5, -0.5], b = [-0.5, -0.5, 0.5], c = [-0.5, 0.5, 0];
  const d = [0.5, -0.5, -0.5], e = [0.5, -0.5, 0.5], f = [0.5, 0.5, 0];
  const tris = [a, b, c, f, e, d, a, c, f, a, f, d, b, e, f, b, f, c, a, d, e, a, e, b];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

function makeGeometry(g: PartGeo) {
  if (g === 'box') return new THREE.BoxGeometry(1, 1, 1);
  if (g === 'gable') return gableGeometry();
  if (g === 'cyl') return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const p = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1);
  p.rotateY(Math.PI / 4);
  return p;
}

function makeMaterial(m: PartMat) {
  if (m === 'lit') return new THREE.MeshBasicMaterial({ toneMapped: false });
  if (m === 'glass') return new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.1 });
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
}

const tmp = new THREE.Object3D();
tmp.rotation.order = 'YXZ';
const colorCache = new Map<string, THREE.Color>();
const tmpColor = new THREE.Color();
function colorOf(hex: string) {
  let c = colorCache.get(hex);
  if (!c) colorCache.set(hex, (c = new THREE.Color(hex)));
  return c;
}

function inputFor(s: Placed, tops: Set<string>): PlanInput {
  const stack = `${s.x.toFixed(2)},${s.z.toFixed(2)}`;
  return {
    seed: s.postId,
    kind: s.kind,
    width: s.width,
    depth: s.depth,
    height: s.height,
    windows: s.windows,
    glow: s.glow,
    isLandmark: s.isLandmark,
    segment: s.segment,
    isTop: tops.has(s.id),
    stackSeed: stack,
  };
}

function writePart(mesh: THREE.InstancedMesh, i: number, s: Placed, p: Part) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  tmp.position.set(s.x + p.x * c + p.z * sn, s.y + p.y + p.sy / 2, s.z - p.x * sn + p.z * c);
  tmp.rotation.set(p.rx, s.rot + p.ry, 0, 'YXZ');
  tmp.scale.set(p.sx, p.sy, p.sz);
  tmp.updateMatrix();
  mesh.setMatrixAt(i, tmp.matrix);
  mesh.setColorAt(i, p.k === 1 ? colorOf(p.color) : tmpColor.copy(colorOf(p.color)).multiplyScalar(p.k));
}

type Group = { mesh: THREE.InstancedMesh | null; owners: Int32Array };

export function Buildings({ items, interactive, detailRadius = 120 }: { items: Placed[]; interactive: boolean; detailRadius?: number }) {
  const select = useWorld((s) => s.select);
  const playerPos = useWorld((s) => s.playerPos);

  const tops = useMemo(() => {
    // the top piece of every stack (thread towers) gets the crown
    const best = new Map<string, Placed>();
    for (const s of items) {
      const k = `${s.x.toFixed(2)},${s.z.toFixed(2)}`;
      const cur = best.get(k);
      if (!cur || s.y > cur.y) best.set(k, s);
    }
    return new Set([...best.values()].map((s) => s.id));
  }, [items]);

  // Massing for every building, computed once per world.
  const mass = useMemo(() => {
    const byKey = new Map<string, { s: Placed; p: Part; owner: number }[]>();
    items.forEach((s, owner) => {
      for (const p of planBuilding(inputFor(s, tops), false).parts) {
        const k = keyOf(p.g, p.m);
        (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ s, p, owner });
      }
    });
    return byKey;
  }, [items, tops]);

  const detailCache = useRef(new Map<number, Part[]>());
  useEffect(() => detailCache.current.clear(), [items]);

  const geometries = useMemo(() => Object.fromEntries(KEYS.map(([g]) => [g, makeGeometry(g)])) as Record<PartGeo, THREE.BufferGeometry>, []);
  const materials = useMemo(() => Object.fromEntries((['solid', 'glass', 'lit'] as PartMat[]).map((m) => [m, makeMaterial(m)])) as unknown as Record<PartMat, THREE.Material>, []);

  const massRefs = useRef(new Map<string, Group>());
  const detailRefs = useRef(new Map<string, Group>());

  useEffect(() => {
    for (const [k, list] of mass) {
      const g = massRefs.current.get(k);
      if (!g?.mesh) continue;
      const mesh = g.mesh;
      list.forEach(({ s, p, owner }, i) => {
        writePart(mesh, i, s, p);
        g.owners[i] = owner;
      });
      g.mesh.count = list.length;
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
      g.mesh.computeBoundingSphere();
    }
  }, [mass]);

  const last = useRef({ x: NaN, z: NaN, items: null as Placed[] | null });
  useFrame(() => {
    const { x: px, z: pz } = playerPos;
    const l = last.current;
    if (l.items === items && Math.hypot(px - l.x, pz - l.z) < 8) return;
    last.current = { x: px, z: pz, items };
    const counts = new Map<string, number>();
    const cache = detailCache.current;
    const near = items
      .map((s, i) => ({ s, i, d: Math.hypot(s.x - px, s.z - pz) }))
      .filter((e) => e.d < detailRadius)
      .sort((a, b) => a.d - b.d);
    for (const { s, i } of near) {
      let parts = cache.get(i);
      if (!parts) {
        parts = planBuilding(inputFor(s, tops), true).parts.filter((p) => p.detail);
        cache.set(i, parts);
      }
      for (const p of parts) {
        const k = keyOf(p.g, p.m);
        const g = detailRefs.current.get(k);
        if (!g?.mesh) continue;
        const n = counts.get(k) ?? 0;
        if (n >= MAX_DETAIL) continue;
        writePart(g.mesh, n, s, p);
        g.owners[n] = i;
        counts.set(k, n + 1);
      }
    }
    for (const [k, g] of detailRefs.current) {
      if (!g.mesh) continue;
      g.mesh.count = counts.get(k) ?? 0;
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
    }
  });

  const onClick = (groups: Map<string, Group>, k: string) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const g = groups.get(k);
    if (e.instanceId == null || !g) return;
    select(items[g.owners[e.instanceId]] ?? null);
  };

  // owners (instance -> building) survive ref churn; only the mesh handle is swapped
  const bind = (groups: Map<string, Group>, k: string, cap: number) => (mesh: THREE.InstancedMesh | null) => {
    const cur = groups.get(k);
    if (cur && cur.owners.length === cap) cur.mesh = mesh;
    else groups.set(k, { mesh, owners: new Int32Array(cap) });
  };

  if (items.length === 0) return null;
  return (
    <group>
      {KEYS.map(([g, m]) => {
        const k = keyOf(g, m);
        const n = mass.get(k)?.length ?? 0;
        if (n === 0) return null;
        return (
          <instancedMesh
            key={`m:${k}:${n}`}
            ref={bind(massRefs.current, k, n)}
            args={[geometries[g], materials[m], n]}
            castShadow
            receiveShadow
            frustumCulled={false}
            onClick={onClick(massRefs.current, k)}
          />
        );
      })}
      {KEYS.map(([g, m]) => {
        const k = keyOf(g, m);
        const cap = g === 'box' ? MAX_DETAIL : 4000;
        return (
          <instancedMesh
            key={`d:${k}`}
            ref={bind(detailRefs.current, k, cap)}
            args={[geometries[g], materials[m], cap]}
            castShadow={m === 'solid'}
            receiveShadow
            frustumCulled={false}
            onClick={onClick(detailRefs.current, k)}
          />
        );
      })}
      <Selection />
    </group>
  );
}

/** A glowing outline on the ground around the selected building. */
function Selection() {
  const selected = useWorld((s) => s.selected);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.02);
  });
  if (!selected || selected.kind === 'lantern') return null;
  const w = selected.width + 1.2, d = selected.depth + 1.2, t = 0.18;
  return (
    <group ref={ref} position={[selected.x, 0.06, selected.z]}>
      {[
        [0, d / 2, w, t],
        [0, -d / 2, w, t],
        [w / 2, 0, t, d],
        [-w / 2, 0, t, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[sx, 0.06, sz]} />
          <meshBasicMaterial color="#FFE3A3" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
