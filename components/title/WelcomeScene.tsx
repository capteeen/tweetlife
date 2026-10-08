'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, RoundedBox } from '@react-three/drei';
import { Figure } from '@/components/world/Figure';
import { CAR_PARTS, carMaterial, carParts, type CarModel } from '@/components/world/carModels';
import { prng } from '@/lib/world/seed';

// The welcome page's backdrop: a little city on a floating speech-bubble island, in the brand style (white
// bubble-buildings with glowing yellow windows on sky blue). People walk the ring with gold coin balloons,
// traffic loops, likes and coins float up off the roofs, clouds and birds drift past, and the camera slowly
// circles. Everything is generated here (no models or textures to download), so it costs a few dozen draw calls.

const SKY_BLUE = '#3BA9F5';
const WHITE = '#F8FAFD';
const WINDOW = '#FFD54A';
const WINDOW_OFF = '#CFE3F6';
const GOLD = '#FFC83D';
const GRASS = '#7DD36F';
const ROAD = '#5D6676';
const ISLAND_R = 15;
const ROAD_IN = 10.1;
const ROAD_OUT = 12.1;
const WALK_R = 9.6;

type B = { x: number; z: number; w: number; d: number; h: number; antenna?: boolean };
const BUILDINGS: B[] = [
  { x: 0, z: 0, w: 3.4, d: 3.4, h: 9, antenna: true },
  { x: -4.4, z: -1.2, w: 2.8, d: 2.6, h: 5.6 },
  { x: 4.2, z: -1.8, w: 3, d: 2.6, h: 6.6, antenna: true },
  { x: -1.6, z: 4.6, w: 2.8, d: 2.4, h: 4.2 },
  { x: 2.9, z: 3.9, w: 2.6, d: 2.6, h: 5 },
  { x: -5.3, z: 3.4, w: 2.2, d: 2.2, h: 3.2 },
  { x: 6, z: 2.4, w: 2.2, d: 2.4, h: 3.8 },
  { x: -2.6, z: -5.4, w: 2.6, d: 2.2, h: 4.8, antenna: true },
  { x: 2.6, z: -5.8, w: 2.4, d: 2.2, h: 3.4 },
  { x: -6.6, z: -3.6, w: 1.8, d: 1.8, h: 2.6 },
];
// each building faces out from the middle, so its door and tail are seen as the camera circles
const facing = (b: B) => Math.atan2(b.x, b.z || 0.001);

export function WelcomeScene({ paused, onReady, reducedMotion }: { paused: boolean; onReady: () => void; reducedMotion: boolean }) {
  return (
    <Canvas
      flat
      shadows
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 35, near: 1, far: 400, position: [0, 18, 40] }}
      onCreated={() => requestAnimationFrame(() => requestAnimationFrame(onReady))}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <hemisphereLight args={['#EAF6FF', '#9CCB8E', 1.9]} />
      <directionalLight
        position={[14, 26, 10]}
        intensity={1.9}
        color="#FFF6E4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0008}
      />
      <CameraRig reducedMotion={reducedMotion} />
      <group position={[0, -2, 0]}>
        <Island />
        <Road />
        {BUILDINGS.map((b, i) => (
          <BubbleBuilding key={i} b={b} />
        ))}
        <Windows />
        <Trees />
        <Traffic />
        <Walkers />
        <Floaters />
      </group>
      <Clouds />
      <Birds />
    </Canvas>
  );
}

