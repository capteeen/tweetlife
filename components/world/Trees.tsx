'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SPECIES, treeModel, type TreeSpecies } from './treeModels';
import { useWorld } from './store';

// Every tree in the world, instanced: one InstancedMesh per species and level of detail (see treeModels.ts), so the
// whole forest is a handful of draw calls. Trees within `nearRadius` of the camera use the detailed model, the rest
// the light one; the split is redone a few times a second as the camera moves.
// Leaves sway in the wind on the GPU. While walking, leaves and trunks between the camera and the player dissolve
// (screen-door dither), so a tree never fills the screen; the camera's pull-in skips trees for the same reason.

export type TreeItem = {
  species: TreeSpecies;
  x: number;
  z: number;
  /** ground height under the tree */
  y?: number;
  /** overall scale */
  s: number;
  yaw: number;
  /** leaf tint (multiplies the leaf colours; bark is untouched) */
  tint?: THREE.ColorRepresentation;
};

const PHONE = typeof window !== 'undefined' && !!window.matchMedia?.('(any-pointer: coarse)').matches;
const NEAR = PHONE ? 30 : 45;

// shared by every tree material: time for the wind, and where the player's head is for the see-through cone
const shared = {
  uTime: { value: 0 },
  uFadeHead: { value: new THREE.Vector3() },
  uFadeOn: { value: 0 },
};

const WIND: Record<TreeSpecies, { amp: number; from: number; flutter: number }> = {
  oak: { amp: 0.004, from: 1.5, flutter: 0.035 },
  street: { amp: 0.005, from: 1.5, flutter: 0.03 },
  pine: { amp: 0.0025, from: 1.0, flutter: 0.01 },
  palm: { amp: 0.006, from: 0.5, flutter: 0.06 },
  shrub: { amp: 0.0, from: 0.0, flutter: 0.02 },
};

const materials = new Map<TreeSpecies, THREE.MeshStandardMaterial>();
function treeMaterial(species: TreeSpecies) {
  let m = materials.get(species);
  if (m) return m;
  const w = WIND[species];
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: species === 'palm' ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uFadeHead = shared.uFadeHead;
    shader.uniforms.uFadeOn = shared.uFadeOn;
    shader.uniforms.uWind = { value: new THREE.Vector3(w.amp, w.from, w.flutter) };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aLeaf;
uniform float uTime;
uniform vec3 uWind;
varying vec3 vTreeWorld;`,
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec3( 1.0 );
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor = mix( vColor, vColor * instanceColor.xyz, aLeaf );
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 ip = vec3( 0.0 );
#ifdef USE_INSTANCING
  ip = instanceMatrix[3].xyz;
#endif
  float ph = ip.x * 0.31 + ip.z * 0.17;
  float hh = max( position.y - uWind.y, 0.0 );
  float sway = ( sin( uTime * 1.1 + ph ) * 0.7 + sin( uTime * 2.3 + ph * 1.7 ) * 0.3 ) * uWind.x * hh * hh;
  transformed.x += sway;
  transformed.z += cos( uTime * 0.9 + ph ) * 0.5 * uWind.x * hh * hh;
  transformed += objectNormal * sin( uTime * 5.0 + dot( position, vec3( 7.1, 3.3, 5.7 ) ) + ph ) * uWind.z * aLeaf;
}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 tw = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  tw = instanceMatrix * tw;
#endif
  vTreeWorld = ( modelMatrix * tw ).xyz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uFadeHead;
uniform float uFadeOn;
varying vec3 vTreeWorld;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if ( uFadeOn > 0.5 ) {
  vec3 d = uFadeHead - cameraPosition;
  float t = dot( vTreeWorld - cameraPosition, d ) / max( dot( d, d ), 1e-4 );
  if ( t > 0.0 && t < 0.97 ) {
    float r = mix( 1.3, 2.6, t );
    float f = 1.0 - smoothstep( r * 0.5, r, length( vTreeWorld - ( cameraPosition + d * t ) ) );
    float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    if ( ign < f * 0.9 ) discard;
  }
}`,
      );
  };
  materials.set(species, m);
  return m;
}

type Prepared = { matrices: Float32Array; colors: Float32Array; x: Float32Array; z: Float32Array; n: number };

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();
const WHITE = new THREE.Color('#FFFFFF');

