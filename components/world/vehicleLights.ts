import * as THREE from 'three';

// Vehicle lamps: one unlit material for every lamp on a vehicle, so headlights, tail lights, brake lights,
// indicators and lit signs cost a single draw call. Each lamp vertex says what it is (`lamp`); the shader picks its
// colour from that, the time of day, and the vehicle's state: braking, and which indicator is blinking.
// Instanced traffic carries that state per car in `lampState` (x = brake 0..1, y = indicator -1 left / 1 right);
// a single vehicle sets the `uBrake` / `uSignal` uniforms instead. Colours go past 1 so the bloom picks them up.

export const LAMP = { head: 0, tail: 1, left: 2, right: 3, sign: 4 } as const;
export type LampKind = (typeof LAMP)[keyof typeof LAMP];

/** Shared by every lamp material: how dark it is (0 day .. 1 night), and the indicator blink (0 / 1). */
export const LAMP_UNIFORMS = { uNight: { value: 0 }, uBlink: { value: 0 } };

/** Call once per frame from anything that draws lamps; cheap and idempotent. */
export function tickLamps(night: number) {
  LAMP_UNIFORMS.uNight.value = night;
  LAMP_UNIFORMS.uBlink.value = performance.now() % 760 < 380 ? 1 : 0;
}

/** 0 by day, 1 at night, from the world's sky (lib/world/sky.ts: 0 dawn .. 0.66 evening .. 1 night). */
export const nightOf = (skyT: number) => THREE.MathUtils.smoothstep(skyT, 0.62, 0.88);

export type LampMaterial = THREE.MeshBasicMaterial & { userData: { uBrake: { value: number }; uSignal: { value: number } } };

export function lampMaterial(instanced = false): LampMaterial {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false }) as LampMaterial;
  const own = { uBrake: { value: 0 }, uSignal: { value: 0 } };
  m.userData = own;
  m.customProgramCacheKey = () => (instanced ? 'vehicle-lamp-i' : 'vehicle-lamp');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LAMP_UNIFORMS, own);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float lamp;
attribute vec3 lampColor;
${instanced ? 'attribute vec2 lampState;' : ''}
uniform float uNight;
uniform float uBlink;
uniform float uBrake;
uniform float uSignal;
varying vec3 vLamp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec2 st = vec2(uBrake, uSignal)${instanced ? ' + lampState' : ''};
vec3 c;
if (lamp < 0.5) c = mix(vec3(0.95, 0.93, 0.85), vec3(3.4, 3.2, 2.5), uNight);
else if (lamp < 1.5) c = mix(vec3(0.42, 0.03, 0.04), vec3(1.4, 0.07, 0.09), uNight) + st.x * vec3(2.6, 0.1, 0.08);
else if (lamp < 3.5) {
  float side = lamp < 2.5 ? -1.0 : 1.0;
  float lit = step(0.5, st.y * side) * uBlink;
  c = mix(vec3(0.5, 0.25, 0.03), vec3(3.4, 1.5, 0.08), lit);
}
else c = lampColor * mix(1.15, 2.2, uNight);
vLamp = c;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLamp;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vLamp, opacity );');
  };
  return m;
}

/** A soft pool of headlight on the road ahead, for night driving. Laid flat, starting at the bumper, running +z. */
let beamTex: THREE.Texture | null = null;
export function beamMaterial() {
  if (!beamTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 10, 2, 32, 40, 80);
    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
    grad.addColorStop(0.5, 'rgba(255,230,180,0.35)');
    grad.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
    beamTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** The beam quad: 1 wide, 1 long, from z = 0 to z = 1, lying on the ground. Scale it per vehicle. */
let beamGeo: THREE.BufferGeometry | null = null;
export function beamGeometry() {
  if (!beamGeo) {
    beamGeo = new THREE.PlaneGeometry(1, 1);
    beamGeo.rotateX(-Math.PI / 2);
    // texture top (v = 1) at the bumper
    beamGeo.rotateY(Math.PI);
    beamGeo.translate(0, 0, 0.5);
  }
  return beamGeo;
}
