'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { CityGrid } from '@/lib/world/geometry';
import { prng, hashString } from '@/lib/world/seed';

// Ambient traffic: low-poly cars driving clockwise around blocks on the right-hand side of the road.
// Count comes from followers_count; routes are seeded by the handle.

const COLORS = ['#E63946', '#1D9BF0', '#FFD166', '#F4F1DE', '#2D2D2D', '#06D6A0', '#8338EC', '#F28C28'];
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

type Car = { i: number; j: number; perim: number; speed: number; offset: number; color: string };

export function Cars({ count, grid, handle }: { count: number; grid: CityGrid; handle: string }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const { K, pitchX, pitchZ, blockW, blockD, road, sidewalk } = grid;
  // route rectangle: the road lane just outside a block's sidewalk
  const hw = blockW / 2 + sidewalk + road * 0.3, hd = blockD / 2 + sidewalk + road * 0.3;
  const cars = useMemo<Car[]>(() => {
    const rnd = prng(hashString(handle + '|cars'));
    return Array.from({ length: count }, () => ({
      i: Math.round((rnd() * 2 - 1) * K),
      j: Math.round((rnd() * 2 - 1) * K),
      perim: 4 * hw + 4 * hd,
      speed: 6 + rnd() * 5,
      offset: rnd() * (4 * hw + 4 * hd),
      color: COLORS[Math.floor(rnd() * COLORS.length)],
    }));
  }, [count, K, hw, hd, handle]);
  const bodyGeo = useMemo(() => new THREE.BoxGeometry(1.7, 0.6, 3.6), []);
  const cabinGeo = useMemo(() => new THREE.BoxGeometry(1.4, 0.55, 1.8), []);

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    cars.forEach((c, i) => b.setColorAt(i, tmpColor.set(c.color)));
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }, [cars]);

  useFrame(({ clock }) => {
    const b = body.current, c = cabin.current;
    if (!b || !c) return;
    const t = clock.elapsedTime;
    cars.forEach((car, i) => {
      const cx = car.i * pitchX, cz = car.j * pitchZ;
      let s = (car.offset + t * car.speed) % car.perim;
      let x = 0, z = 0, rot = 0;
      // clockwise (seen from above): east along the north side, south along the east side, ...
      if (s < 2 * hw) {
        x = cx - hw + s; z = cz - hd; rot = Math.PI / 2;
      } else if ((s -= 2 * hw) < 2 * hd) {
        x = cx + hw; z = cz - hd + s; rot = 0;
      } else if ((s -= 2 * hd) < 2 * hw) {
        x = cx + hw - s; z = cz + hd; rot = -Math.PI / 2;
      } else {
        s -= 2 * hw;
        x = cx - hw; z = cz + hd - s; rot = Math.PI;
      }
      tmp.position.set(x, 0.5, z);
      tmp.rotation.set(0, rot, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, 1.05, z);
      tmp.updateMatrix();
      c.setMatrixAt(i, tmp.matrix);
    });
    b.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, undefined, count]} castShadow frustumCulled={false}>
        <meshStandardMaterial flatShading roughness={0.5} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[cabinGeo, undefined, count]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#1B2436" flatShading roughness={0.3} metalness={0.3} />
      </instancedMesh>
    </group>
  );
}
