'use client';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, ContactShadows, Preload } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { WorldGeometry } from '@/lib/world/geometry';
import type { MarkModel } from '@/lib/world/load';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { Sky } from './Sky';
import { skyColors, sunFor } from '@/lib/world/sky';
import { City } from './City';
import { Cars } from './Cars';
import { Venues } from './Venues';
import { Structures } from './Structures';
import { Player } from './Player';
import { Marks } from './Marks';
import { Peers, Residents } from './Residents';
import { useWorld } from './store';

// The scene. `mode`:
//  - 'walk'     : admitted visitor, third-person controls
//  - 'boundary' : outside view, slow orbit around the skyline, no walking
//  - 'still'    : no motion (OG / timelapse frames)

export type SceneProps = {
  geometry: WorldGeometry;
  marks: MarkModel[];
  paths: { x: number; z: number }[][];
  biome: string;
  handle: string;
  showMetrics: boolean;
  mode: 'walk' | 'boundary' | 'still';
  spawn?: { x: number; z: number; rot: number; depth: number } | null;
  /** for still frames: camera placement */
  still?: { x: number; y: number; z: number; lookAt?: [number, number, number] };
  onReady?: () => void;
};

export function WorldCanvas(props: SceneProps) {
  const { geometry, biome } = props;
  const pal = PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'];
  const { horizon } = useMemo(() => skyColors(geometry.skyT), [geometry.skyT]);
  const fogColor = useMemo(() => horizon.clone().lerp(new THREE.Color(pal.fog), 0.5), [horizon, pal.fog]);
  const R = geometry.boundaryRadius;
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: props.mode === 'still' }}
      camera={{ fov: 50, near: 0.3, far: R * 6 + 400, position: [R * 0.9, R * 0.35, R * 0.9] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.18;
      }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => useWorld.getState().select(null)}
    >
      <color attach="background" args={[fogColor]} />
      <fog attach="fog" args={[fogColor, R * 0.9, R * 2.6]} />
      <Suspense fallback={null}>
        <Scene {...props} />
        <Preload all />
      </Suspense>
      <AdaptiveDpr pixelated />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}

function Scene(props: SceneProps) {
  const { geometry, marks, paths, biome, handle, showMetrics, mode, spawn, still, onReady } = props;
  const sun = useMemo(() => sunFor(geometry.skyT), [geometry.skyT]);
  const R = geometry.boundaryRadius;
  const called = useRef(false);
  useFrame(() => {
    if (!called.current && onReady) {
      called.current = true;
      onReady();
    }
  });
  const sunPos: [number, number, number] = [R * 0.55, R * sun.elevation, -R * 0.6];
  return (
    <>
      <Sky t={geometry.skyT} radius={R * 5 + 300} />
      <hemisphereLight args={['#DCE8F5', '#6B6A5A', 1.15]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={sunPos}
        intensity={sun.intensity}
        color={sun.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-camera-near={1}
        shadow-camera-far={R * 4}
      />
      <City blocks={geometry.blocks} grid={geometry.grid} outside={geometry.outside} boundaryRadius={R} biome={biome} handle={handle} paths={paths} />
      <Cars count={geometry.cars} grid={geometry.grid} handle={handle} />
      {geometry.structures.length > 0 && <Venues contentRadius={geometry.contentRadius} interactive={mode === 'walk'} />}
      <Structures structures={geometry.structures} showMetrics={showMetrics} interactive={mode === 'walk'} />
      {/* ambient-occlusion stand-in: one baked contact shadow pass under everything */}
      <ContactShadows frames={1} position={[0, 0.3, 0]} scale={geometry.contentRadius * 2.1 + 20} blur={2} opacity={0.4} far={14} resolution={1024} />
      <Marks marks={marks} />
      <Residents count={geometry.residents} radius={geometry.contentRadius + 20} handle={handle} />
      {mode === 'walk' && (
        <>
          <Player structures={geometry.structures} boundaryRadius={R} contentRadius={geometry.contentRadius} spawn={spawn ?? null} />
          <Peers />
        </>
      )}
      {mode === 'boundary' && <BoundaryOrbit radius={R} landmark={geometry.structures.find((s) => s.isLandmark) ?? null} />}
      {mode === 'still' && still && <StillCamera {...still} />}
    </>
  );
}

/** Outside the boundary: a slow orbit that keeps the landmark on the horizon. This is the conversion surface. */
function BoundaryOrbit({ radius, landmark }: { radius: number; landmark: { x: number; z: number; height: number } | null }) {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.045;
    const d = radius * 1.1;
    camera.position.set(Math.cos(t) * d, radius * 0.75, Math.sin(t) * d);
    const lx = landmark ? landmark.x * 0.3 : 0, lz = landmark ? landmark.z * 0.3 : 0;
    camera.lookAt(lx, 0, lz);
  });
  return null;
}

function StillCamera({ x, y, z, lookAt }: { x: number; y: number; z: number; lookAt?: [number, number, number] }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(x, y, z);
    camera.lookAt(...(lookAt ?? [0, 2, 0]));
  });
  return null;
}
