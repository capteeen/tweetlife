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
import { CityExtras } from './CityExtras';
import { Structures } from './Structures';
import { Player } from './Player';
import { Marks } from './Marks';
import { Peers, Residents } from './Residents';
import { CityResidents } from './CityResidents';
import { BalloonFeed } from './Balloons';
import { Crowds } from './Crowd';
import { AirportStand } from './AirportStand';
import { Terminal } from './Terminal';
import { GuideBeacon } from './GuideBeacon';
import { useWorld } from './store';
import { themeOf, themedPalette } from '@/lib/world/cityThemes';
import { WorldSounds } from '@/components/audio/WorldSounds';
import { PlotSigns } from './PlotSigns';

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

// Touch-first devices get a lower pixel-ratio cap and a smaller shadow map: phones fill far fewer pixels per frame.
const PHONE = typeof window !== 'undefined' && !!window.matchMedia?.('(any-pointer: coarse)').matches;

export function WorldCanvas(props: SceneProps) {
  const { geometry, biome } = props;
  const country = useWorld((s) => s.country);
  const pal = themedPalette(PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'], country);
  const sky = themeOf(country).sky;
  const { horizon } = useMemo(() => skyColors(geometry.skyT), [geometry.skyT]);
  const fogColor = useMemo(() => horizon.clone().lerp(new THREE.Color(sky.horizon), sky.amount).lerp(new THREE.Color(pal.fog), 0.5), [horizon, pal.fog, sky]);
  const R = geometry.boundaryRadius;
  return (
    <Canvas
      shadows="soft"
      dpr={[1, PHONE ? 1.5 : 1.75]}
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
      <fog attach="fog" args={[fogColor, R * 0.9 + 40, R * 2.6 + 140]} />
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
  const theme = themeOf(useWorld((s) => s.country));
  const R = geometry.boundaryRadius;
  const called = useRef(false);
  useFrame(() => {
    if (!called.current && onReady) {
      called.current = true;
      onReady();
    }
  });
  const sunPos: [number, number, number] = [R * 0.55, R * sun.elevation, -R * 0.6];
  // how far into the night the sky is: dims the fill light, turns the street lights on, brightens lit windows
  const dark = THREE.MathUtils.smoothstep(geometry.skyT, 0.7, 0.92);
  const night = dark > 0.3;
  return (
    <>
      <Sky t={geometry.skyT} radius={R * 5 + 300} tint={theme.sky} />
      <hemisphereLight key={theme.country} args={[dark > 0 ? new THREE.Color(theme.light).lerp(new THREE.Color('#8FA3C8'), dark) : theme.light, '#6B6A5A', 1.15 * (1 - 0.45 * dark)]} />
      <ambientLight intensity={0.25 * (1 - 0.4 * dark)} />
      <directionalLight
        position={sunPos}
        intensity={sun.intensity}
        color={sun.color}
        castShadow
        shadow-mapSize={PHONE ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-camera-near={1}
        shadow-camera-far={R * 4}
      />
      <City blocks={geometry.blocks} grid={geometry.grid} outside={geometry.outside} boundaryRadius={R} biome={biome} handle={handle} paths={paths} structures={geometry.structures} player={mode === 'walk'} night={night} />
      <CityExtras
        contentRadius={geometry.contentRadius}
        boundaryRadius={R}
        blocks={geometry.blocks}
        grid={geometry.grid}
        hasCity={geometry.structures.length > 0}
        biome={biome}
        handle={handle}
        structures={geometry.structures}
        player={mode === 'walk'}
      />
      {geometry.structures.length > 0 && <Terminal contentRadius={geometry.contentRadius} boundaryRadius={R} />}
      <Cars count={geometry.cars} grid={geometry.grid} handle={handle} player={mode === 'walk'} />
      {geometry.structures.length > 0 && <Venues contentRadius={geometry.contentRadius} boundaryRadius={R} interactive={mode === 'walk'} />}
      <Structures structures={geometry.structures} showMetrics={showMetrics} interactive={mode === 'walk'} night={night} />
      {/* ambient-occlusion stand-in: one baked contact shadow pass under everything */}
      <ContactShadows frames={1} position={[0, 0.3, 0]} scale={geometry.contentRadius * 2.1 + 20} blur={2} opacity={0.4} far={14} resolution={1024} />
      <Marks marks={marks} />
      <Residents count={geometry.residents} radius={geometry.contentRadius + 20} handle={handle} blocks={geometry.blocks} grid={geometry.grid} boundaryRadius={R} />
      {geometry.structures.length > 0 && (
        <CityResidents contentRadius={geometry.contentRadius} boundaryRadius={R} blocks={geometry.blocks} grid={geometry.grid} interactive={mode === 'walk'} />
      )}
      {mode === 'walk' && (
        <>
          <Player structures={geometry.structures} blocks={geometry.blocks} grid={geometry.grid} boundaryRadius={R} contentRadius={geometry.contentRadius} spawn={spawn ?? null} />
          <Peers blocks={geometry.blocks} grid={geometry.grid} boundaryRadius={R} />
          <Crowds blocks={geometry.blocks} grid={geometry.grid} boundaryRadius={R} />
          <BalloonFeed />
          <WorldSounds geometry={geometry} />
          {geometry.structures.length > 0 && <AirportStand contentRadius={geometry.contentRadius} boundaryRadius={R} />}
          <GuideBeacon />
          <PlotSigns />
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
