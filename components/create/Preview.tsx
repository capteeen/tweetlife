'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { Figure } from '@/components/world/Figure';
import type { Look } from '@/lib/life/look';

// The creator's live preview: the same figure the world draws, on a turntable. The camera moves in on the
// head while skin, face or hair is being picked, and down to the feet for shoes.

const SHOTS = {
  body: { pos: new THREE.Vector3(0, 1.25, 3.6), target: new THREE.Vector3(0, 0.95, 0) },
  head: { pos: new THREE.Vector3(0, 1.62, 1.9), target: new THREE.Vector3(0, 1.48, 0) },
  feet: { pos: new THREE.Vector3(0, 0.95, 2.7), target: new THREE.Vector3(0, 0.42, 0) },
};

function Rig({ focus }: { focus: keyof typeof SHOTS }) {
  const controls = useRef<OrbitImpl>(null);
  const last = useRef(focus);
  const moving = useRef(1);
  useFrame(({ camera }, dt) => {
    if (last.current !== focus) {
      last.current = focus;
      moving.current = 1;
    }
    const c = controls.current;
    if (!c) return;
    if (moving.current > 0) {
      // ease toward the shot, keeping whatever angle the player has turned to
      const shot = SHOTS[focus];
      const k = 1 - Math.pow(0.002, dt);
      c.target.lerp(shot.target, k);
      const dir = camera.position.clone().sub(c.target).setY(0).normalize();
      const flat = Math.hypot(shot.pos.x - shot.target.x, shot.pos.z - shot.target.z);
      const want = shot.target.clone().add(dir.multiplyScalar(flat)).setY(shot.pos.y);
      camera.position.lerp(want, k);
      moving.current -= dt * 0.9;
    }
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={false}
      minPolarAngle={Math.PI * 0.3}
      maxPolarAngle={Math.PI * 0.55}
      autoRotate
      autoRotateSpeed={0.6}
      enableDamping
    />
  );
}

/** A soft warm light from just above the camera, so faces on darker skin tones read from every turntable angle. */
function CameraFill() {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    const l = light.current;
    if (!l) return;
    l.position.copy(camera.position).add(FILL_LIFT);
    l.target.position.set(0, 1.2, 0);
    l.target.updateMatrixWorld();
  });
  return <directionalLight ref={light} intensity={1.6} color="#FFF1E2" />;
}
const FILL_LIFT = new THREE.Vector3(0, 0.6, 0);

export function Preview({ look, focus }: { look: Look; focus: keyof typeof SHOTS }) {
  const speed = useRef(0);
  return (
    <Canvas shadows camera={{ position: SHOTS.body.pos.toArray(), fov: 35 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
      <hemisphereLight args={['#dfe9ff', '#3a2f2a', 1.05]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#9fc4ff" />
      <CameraFill />
      <Figure seed="preview" look={look} speedRef={speed} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[0.9, 48]} />
        <meshStandardMaterial color="#1F2A44" roughness={0.9} />
      </mesh>
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={3} blur={2.4} far={2} />
      <Rig focus={focus} />
    </Canvas>
  );
}