// The canvas takes no pointer events (so the page scrolls over it on phones); the camera leans toward the
// mouse from a window listener instead.
const pointer = { x: 0, y: 0 };

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, []);
  const cam = camera as THREE.PerspectiveCamera;
  const look = useMemo(() => new THREE.Vector3(), []);
  const smooth = useRef({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    cam.fov = aspect < 0.9 ? 48 : 34;
    // desktop: the city sits to the right of the headline; phone: centred, a little low, between headline and buttons
    if (aspect >= 1.15) cam.setViewOffset(size.width, size.height, -size.width * 0.23, 0, size.width, size.height);
    else cam.setViewOffset(size.width, size.height, 0, -size.height * 0.02, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [cam, size.width, size.height]);
  useFrame(({ clock }) => {
    const aspect = size.width / size.height;
    const t = clock.elapsedTime;
    smooth.current.x += (pointer.x - smooth.current.x) * 0.04;
    smooth.current.y += (pointer.y - smooth.current.y) * 0.04;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // keep about 30 units of the island across the screen on desktop, about 21 on a phone
    const fit = aspect >= 1.15 ? 56 : aspect >= 0.9 ? 56 : 11.5 / (tanHalf * aspect);
    const a = 0.6 + t * (reducedMotion ? 0 : 0.045) + smooth.current.x * 0.12;
    const elev = 0.5 + smooth.current.y * 0.04;
    cam.position.set(Math.sin(a) * fit * Math.cos(elev), fit * Math.sin(elev), Math.cos(a) * fit * Math.cos(elev));
    look.set(0, aspect >= 0.9 ? -0.6 : 0.4, 0);
    cam.lookAt(look);
  });
  return null;
}

/** A speech bubble outline: a circle with a tail, in the XY plane. */
function bubbleShape(r: number, tailAt: number, tailLen: number) {
  const s = new THREE.Shape();
  const gap = 0.32;
  s.absarc(0, 0, r, tailAt + gap, tailAt - gap + Math.PI * 2, false);
  const tip = new THREE.Vector2(Math.cos(tailAt - 0.12) * (r + tailLen), Math.sin(tailAt - 0.12) * (r + tailLen));
  s.lineTo(tip.x, tip.y);
  s.closePath();
  return s;
}

function Island() {
  const base = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(bubbleShape(ISLAND_R, -0.75, 4.2), { depth: 2.4, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.7, bevelSegments: 4, curveSegments: 64 });
    g.rotateX(Math.PI / 2); // shape XY -> XZ, extruded downward
    g.translate(0, -0.7, 0);
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={base} receiveShadow>
        <meshStandardMaterial color={WHITE} roughness={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[ISLAND_R - 0.6, 64]} />
        <meshStandardMaterial color={GRASS} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Road() {
  const dashes = useRef<THREE.InstancedMesh>(null);
  const N = 44;
  useLayoutEffect(() => {
    const m = dashes.current!;
    const o = new THREE.Object3D();
    const r = (ROAD_IN + ROAD_OUT) / 2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      o.position.set(Math.sin(a) * r, 0.04, Math.cos(a) * r);
      o.rotation.set(0, a + Math.PI / 2, 0); // along the road
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <ringGeometry args={[ROAD_IN, ROAD_OUT, 96]} />
        <meshStandardMaterial color={ROAD} roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.025} receiveShadow>
        <ringGeometry args={[WALK_R - 0.6, ROAD_IN, 96]} />
        <meshStandardMaterial color="#EEF1F5" roughness={0.9} />
      </mesh>
      <instancedMesh ref={dashes} args={[undefined, undefined, N]}>
        <boxGeometry args={[0.12, 0.02, 0.7]} />
        <meshBasicMaterial color="#FFFFFF" />
      </instancedMesh>
    </group>
  );
}

const tailGeo = (() => {
  let g: THREE.ExtrudeGeometry | null = null;
  return () => {
    if (g) return g;
    const s = new THREE.Shape();
    s.moveTo(0, 1.1);
    s.lineTo(1.0, 1.1);
    s.lineTo(-0.55, 0);
    s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 });
    g.translate(0, 0, -0.25);
    return g;
  };
})();

