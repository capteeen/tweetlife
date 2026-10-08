'use client';
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Turns its children about the vertical axis to face the camera, so a sign stays upright and readable from any side.
 * (drei's Billboard with lockX/lockZ zeroes the other two Euler angles of a full billboard rotation, which flips the
 * sign 180 degrees whenever the camera looks down from behind it.)
 */
export function FaceCamera({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const o = g.current;
    if (!o?.parent) return;
    o.parent.getWorldPosition(tmpA);
    o.parent.getWorldQuaternion(tmpQ);
    // camera direction in world space, as a yaw, minus the parent's own yaw
    const parentYaw = tmpE.setFromQuaternion(tmpQ, 'YXZ').y;
    o.rotation.y = Math.atan2(camera.position.x - tmpA.x, camera.position.z - tmpA.z) - parentYaw;
  });
  return (
    <group ref={g} position={position}>
      {children}
    </group>
  );
}
const tmpA = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
