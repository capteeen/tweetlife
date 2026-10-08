'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Small props only read up close, and each one is a draw call (two with its shadow). Children cast their shadows
// while the camera is within `shadowWithin` of this group, and are not drawn at all beyond `hideBeyond`.
const casts = new WeakMap<THREE.Object3D, boolean>();
const tmp = new THREE.Vector3();

export function DistanceDetail({ shadowWithin, hideBeyond = Infinity, children }: { shadowWithin: number; hideBeyond?: number; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const st = useRef({ level: -1, tick: 0 });
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const d = g.getWorldPosition(tmp).distanceTo(camera.position);
    const level = d < shadowWithin ? 0 : d < hideBeyond ? 1 : 2;
    g.visible = level < 2;
    // re-apply now and then too, so children mounted later pick up the current state
    if (level === st.current.level && ++st.current.tick < 30) return;
    st.current.level = level;
    st.current.tick = 0;
    g.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      if (!casts.has(o)) casts.set(o, o.castShadow);
      o.castShadow = level === 0 && casts.get(o)!;
    });
  });
  return <group ref={group}>{children}</group>;
}
