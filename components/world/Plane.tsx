'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { planeModel, type PlaneKind } from './planeModels';
import { liveryFor } from './planeLiveries';

// The one plane component flights and the airport use. Facing +z with wheels on y = 0; the parent group
// places and turns it. `country` paints that country's livery (a `tint` equal to a country's primary colour does
// too); any other tint is a plain stripe-and-fin scheme. `flying` folds the gear away. Swap the models behind this
// without touching flight code.
export type { PlaneKind } from './planeModels';

// shared by every plane: one paint material (vertex colours), unlit lights, and strobes that flash together
const PAINT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18 });
const LIGHTS = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const STROBES = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const tmp = new THREE.Vector3();

/** Past this distance the gear and the little lights are not worth a draw call. */
const DETAIL_WITHIN = 150;
const SHADOW_WITHIN = 110;

export function Plane({ kind, country, tint, flying = false, rotor }: { kind: PlaneKind; country?: string | null; tint?: string; flying?: boolean; rotor?: number }) {
  const model = useMemo(() => planeModel(kind, liveryFor(country, tint)), [kind, country, tint]);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const gear = useRef<THREE.Mesh>(null);
  const nav = useRef<THREE.Mesh>(null);
  const blades = useRef<(THREE.Mesh | null)[]>([]);
  const spin = rotor ?? (flying ? 1 : 0);
  useFrame(({ clock, camera }, dt) => {
    // double flash every 1.3 s
    const t = clock.elapsedTime % 1.3;
    STROBES.visible = t < 0.05 || (t > 0.16 && t < 0.21);
    const g = group.current;
    if (!g) return;
    const d = g.getWorldPosition(tmp).distanceTo(camera.position);
    if (body.current) body.current.castShadow = d < SHADOW_WITHIN;
    if (gear.current) gear.current.visible = (!flying || kind === 'heli') && d < DETAIL_WITHIN;
    if (nav.current) nav.current.visible = d < DETAIL_WITHIN * 2;
    blades.current.forEach((b, i) => {
      if (!b || !model.rotor) return;
      b.rotation[model.rotor[i].axis] += dt * spin * (model.rotor[i].axis === 'y' ? 26 : 60);
    });
  });
  return (
    <group ref={group}>
      <mesh ref={body} geometry={model.body} material={PAINT} castShadow receiveShadow />
      {model.gear && <mesh ref={gear} geometry={model.gear} material={PAINT} castShadow />}
      {model.nav && <mesh ref={nav} geometry={model.nav} material={LIGHTS} />}
      {model.strobe && <mesh geometry={model.strobe} material={STROBES} />}
      {model.rotor?.map((r, i) => (
        <mesh key={i} ref={(m) => { blades.current[i] = m; }} position={r.at} geometry={r.geometry} material={PAINT} castShadow={i === 0} />
      ))}
    </group>
  );
}

/** Nose-to-tail length and span of a model, for spacing and cameras. */
export function planeSize(kind: PlaneKind) {
  const m = planeModel(kind, liveryFor());
  return { length: m.length, span: m.span };
}
