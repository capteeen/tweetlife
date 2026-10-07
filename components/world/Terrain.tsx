'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { TerrainBand } from '@/lib/world/geometry';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { prng, hashString } from '@/lib/world/seed';

// Ground: one low-poly disc, vertex-coloured by posting-cadence band (lush / dry / sand),
// a soft seeded undulation, and a water ring past the boundary.

function bandAt(bands: TerrainBand[], r: number) {
  for (const b of bands) if (r >= b.rIn && r < b.rOut) return b.cls;
  return bands[bands.length - 1]?.cls ?? 'sand';
}

export function Terrain({
  bands,
  boundaryRadius,
  biome,
  handle,
  paths,
}: {
  bands: TerrainBand[];
  boundaryRadius: number;
  biome: string;
  handle: string;
  paths: { x: number; z: number }[][];
}) {
  const pal = PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'];
  const geometry = useMemo(() => {
    // A square grid clipped to the disc: even triangles everywhere, no polar fan artifacts.
    const R = boundaryRadius + 6;
    const cell = Math.max(1.5, R / 70);
    const n = Math.ceil((2 * R) / cell) + 1;
    const rnd = prng(hashString(handle + '|terrain'));
    const nA = rnd() * 10, nB = rnd() * 10, nC = rnd() * 10;
    const lushC = new THREE.Color(pal.lush), dryC = new THREE.Color(pal.dry), sandC = new THREE.Color(pal.sand), waterC = new THREE.Color(pal.water);
    const positions: number[] = [];
    const colors: number[] = [];
    const index: number[] = [];
    const c = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -R + i * cell, z = -R + j * cell;
        const r = Math.hypot(x, z);
        const inside = r <= boundaryRadius;
        const h = inside
          ? 0.25 * Math.sin(x * 0.09 + nA) * Math.cos(z * 0.11 + nB) + 0.1 * Math.sin((x - z) * 0.23 + nC)
          : -0.6 - Math.min(2, (r - boundaryRadius) * 0.3);
        positions.push(x, h, z);
        const cls = bandAt(bands, r);
        c.copy(cls === 'lush' ? lushC : cls === 'dry' ? dryC : sandC);
        if (!inside) c.copy(waterC);
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
        // alternate the diagonal for a softer low-poly pattern
        if ((i + j) % 2 === 0) index.push(a, e, b, a, d, e);
        else index.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }, [bands, boundaryRadius, handle, pal]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>
      {/* water beyond the boundary */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[boundaryRadius - 0.5, boundaryRadius + 400, 96, 1]} />
        <meshStandardMaterial color={pal.water} roughness={0.35} metalness={0.05} transparent opacity={0.92} />
      </mesh>
      {paths.map((p, i) =>
        p.length > 1 ? (
          <Line key={i} points={p.map((q) => [q.x, 0.06, q.z] as [number, number, number])} color="#E8DCC8" lineWidth={3} transparent opacity={0.8} />
        ) : null,
      )}
    </group>
  );
}
