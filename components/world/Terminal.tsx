'use client';
import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import type { ComponentProps } from 'react';
import * as THREE from 'three';
import { useWorld } from './store';
import { airportLayout, type Rect } from '@/lib/world/layout';
import { TERMINAL_FLOOR, terminalLayout, terminalWalls, type Terminal as T } from '@/lib/world/terminal';
import { COUNTRIES, COUNTRY_LIST } from '@/lib/world/countries';
import { CABINS, flightNumber } from '@/lib/life/flights';
import { themeOf } from '@/lib/world/cityThemes';

// The airport terminal you walk through: a glass hall with a glass roof (so the camera follows you in),
// check-in desks by the main doors, a security wall with a scanner arch, the gate lounge with Gate A2 and
// its board, and a separate arrivals hall with passport control and a baggage belt. Signs and colours
// follow the country you are in.

const FONT = '/fonts/inter-600.woff';
const H = 6.2; // outer walls
const PART_H = 2.6; // the security and arrivals walls inside
const FLOOR = TERMINAL_FLOOR;

export function Terminal({ contentRadius, boundaryRadius }: { contentRadius: number; boundaryRadius: number }) {
  const t = useMemo(() => terminalLayout(airportLayout(contentRadius, boundaryRadius)), [contentRadius, boundaryRadius]);
  const walls = useMemo(() => terminalWalls(t), [t]);
  const countryId = useWorld((s) => s.country);
  const c = COUNTRIES[countryId];
  const r = t.rect;
  const isPartition = (w: Rect) => Math.abs(w.z - t.securityZ) < 0.01 || Math.abs(w.z - t.arrivalsZ) < 0.01;
  const n = r.z + r.d / 2, s = r.z - r.d / 2;
  const mid = (a: [number, number]) => (a[0] + a[1]) / 2;

  return (
    <group>
      {/* floor */}
      <mesh position={[r.x, FLOOR / 2, r.z]} receiveShadow>
        <boxGeometry args={[r.w, FLOOR, r.d]} />
        <meshStandardMaterial color="#E9E6DF" roughness={0.55} />
      </mesh>
      {/* a coloured carpet runs the passenger route: doors, desks, arch, gate */}
      <mesh position={[r.x - 0.5, FLOOR + 0.005, (t.securityZ + s) / 2 + 2]} receiveShadow>
        <boxGeometry args={[1.6, 0.01, t.securityZ - s - 4]} />
        <meshStandardMaterial color={c.theme.primary} roughness={0.9} />
      </mesh>
      {/* walls: glass outside, solid low walls inside */}
      {walls.map((w, i) =>
        isPartition(w) ? (
          <mesh key={i} position={[w.x, FLOOR + PART_H / 2, w.z]} castShadow receiveShadow>
            <boxGeometry args={[w.w, PART_H, w.d]} />
            <meshStandardMaterial color="#F4F6F8" roughness={0.7} />
          </mesh>
        ) : (
          <mesh key={i} position={[w.x, H / 2, w.z]}>
            <boxGeometry args={[w.w, H, w.d]} />
            <meshStandardMaterial color="#CFE6F5" transparent opacity={0.16} roughness={0.05} metalness={0.2} depthWrite={false} />
          </mesh>
        ),
      )}
      <Mullions t={t} />
      {/* glass roof on a white frame */}
      <mesh position={[r.x, H + 0.05, r.z]}>
        <boxGeometry args={[r.w + 3, 0.1, r.d + 2]} />
        <meshStandardMaterial color="#BFE3FF" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[r.x + k * (r.w / 2 + 1.3), H + 0.2, r.z]} castShadow>
          <boxGeometry args={[0.4, 0.4, r.d + 2]} />
          <meshStandardMaterial color="#F4F6F8" roughness={0.6} />
        </mesh>
      ))}
      {/* the name on the landside facade, and the door signs */}
      <Sign x={t.west - 0.3} z={r.z} y={H - 0.9} size={1.15} color={c.theme.primary} text={(themeOf(countryId).venues.airport?.name ?? `${c.capital} International`).toUpperCase()} />
      <Sign x={t.west - 0.3} z={mid(t.doors.landside)} y={3.3} size={0.55} color="#1B2436" text="✈ DEPARTURES" />
      <Sign x={t.west - 0.3} z={mid(t.doors.arrivalsOut)} y={3.3} size={0.55} color="#1B2436" text="ARRIVALS" />
      <CheckIn t={t} color={c.theme.primary} />
      <Security t={t} />
      <Gate t={t} color={c.theme.primary} />
      <Arrivals t={t} capital={c.capital} color={c.theme.primary} accent={c.theme.accent} />
      <Board x={r.x} z={t.arrivalsZ - 0.25} rot={Math.PI} from={countryId} title="DEPARTURES" />
    </group>
  );
}