function BubbleBuilding({ b }: { b: B }) {
  const rot = facing(b);
  return (
    <group position={[b.x, 0, b.z]} rotation-y={rot}>
      <RoundedBox args={[b.w, b.h, b.d]} radius={Math.min(0.55, b.w * 0.2)} smoothness={3} position-y={b.h / 2 + 0.25} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} roughness={0.45} emissive="#DCEBFA" emissiveIntensity={0.35} />
      </RoundedBox>
      {/* the speech-bubble tail at the bottom left, like the logo */}
      <mesh geometry={tailGeo()} position={[-b.w / 2 + 0.25, 0.02, b.d / 2 - 0.45]} castShadow>
        <meshStandardMaterial color={WHITE} roughness={0.45} emissive="#DCEBFA" emissiveIntensity={0.35} />
      </mesh>
      {/* the little door */}
      <RoundedBox args={[0.7, 1.15, 0.2]} radius={0.08} smoothness={2} position={[0.25, 0.8, b.d / 2]}>
        <meshStandardMaterial color="#F4A62A" roughness={0.5} />
      </RoundedBox>
      {b.antenna && (
        <group position-y={b.h + 0.25}>
          <mesh position-y={0.5}>
            <cylinderGeometry args={[0.05, 0.07, 1, 6]} />
            <meshStandardMaterial color="#DDE4EC" />
          </mesh>
          <mesh position-y={1.1}>
            <sphereGeometry args={[0.2, 14, 10]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.35} metalness={0.3} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Every window of every building in one instanced mesh; most glow, a few are dark. */
function Windows() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => {
    const out: { m: THREE.Matrix4; on: boolean }[] = [];
    const rnd = prng(7);
    const o = new THREE.Object3D();
    const parent = new THREE.Object3D();
    for (const b of BUILDINGS) {
      parent.position.set(b.x, 0, b.z);
      parent.rotation.set(0, facing(b), 0);
      parent.updateMatrix();
      const rows = Math.max(1, Math.floor((b.h - 1.9) / 0.95));
      for (let face = 0; face < 4; face++) {
        const span = face % 2 === 0 ? b.w : b.d;
        const depth = face % 2 === 0 ? b.d : b.w;
        const cols = Math.max(1, Math.floor((span - 0.7) / 0.72));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const u = (c - (cols - 1) / 2) * 0.72;
            const y = 1.95 + r * 0.95;
            if (face === 0 && r === 0 && Math.abs(u - 0.25) < 0.6) continue; // above the door
            const off = depth / 2 + 0.01;
            const a = (face * Math.PI) / 2;
            o.position.set(Math.cos(a) * u + Math.sin(a) * off, y, -Math.sin(a) * u + Math.cos(a) * off);
            o.rotation.set(0, a, 0);
            o.updateMatrix();
            out.push({ m: parent.matrix.clone().multiply(o.matrix), on: rnd() > 0.18 });
          }
        }
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const c = new THREE.Color();
    list.forEach((w, i) => {
      m.setMatrixAt(i, w.m);
      m.setColorAt(i, c.set(w.on ? WINDOW : WINDOW_OFF));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [list]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <boxGeometry args={[0.44, 0.56, 0.08]} />
      <meshBasicMaterial color="#FFFFFF" />
    </instancedMesh>
  );
}

function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const rnd = prng(42);
    const out: { x: number; z: number; s: number; tint: number }[] = [];
    // a ring outside the road (leaving the tail clear) and a few between the buildings
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rnd() * 0.12;
      const r = 13.1 + rnd() * 0.9;
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 0.75 + rnd() * 0.45, tint: rnd() });
    }
    for (const [x, z] of [[-2.2, 1.6], [1.8, -2.6], [5.4, -3.8], [-6.4, 0.9], [0.4, 6.8], [-4.4, 6.1], [6.8, -0.3], [-0.2, -7.6], [4.6, 5.9]]) {
      out.push({ x, z, s: 0.6 + rnd() * 0.3, tint: rnd() });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((t, i) => {
      o.position.set(t.x, 0.45 * t.s, t.z);
      o.scale.setScalar(t.s);
      o.rotation.set(0, t.tint * 6, 0);
      o.updateMatrix();
      trunks.current!.setMatrixAt(i, o.matrix);
      o.position.set(t.x, 1.35 * t.s, t.z);
      o.updateMatrix();
      crowns.current!.setMatrixAt(i, o.matrix);
      crowns.current!.setColorAt(i, c.set(t.tint < 0.33 ? '#3FAE4F' : t.tint < 0.66 ? '#4CC25A' : '#62CF5E'));
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
    if (crowns.current!.instanceColor) crowns.current!.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.9, 6]} />
        <meshStandardMaterial color="#9A6B43" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} castShadow>
        <icosahedronGeometry args={[0.75, 1]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  );
}

const CARS: { model: CarModel; paint: string; lane: 0 | 1; at: number; speed: number }[] = [
  { model: 'taxi', paint: '#FFC83D', lane: 0, at: 0, speed: 0.16 },
  { model: 'bus', paint: '#2F7FE0', lane: 1, at: 1.2, speed: 0.11 },
  { model: 'hatch', paint: '#FF6B6B', lane: 0, at: 2.5, speed: 0.15 },
  { model: 'sedan', paint: '#FFFFFF', lane: 1, at: 3.9, speed: 0.14 },
  { model: 'sport', paint: '#7C5CFF', lane: 0, at: 4.6, speed: 0.19 },
  { model: 'van', paint: '#35C28A', lane: 1, at: 5.6, speed: 0.12 },
];

