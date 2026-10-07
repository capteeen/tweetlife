'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { skyColors } from '@/lib/world/sky';

// Sky by account age: a gradient dome. t=0 dawn -> 0.33 noon -> 0.66 evening -> 1 night.


const vert = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const frag = `uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vWorld;
void main(){ float h = normalize(vWorld).y; float f = smoothstep(-0.05, 0.6, h); gl_FragColor = vec4(mix(uHorizon, uZenith, f), 1.0); }`;

export function Sky({ t, radius }: { t: number; radius: number }) {
  const { horizon, zenith } = useMemo(() => skyColors(t), [t]);
  const uniforms = useMemo(() => ({ uHorizon: { value: horizon }, uZenith: { value: zenith } }), [horizon, zenith]);
  return (
    <mesh scale={[radius, radius, radius]} frustumCulled={false}>
      <sphereGeometry args={[1, 24, 12]} />
      <shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms} vertexShader={vert} fragmentShader={frag} fog={false} />
    </mesh>
  );
}