/** White posts along the glass, every few units. */
function Mullions({ t }: { t: T }) {
  const r = t.rect;
  const posts = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let z = r.z - r.d / 2; z <= r.z + r.d / 2 + 0.01; z += r.d / 12) out.push({ x: t.west, z }, { x: t.east, z });
    return out;
  }, [r, t.west, t.east]);
  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={i} position={[p.x, H / 2, p.z]}>
          <boxGeometry args={[0.28, H, 0.28]} />
          <meshStandardMaterial color="#F4F6F8" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** A sign on the outside of the glass: reads from outside only, so it doesn't fill the hall from within. */
function Sign({ x, z, y, size, color, text, facing = -Math.PI / 2 }: { x: number; z: number; y: number; size: number; color: string; text: string; facing?: number }) {
  return (
    <Text font={FONT} position={[x, y, z]} rotation={[0, facing, 0]} fontSize={size} color={color} anchorX="center" anchorY="middle" outlineWidth={size * 0.04} outlineColor="#FFFFFF">
      {text}
      <meshBasicMaterial color={color} side={THREE.FrontSide} toneMapped={false} />
    </Text>
  );
}

function Box({ p, s, color, emissive, rough = 0.6 }: { p: [number, number, number]; s: [number, number, number]; color: string; emissive?: string; rough?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.9 : 0} toneMapped={!emissive} />
    </mesh>
  );
}