function Car({ model, paint }: { model: CarModel; paint: string }) {
  const parts = useMemo(() => carParts(model), [model]);
  const mats = useMemo(() => Object.fromEntries(CAR_PARTS.map((p) => [p, carMaterial(p, paint)])), [paint]);
  return (
    <group>
      {CAR_PARTS.map((p) => (parts[p] ? <mesh key={p} geometry={parts[p]!} material={mats[p]} castShadow={p === 'paint'} /> : null))}
    </group>
  );
}

function Traffic() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    CARS.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const dir = c.lane === 0 ? 1 : -1;
      const r = c.lane === 0 ? ROAD_IN + 0.5 : ROAD_OUT - 0.5;
      const a = c.at + dir * t * c.speed;
      g.position.set(Math.sin(a) * r, 0.03, Math.cos(a) * r);
      // forward is +z in the car's own space: point it along the tangent
      g.rotation.y = a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  });
  return (
    <group>
      {CARS.map((c, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)} scale={0.85}>
          <Car model={c.model} paint={c.paint} />
        </group>
      ))}
    </group>
  );
}

/** A gold coin on a string, tied to a walker's hand. */
function CoinBalloon({ sway }: { sway: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + sway;
    if (ref.current) {
      ref.current.rotation.z = Math.sin(t * 1.3) * 0.08;
      ref.current.rotation.x = Math.cos(t * 1.1) * 0.06;
    }
  });
  return (
    <group position={[0.27, 0.78, 0.04]} ref={ref}>
      <mesh position-y={0.6}>
        <cylinderGeometry args={[0.006, 0.006, 1.2, 3]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <Billboard position={[0, 1.42, 0]}>
        <Coin />
      </Billboard>
    </group>
  );
}

function Coin({ position, scale = 1 }: { position?: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.32, 0.32, 0.09, 24]} />
        <meshStandardMaterial color={GOLD} emissive="#FFB300" emissiveIntensity={0.35} metalness={0.35} roughness={0.3} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.22, 0.025, 6, 24]} />
        <meshStandardMaterial color="#F2A100" metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

const WALKERS = [
  { seed: 'ape_ade', at: 0.3, speed: 0.07, balloon: true },
  { seed: 'gm.kemi', at: 1.4, speed: -0.06, balloon: true },
  { seed: 'degenqueen', at: 2.3, speed: 0.065, balloon: false },
  { seed: 'wagmi_tunde', at: 3.3, speed: -0.075, balloon: true },
  { seed: 'chioma.sol', at: 4.4, speed: 0.06, balloon: true },
  { seed: 'bags_bayo', at: 5.4, speed: -0.07, balloon: false },
];

function Walkers() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    WALKERS.forEach((w, i) => {
      const g = refs.current[i];
      if (!g) return;
      const r = WALK_R - 0.25 + (w.speed > 0 ? 0 : 0.5);
      const a = w.at + (t * w.speed * 1.0) / (r / 10);
      g.position.set(Math.sin(a) * r, 0.03, Math.cos(a) * r);
      g.rotation.y = a + (w.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  });
  return (
    <group>
      {WALKERS.map((w, i) => (
        <group key={w.seed} ref={(el) => void (refs.current[i] = el)} scale={1.25}>
          <Figure seed={w.seed} alwaysWalk />
          {w.balloon && <CoinBalloon sway={i * 1.7} />}
        </group>
      ))}
    </group>
  );
}

const heartGeo = (() => {
  let g: THREE.ExtrudeGeometry | null = null;
  return () => {
    if (g) return g;
    const s = new THREE.Shape();
    s.moveTo(0, -0.35);
    s.bezierCurveTo(-0.05, -0.28, -0.42, -0.05, -0.42, 0.14);
    s.bezierCurveTo(-0.42, 0.34, -0.2, 0.42, 0, 0.24);
    s.bezierCurveTo(0.2, 0.42, 0.42, 0.34, 0.42, 0.14);
    s.bezierCurveTo(0.42, -0.05, 0.05, -0.28, 0, -0.35);
    g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -0.06);
    return g;
  };
})();