function prepare(items: TreeItem[]): Prepared {
  const n = items.length;
  const out: Prepared = { matrices: new Float32Array(n * 16), colors: new Float32Array(n * 3), x: new Float32Array(n), z: new Float32Array(n), n };
  items.forEach((it, i) => {
    tmp.position.set(it.x, it.y ?? 0, it.z);
    tmp.rotation.set(0, it.yaw, 0);
    // a little shape variety: some trees a touch taller, some broader
    const stretch = 0.92 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.16;
    tmp.scale.set(it.s, it.s * stretch, it.s);
    tmp.updateMatrix();
    tmp.matrix.toArray(out.matrices, i * 16);
    (it.tint != null ? tmpColor.set(it.tint) : WHITE).toArray(out.colors, i * 3);
    out.x[i] = it.x;
    out.z[i] = it.z;
  });
  return out;
}

function SpeciesField({ species, items, nearRadius }: { species: TreeSpecies; items: TreeItem[]; nearRadius: number }) {
  const near = useRef<THREE.InstancedMesh>(null);
  const far = useRef<THREE.InstancedMesh>(null);
  const prep = useMemo(() => prepare(items), [items]);
  const geoNear = useMemo(() => treeModel(species, true), [species]);
  const geoFar = useMemo(() => treeModel(species, false), [species]);
  const material = useMemo(() => treeMaterial(species), [species]);
  const last = useRef({ x: Infinity, z: Infinity, at: -1 });
  useEffect(() => {
    last.current.x = Infinity; // re-split on new items
  }, [prep]);
  useFrame(({ camera, clock }) => {
    const a = near.current, b = far.current;
    if (!a || !b) return;
    for (const m of [a, b]) {
      m.userData.seeThrough = true;
      if (!m.instanceColor || m.instanceColor.count < prep.n) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(prep.n * 3), 3);
    }
    const cx = camera.position.x, cz = camera.position.z, L = last.current;
    if (Math.hypot(cx - L.x, cz - L.z) < 3 && clock.elapsedTime - L.at < 0.5) return;
    if (Math.hypot(cx - L.x, cz - L.z) < 0.5 && L.at >= 0) return;
    L.x = cx;
    L.z = cz;
    L.at = clock.elapsedTime;
    const r2 = nearRadius * nearRadius;
    const am = a.instanceMatrix.array as Float32Array, bm = b.instanceMatrix.array as Float32Array;
    const ac = a.instanceColor!.array as Float32Array, bc = b.instanceColor!.array as Float32Array;
    let na = 0, nb = 0;
    for (let i = 0; i < prep.n; i++) {
      const dx = prep.x[i] - cx, dz = prep.z[i] - cz;
      const m = prep.matrices.subarray(i * 16, i * 16 + 16), c = prep.colors.subarray(i * 3, i * 3 + 3);
      if (dx * dx + dz * dz < r2) {
        am.set(m, na * 16);
        ac.set(c, na * 3);
        na++;
      } else {
        bm.set(m, nb * 16);
        bc.set(c, nb * 3);
        nb++;
      }
    }
    a.count = na;
    b.count = nb;
    a.visible = na > 0;
    b.visible = nb > 0;
    a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
    a.instanceColor!.needsUpdate = b.instanceColor!.needsUpdate = true;
  });
  const shadow = species !== 'shrub';
  return (
    <group>
      <instancedMesh ref={near} args={[geoNear, material, prep.n]} castShadow={shadow} receiveShadow frustumCulled={false} />
      <instancedMesh ref={far} args={[geoFar, material, prep.n]} castShadow={shadow} receiveShadow frustumCulled={false} />
    </group>
  );
}

/** All the trees in `items`, grouped by species. `player`: dissolve leaves between the camera and the player. */
export function TreeField({ items, player = false, nearRadius = NEAR }: { items: TreeItem[]; player?: boolean; nearRadius?: number }) {
  const bySpecies = useMemo(() => {
    const m = new Map<TreeSpecies, TreeItem[]>();
    for (const it of items) (m.get(it.species) ?? m.set(it.species, []).get(it.species)!).push(it);
    return SPECIES.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [items]);
  useFrame(({ clock }) => {
    shared.uTime.value = clock.elapsedTime;
    if (!player) {
      shared.uFadeOn.value = 0;
      return;
    }
    const me = useWorld.getState().playerPos;
    shared.uFadeOn.value = me ? 1 : 0;
    if (me) shared.uFadeHead.value.set(me.x, 1.6, me.z);
  });
  return (
    <group>
      {bySpecies.map(([s, list]) => (
        <SpeciesField key={s} species={s} items={list} nearRadius={nearRadius} />
      ))}
    </group>
  );
}