/** Check-in: a row of desks along the airside wall, each with a screen, a bag scale and a belt behind. */
function CheckIn({ t, color }: { t: T; color: string }) {
  return (
    <group>
      {t.kiosks.map((k, i) => (
        <group key={i} position={[k.x + 1.3, FLOOR, k.z]}>
          <Box p={[0, 0.55, 0]} s={[0.9, 1.1, 2.4]} color="#F4F6F8" />
          <Box p={[-0.46, 0.75, 0]} s={[0.04, 0.5, 2.4]} color={color} emissive={color} />
          <Box p={[0.1, 1.35, 0.6]} s={[0.08, 0.45, 0.6]} color="#0B0F17" emissive="#1D9BF0" />
          <Box p={[-0.75, 0.12, -0.7]} s={[0.6, 0.24, 0.8]} color="#9AA3AD" />
          <Box p={[1.6, 0.35, 0]} s={[1.0, 0.7, 2.6]} color="#4A4F57" />
          <Text2 font={FONT} position={[-0.47, 0.75, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.22} color="#FFFFFF" anchorX="center" anchorY="middle">
            {`CHECK-IN ${i + 1}`}
          </Text2>
        </group>
      ))}
      <Text2 font={FONT} position={[t.east - 0.3, 3.6, t.kiosks[1].z]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.6} color="#1B2436" anchorX="center" anchorY="middle">
        CHECK-IN
      </Text2>
      {/* queue posts and ropes in front of the desks */}
      {[-1, 0, 1, 2].map((k) => (
        <Box key={k} p={[t.kiosks[0].x - 1.6, FLOOR + 0.5, t.kiosks[0].z - 1.5 + k * 3.2]} s={[0.1, 1, 0.1]} color="#C9A227" />
      ))}
    </group>
  );
}

/** Security: the scanner arch in the wall's one opening, an X-ray belt beside it, and a sign. */
function Security({ t }: { t: T }) {
  const [a0, a1] = t.arch;
  const z = t.securityZ;
  return (
    <group>
      <Box p={[a0 - 0.15, FLOOR + 1.2, z]} s={[0.3, 2.4, 0.7]} color="#D7DCE2" />
      <Box p={[a1 + 0.15, FLOOR + 1.2, z]} s={[0.3, 2.4, 0.7]} color="#D7DCE2" />
      <Box p={[(a0 + a1) / 2, FLOOR + 2.5, z]} s={[a1 - a0 + 0.6, 0.25, 0.7]} color="#D7DCE2" />
      <Box p={[(a0 + a1) / 2, FLOOR + 2.4, z + 0.36]} s={[0.5, 0.08, 0.02]} color="#06D6A0" emissive="#06D6A0" />
      {/* X-ray: belt on the check-in side running into a tunnel set in the wall */}
      <Box p={[a1 + 2.2, FLOOR + 0.45, z + 2.2]} s={[0.9, 0.9, 4.4]} color="#6B7280" />
      <Box p={[a1 + 2.2, FLOOR + 0.95, z + 0.6]} s={[1.1, 1.0, 1.6]} color="#E8ECEF" />
      <Box p={[a1 + 2.2, FLOOR + 0.92, z + 2.8]} s={[0.4, 0.08, 0.5]} color="#1B2436" />
      <Text font={FONT} position={[(a0 + a1) / 2, FLOOR + PART_H + 0.6, z + 0.25]} fontSize={0.5} color="#1B2436" anchorX="center" anchorY="middle">
        SECURITY
        <meshBasicMaterial color="#1B2436" side={THREE.FrontSide} />
      </Text>
      <Text font={FONT} position={[(a0 + a1) / 2, FLOOR + PART_H + 0.6, z - 0.25]} rotation={[0, Math.PI, 0]} fontSize={0.5} color="#1B2436" anchorX="center" anchorY="middle">
        GATES →
        <meshBasicMaterial color="#1B2436" side={THREE.FrontSide} />
      </Text>
    </group>
  );
}

/** The gate lounge: rows of seats facing the windows, the gate desk, the gate sign and the boarding door. */
function Gate({ t, color }: { t: T; color: string }) {
  const r = t.rect;
  const s = r.z - r.d / 2;
  const seats = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 5; k++) out.push({ x: t.west + 1.4 + row * 1.5, z: s + 12 + k * 0.8 });
    return out;
  }, [t.west, s]);
  const door = (t.doors.boarding[0] + t.doors.boarding[1]) / 2;
  return (
    <group>
      {seats.map((p, i) => (
        <group key={i} position={[p.x, FLOOR, p.z]}>
          <Box p={[0, 0.42, 0]} s={[0.6, 0.1, 0.6]} color="#2D3440" />
          <Box p={[-0.28, 0.75, 0]} s={[0.08, 0.6, 0.6]} color="#2D3440" />
          <Box p={[0, 0.2, 0]} s={[0.08, 0.4, 0.08]} color="#9AA3AD" />
        </group>
      ))}
      <group position={[t.gateDesk.x + 1.3, FLOOR, t.gateDesk.z]}>
        <Box p={[0, 0.55, 0]} s={[0.9, 1.1, 2]} color="#F4F6F8" />
        <Box p={[-0.46, 0.75, 0]} s={[0.04, 0.5, 2]} color={color} emissive={color} />
      </group>
      <Text2 font={FONT} position={[t.east - 0.3, 3.4, t.gateDesk.z]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.9} color="#1B2436" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#F4C430">
        GATE A2
      </Text2>
      {/* the boarding door, lit */}
      <Box p={[t.east, FLOOR + 2.7, door]} s={[0.12, 0.12, t.doors.boarding[1] - t.doors.boarding[0]]} color="#F4C430" emissive="#F4C430" />
      <Text2 font={FONT} position={[t.east - 0.3, 3.2, door]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.38} color="#1B2436" anchorX="center" anchorY="middle">
        BOARDING
      </Text2>
      <Board x={t.west + 0.3} z={s + 14} rot={Math.PI / 2} title="GATE A2" small />
    </group>
  );
}

/** Arrivals: passport control booth, a baggage belt, a welcome sign over the hall and the exit to the city. */
function Arrivals({ t, capital, color, accent }: { t: T; capital: string; color: string; accent: string }) {
  const r = t.rect;
  const n = r.z + r.d / 2;
  const b = t.booth;
  return (
    <group>
      {/* passport control: a booth on each side of the lane */}
      {[-1.6, 1.6].map((dx) => (
        <group key={dx} position={[b.x, FLOOR, b.z + dx]}>
          <Box p={[0, 0.6, 0]} s={[1.4, 1.2, 1]} color="#F4F6F8" />
          <Box p={[0, 1.55, 0]} s={[1.4, 0.7, 1]} color="#BFE3FF" />
        </group>
      ))}
      <Text2 font={FONT} position={[b.x, 3, b.z]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.4} color="#1B2436" anchorX="center" anchorY="middle">
        PASSPORT CONTROL
      </Text2>
      {/* baggage belt */}
      <mesh position={[r.x + 1.6, FLOOR + 0.3, n - 3]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[1.5, 0.35, 8, 24]} />
        <meshStandardMaterial color="#4A4F57" roughness={0.6} />
      </mesh>
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return <Box key={k} p={[r.x + 1.6 + Math.cos(a) * 1.5, FLOOR + 0.62, n - 3 + Math.sin(a) * 1.5]} s={[0.5, 0.35, 0.35]} color={['#E63946', '#1D9BF0', '#FFD166', '#2D2D2D', color][k]} />;
      })}
      {/* the welcome sign on the back wall, over the hall */}
      <Box p={[r.x, 4.2, n - 0.35]} s={[r.w - 1, 1.6, 0.12]} color="#0B0F17" />
      <Text2 font={FONT} position={[r.x, 4.45, n - 0.45]} rotation={[0, Math.PI, 0]} fontSize={0.42} color="#FFFFFF" anchorX="center" anchorY="middle">
        WELCOME TO
      </Text2>
      <Text2 font={FONT} position={[r.x, 3.9, n - 0.45]} rotation={[0, Math.PI, 0]} fontSize={0.62} color={accent} anchorX="center" anchorY="middle">
        {capital.toUpperCase()}
      </Text2>
      <Text2 font={FONT} position={[t.west + 0.3, 2.9, (t.doors.arrivalsOut[0] + t.doors.arrivalsOut[1]) / 2]} rotation={[0, Math.PI / 2, 0]} fontSize={0.45} color="#06A77D" anchorX="center" anchorY="middle">
        EXIT · CITY
      </Text2>
    </group>
  );
}