/** Likes and coins drifting up off the rooftops, on a loop. */
function Floaters() {
  const items = useMemo(() => {
    const rnd = prng(9);
    return Array.from({ length: 8 }, (_, i) => {
      const b = BUILDINGS[(i * 3) % BUILDINGS.length];
      return { x: b.x + (rnd() - 0.5) * b.w * 0.6, z: b.z + (rnd() - 0.5) * b.d * 0.6, y0: b.h + 0.6, kind: i % 2 === 0 ? 'heart' : 'coin', offset: i * 1.37, period: 6 + rnd() * 3 };
    });
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    items.forEach((it, i) => {
      const g = refs.current[i];
      if (!g) return;
      const k = ((t + it.offset) % it.period) / it.period; // 0..1 through the rise
      g.position.set(it.x + Math.sin((t + i) * 1.4) * 0.25, it.y0 + k * 7, it.z);
      const pop = Math.min(1, k * 6) * (1 - Math.max(0, (k - 0.8) / 0.2));
      g.scale.setScalar(Math.max(0.001, pop) * (it.kind === 'heart' ? 1.1 : 1.4));
      g.quaternion.copy(camera.quaternion); // always face the camera
      if (it.kind === 'coin') g.rotateY(t * 3 + i);
    });
  });
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)}>
          {it.kind === 'heart' ? (
            <mesh geometry={heartGeo()}>
              <meshStandardMaterial color="#FF4F7B" emissive="#FF3D6E" emissiveIntensity={0.35} roughness={0.35} />
            </mesh>
          ) : (
            <Coin />
          )}
        </group>
      ))}
    </group>
  );
}

const cloudGeo = (() => {
  let g: THREE.SphereGeometry | null = null;
  return () => (g ??= new THREE.SphereGeometry(1, 18, 12));
})();

function Clouds() {
  const clouds = useMemo(() => {
    const rnd = prng(3);
    // far out, past the camera's circle, so they drift behind the island and never between it and the camera;
    // a few sit below it so the island reads as floating
    return Array.from({ length: 9 }, (_, i) => ({
      a: (i / 9) * Math.PI * 2 + rnd() * 0.4,
      r: 62 + rnd() * 18,
      y: i % 3 === 2 ? -16 - rnd() * 8 : 2 + rnd() * 16,
      s: 3.2 + rnd() * 2.4,
      puffs: Array.from({ length: 4 + Math.floor(rnd() * 3) }, (_, k) => [k * 1.1 - 1.8 + rnd() * 0.4, rnd() * 0.5, (rnd() - 0.5) * 0.9, 0.9 + rnd() * 0.7] as const),
    }));
  }, []);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.012;
  });
  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <group key={i} position={[Math.sin(c.a) * c.r, c.y, Math.cos(c.a) * c.r]} rotation-y={c.a} scale={c.s}>
          {c.puffs.map(([x, y, z, s], k) => (
            <mesh key={k} geometry={cloudGeo()} position={[x, y, z]} scale={[s, s * 0.8, s]}>
              <meshStandardMaterial color="#FFFFFF" roughness={1} emissive="#F2F8FF" emissiveIntensity={0.7} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** A few birds circling over the city. It is called Tweetlife. */
function Birds() {
  const birds = useMemo(() => [
    { r: 9, y: 10.5, speed: 0.32, at: 0 },
    { r: 10.5, y: 11.2, speed: 0.32, at: 0.35 },
    { r: 13, y: 9, speed: -0.26, at: 2.6 },
  ], []);
  const refs = useRef<{ g: THREE.Group | null; l: THREE.Mesh | null; r: THREE.Mesh | null }[]>(birds.map(() => ({ g: null, l: null, r: null })));
  const wing = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.18, 0.62, 0, -0.05], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    birds.forEach((b, i) => {
      const o = refs.current[i];
      if (!o.g) return;
      const a = b.at + t * b.speed;
      o.g.position.set(Math.sin(a) * b.r, b.y + Math.sin(t * 1.3 + i) * 0.4, Math.cos(a) * b.r);
      o.g.rotation.y = a + (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(t * 11 + i * 2) * 0.7;
      if (o.l) o.l.rotation.z = flap;
      if (o.r) o.r.rotation.z = -flap;
    });
  });
  return (
    <group>
      {birds.map((b, i) => (
        <group key={i} ref={(el) => void (refs.current[i].g = el)} scale={0.9}>
          <mesh scale={[0.16, 0.14, 0.34]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#1877D6" roughness={0.6} />
          </mesh>
          <mesh geometry={wing} ref={(el) => void (refs.current[i].l = el)} position={[0.08, 0.02, 0]}>
            <meshStandardMaterial color="#2F8FEA" side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={wing} ref={(el) => void (refs.current[i].r = el)} position={[-0.08, 0.02, 0]} scale={[-1, 1, 1]}>
            <meshStandardMaterial color="#2F8FEA" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.02, 0.36]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.05, 0.12, 6]} />
            <meshStandardMaterial color="#FFB703" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export { SKY_BLUE };
