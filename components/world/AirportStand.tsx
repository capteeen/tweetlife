'use client';
import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useWorld } from './store';
import { airportLayout } from '@/lib/world/layout';
import { JET_ITEM } from '@/lib/life/flights';
import { standOf } from '@/components/life/flight';
import { Plane } from './Plane';

const FONT = '/fonts/inter-600.woff';

// The stand on the apron. While you board, your flight's plane waits here. If you own a plane, it is parked
// here the rest of the time: your spot, painted with your name, a sign on a post and a red carpet out to it.
export function AirportStand({ contentRadius, boundaryRadius }: { contentRadius: number; boundaryRadius: number }) {
  const handle = useWorld((s) => s.life?.me?.handle ?? null);
  const ownsPlane = useWorld((s) => !!s.life?.assets?.some((a) => a.id === JET_ITEM));
  const flight = useWorld((s) => s.flight);
  const tripMode = useWorld((s) => s.trip?.mode);
  const stand = useMemo(() => standOf(airportLayout(contentRadius, boundaryRadius)), [contentRadius, boundaryRadius]);
  const boarding = flight?.phase === 'boarding';
  // the plane leaves the stand once it is moving (it becomes your ride) and is back after you land
  const away = !!flight && !boarding;
  const kind = boarding ? (flight.cabin === 'jet' ? 'jet' : 'airliner') : 'jet';
  const showPlane = (boarding || (ownsPlane && !away)) && tripMode !== 'jet' && tripMode !== 'airliner';
  return (
    <group position={[stand.x, 0.11, stand.z]}>
      {showPlane && (
        <group rotation={[0, Math.PI / 2, 0]}>
          <Plane kind={kind} country={boarding && kind === 'airliner' ? flight.to : undefined} />
        </group>
      )}
      {ownsPlane && handle && (
        <>
          {/* your spot: a painted box and your name on the ground */}
          {[
            [0, 7, 16, 0.25],
            [0, -7, 16, 0.25],
            [-8, 0, 0.25, 14],
            [8, 0, 0.25, 14],
          ].map(([x, z, w, d], i) => (
            <mesh key={i} position={[x, 0.01, z]}>
              <boxGeometry args={[w, 0.02, d]} />
              <meshStandardMaterial color="#F4C430" />
            </mesh>
          ))}
          <Text font={FONT} position={[-5.5, 0.04, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color="#F4C430" anchorX="center" anchorY="middle">
            {`PRIVATE · @${handle}`}
          </Text>
          {/* the sign on a post at the front of the spot */}
          <mesh position={[-8.6, 1.2, 5.5]}>
            <boxGeometry args={[0.12, 2.4, 0.12]} />
            <meshStandardMaterial color="#9AA3AD" />
          </mesh>
          <mesh position={[-8.6, 2.6, 5.5]}>
            <boxGeometry args={[0.1, 0.9, 3.2]} />
            <meshStandardMaterial color="#0B0F17" />
          </mesh>
          <Text font={FONT} position={[-8.66, 2.6, 5.5]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.32} color="#F4C430" anchorX="center" anchorY="middle" maxWidth={3}>
            {`@${handle}'s plane`}
          </Text>
          {/* the carpet from the spot's edge to the stairs */}
          <mesh position={[-4.5, 0.02, -1.3]}>
            <boxGeometry args={[7, 0.03, 0.9]} />
            <meshStandardMaterial color="#B3122E" roughness={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
}