/** A flight board screen: every route out of here, its flight number and fare. */
function Board({ x, z, rot, title, from, small }: { x: number; z: number; rot: number; title: string; from?: string; small?: boolean }) {
  const here = useWorld((s) => s.country);
  const origin = (from ?? here) as typeof here;
  const rows = COUNTRY_LIST.filter((c) => c.id !== origin);
  const w = small ? 3.2 : 6, h = small ? 1.6 : 2.2, y = small ? 2.6 : 3.8;
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh>
        <boxGeometry args={[w, h, 0.12]} />
        <meshStandardMaterial color="#0B0F17" roughness={0.4} />
      </mesh>
      <mesh position={[0, h / 2 - 0.2, 0.065]}>
        <planeGeometry args={[w - 0.1, 0.34]} />
        <meshStandardMaterial color="#F4C430" emissive="#F4C430" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      <Text font={FONT} position={[-w / 2 + 0.2, h / 2 - 0.2, 0.08]} fontSize={0.2} color="#0B0F17" anchorX="left" anchorY="middle">
        {`✈ ${title}`}
      </Text>
      {rows.map((c, i) => (
        <group key={c.id} position={[0, h / 2 - 0.65 - i * (small ? 0.42 : 0.5), 0.08]}>
          <Text font={FONT} position={[-w / 2 + 0.2, 0, 0]} fontSize={small ? 0.17 : 0.22} color="#F4C430" anchorX="left" anchorY="middle">
            {flightNumber(origin, c.id)}
          </Text>
          <Text font={FONT} position={[-w / 2 + (small ? 1 : 1.3), 0, 0]} fontSize={small ? 0.17 : 0.22} color="#FFFFFF" anchorX="left" anchorY="middle">
            {c.capital.toUpperCase()}
          </Text>
          {!small && (
            <Text font={FONT} position={[w / 2 - 1.5, 0, 0]} fontSize={0.2} color="#BFC6D1" anchorX="right" anchorY="middle">
              {`${CABINS[0].bags} BAGS`}
            </Text>
          )}
          <Text font={FONT} position={[w / 2 - 0.2, 0, 0]} fontSize={small ? 0.15 : 0.2} color="#06D6A0" anchorX="right" anchorY="middle">
            {i === 0 ? 'BOARDING' : 'ON TIME'}
          </Text>
        </group>
      ))}
    </group>
  );
}

/** A sign that reads the right way from both sides (the walls are glass, so you see them from outside too). */
function Text2({ position, rotation, ...rest }: ComponentProps<typeof Text> & { position: [number, number, number]; rotation?: [number, number, number] }) {
  rotation = rotation ?? [0, 0, 0];
  const a = rotation[1];
  const nx = Math.sin(a) * 0.03, nz = Math.cos(a) * 0.03;
  return (
    <>
      <Text position={[position[0] + nx, position[1], position[2] + nz]} rotation={rotation} {...rest}>
        {rest.children}
        <meshBasicMaterial color={rest.color as string} side={THREE.FrontSide} toneMapped={false} />
      </Text>
      <Text position={[position[0] - nx, position[1], position[2] - nz]} rotation={[rotation[0], a + Math.PI, rotation[2]]} {...rest}>
        {rest.children}
        <meshBasicMaterial color={rest.color as string} side={THREE.FrontSide} toneMapped={false} />
      </Text>
    </>
  );
}
