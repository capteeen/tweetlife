'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { COUNTRIES } from '@/lib/world/countries';
import { TOWN_BRIDGE_TOP, TOWN_ISLAND_TOP, TOWN_PAVED_TOP, TOWN_ROAD_TOP, type Strip, type TownBuilding, type TownLayout } from '@/lib/world/towns';
import { placeTownVenues } from '@/lib/life/venues';
import { VenueMesh } from './Venues';

// A country's other cities (lib/world/towns.ts), each on its own island across the lagoon: the road out from the
// ring road, the bridge, a welcome arch, an avenue of towers, a plaza round a landmark, and the headquarters you can
// use (its pin opens the venue sheet). Pump.fun is pill towers in green and white, rising like a bonding curve to
// King of the Hill; StonkFun is navy glass skyscrapers with green ticker bands round an exchange with a live tape.

const FONT = '/fonts/inter-600.woff';
const ASPHALT = '#3E434C';

export function Towns({ towns, sand, interactive }: { towns: TownLayout[]; sand: string; interactive: boolean }) {
  const venues = useMemo(() => placeTownVenues(towns), [towns]);
  return (
    <group>
      {towns.map((t) => (
        <Town key={t.town.id} t={t} sand={sand} />
      ))}
      {venues.map((v) => (
        <VenueMesh key={v.id} v={v} interactive={interactive} />
      ))}
    </group>
  );
}

/** A flat strip (road, deck, avenue) with its top at `top`. */
function StripMesh({ s, top, thick, color }: { s: Strip; top: number; thick: number; color: string }) {
  return (
    <mesh position={[s.x, top - thick / 2, s.z]} rotation={[0, -s.a, 0]} receiveShadow>
      <boxGeometry args={[s.len, thick, s.w]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

function Town({ t, sand }: { t: TownLayout; sand: string }) {
  const c = t.town.colors;
  const capital = COUNTRIES[t.town.country].capital;
  const { bridge } = t;
  const rails = [-1, 1].map((s) => ({ x: bridge.x - Math.sin(bridge.a) * (s * (bridge.w / 2 - 0.2)), z: bridge.z + Math.cos(bridge.a) * (s * (bridge.w / 2 - 0.2)) }));
  const piers = [-0.35, 0, 0.35].map((f) => ({ x: bridge.x + Math.cos(bridge.a) * f * bridge.len, z: bridge.z + Math.sin(bridge.a) * f * bridge.len }));
  return (
    <group>
      {/* the road out from the ring road, with a dashed centre line, and the bridge */}
      <StripMesh s={t.road} top={TOWN_ROAD_TOP} thick={0.1} color={ASPHALT} />
      <StripMesh s={{ ...t.road, w: 0.25, len: t.road.len - 2 }} top={TOWN_ROAD_TOP + 0.01} thick={0.02} color="#E8B923" />
      <StripMesh s={bridge} top={TOWN_BRIDGE_TOP} thick={0.6} color="#9AA0A8" />
      <StripMesh s={{ ...bridge, w: bridge.w - 2 }} top={TOWN_BRIDGE_TOP + 0.01} thick={0.02} color={ASPHALT} />
      {rails.map((r, i) => (
        <mesh key={i} position={[r.x, TOWN_BRIDGE_TOP + 0.5, r.z]} rotation={[0, -bridge.a, 0]}>
          <boxGeometry args={[bridge.len, 0.9, 0.3]} />
          <meshStandardMaterial color={c.primary} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {piers.map((p, i) => (
        <mesh key={i} position={[p.x, -1.6, p.z]} rotation={[0, -bridge.a, 0]}>
          <boxGeometry args={[1.6, 3, bridge.w - 1]} />
          <meshStandardMaterial color="#7E848C" roughness={1} />
        </mesh>
      ))}

      {/* the island: a sandy rim, the town's ground, the avenue, the plaza and the headquarters' forecourt */}
      <mesh position={[t.center.x, -0.75, t.center.z]} receiveShadow>
        <cylinderGeometry args={[t.r + 1.5, t.r + 3, 1.5, 48]} />
        <meshStandardMaterial color={sand} roughness={1} />
      </mesh>
      <mesh position={[t.center.x, TOWN_ISLAND_TOP - 0.1, t.center.z]} receiveShadow>
        <cylinderGeometry args={[t.r, t.r, 0.2, 48]} />
        <meshStandardMaterial color={c.ground} roughness={1} />
      </mesh>
      <StripMesh s={t.avenue} top={TOWN_PAVED_TOP} thick={0.12} color={ASPHALT} />
      <StripMesh s={t.forecourt} top={TOWN_PAVED_TOP + 0.004} thick={0.12} color="#C9CCD2" />
      <mesh position={[t.plaza.x, TOWN_PAVED_TOP + 0.002 - 0.06, t.plaza.z]} receiveShadow>
        <cylinderGeometry args={[t.plaza.r, t.plaza.r, 0.12, 40]} />
        <meshStandardMaterial color="#D5D7DC" roughness={0.95} />
      </mesh>
      <mesh position={[t.plaza.x, TOWN_PAVED_TOP + 0.01, t.plaza.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[t.plaza.r - 1.4, t.plaza.r - 0.8, 48]} />
        <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={0.4} />
      </mesh>

      {t.buildings.map((b, i) => (t.town.style === 'pill' ? <PillTower key={i} b={b} t={t} /> : <GlassTower key={i} b={b} t={t} />))}
      {t.town.style === 'pill' ? <Launchpad t={t} /> : <Exchange t={t} />}
      <group position={[t.plaza.x, TOWN_PAVED_TOP, t.plaza.z]}>{t.town.style === 'pill' ? <PillMonument t={t} /> : <StonksArrow t={t} />}</group>

      {/* the welcome arch where the bridge lands */}
      <group position={[t.arch.x, TOWN_PAVED_TOP, t.arch.z]} rotation={[0, t.arch.rot, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * t.arch.span) / 2, 3.8, 0]} castShadow>
            <boxGeometry args={[1, 7.6, 1]} />
            <meshStandardMaterial color={c.primary} roughness={0.4} metalness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 8.4, 0]} castShadow>
          <boxGeometry args={[t.arch.span + 2, 2.6, 1.1]} />
          <meshStandardMaterial color={c.ink} roughness={0.5} />
        </mesh>
        <mesh position={[0, 9.8, 0]}>
          <boxGeometry args={[t.arch.span + 2, 0.2, 1.15]} />
          <meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
        {/* facing arrivals off the bridge */}
        <Text font={FONT} position={[0, 8.75, 0.6]} fontSize={1.05} letterSpacing={0.06} color={c.accent} anchorX="center" anchorY="middle">
          {`WELCOME TO ${t.town.name.toUpperCase()}`}
        </Text>
        <Text font={FONT} position={[0, 7.75, 0.6]} fontSize={0.48} color="#FFFFFF" anchorX="center" anchorY="middle">
          {`${t.town.tagline} · ${COUNTRIES[t.town.country].name}`}
        </Text>
        {/* facing the town, for people heading back */}
        <Text font={FONT} position={[0, 8.4, -0.6]} rotation={[0, Math.PI, 0]} fontSize={0.62} letterSpacing={0.06} color={c.accent} anchorX="center" anchorY="middle">
          {`BRIDGE TO ${capital.toUpperCase()}`}
        </Text>
      </group>
      <pointLight position={[t.plaza.x, 26, t.plaza.z]} color={c.primary} intensity={260} distance={80} decay={2} />
    </group>
  );
}

/** Rows of windows on a tower's skin, repeated up its height. */
function useWindows(body: string, glass: string, lit: string, w: number, h: number) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = body;
    g.fillRect(0, 0, 64, 64);
    for (let col = 0; col < 4; col++) {
      g.fillStyle = col === 1 ? lit : glass;
      g.fillRect(4 + col * 15, 18, 11, 28);
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(Math.max(1, Math.round(w / 3.2)), Math.max(1, Math.round(h / 3.4)));
    return tx;
  }, [body, glass, lit, w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Pump.fun: round towers, green or white, capped with a dome so each one reads as a standing pill. */
function PillTower({ b, t }: { b: TownBuilding; t: TownLayout }) {
  const c = t.town.colors;
  const green = b.tone % 2 === 0;
  const body = green ? c.primary : c.secondary;
  const r = Math.min(b.w, b.d) / 2;
  const tex = useWindows(body, green ? '#1E5C33' : '#3A4A40', c.accent, Math.PI * r * 2, b.h);
  return (
    <group position={[b.x, TOWN_ISLAND_TOP, b.z]} rotation={[0, b.rot, 0]}>
      <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, b.h, 24]} />
        <meshStandardMaterial map={tex} roughness={0.55} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, b.h, 0]} castShadow>
        <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={green ? c.secondary : c.primary} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[r + 0.08, r + 0.08, 0.35, 24]} />
        <meshStandardMaterial color={c.ink} roughness={0.6} />
      </mesh>
      {/* the tallest one, next to the launchpad, is King of the Hill */}
      {b.tone === t.buildings.length - 1 && <Crown y={b.h + r + 0.4} color="#FFD23F" />}
    </group>
  );
}

function Crown({ y, color }: { y: number; color: string }) {
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <cylinderGeometry args={[2.2, 2.2, 1.2, 10, 1, true]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 2.1, 1.2, Math.sin(a) * 2.1]}>
            <coneGeometry args={[0.45, 1.3, 4]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.6} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

/** StonkFun: navy glass skyscrapers with a glowing green ticker band near the top. */
function GlassTower({ b, t }: { b: TownBuilding; t: TownLayout }) {
  const c = t.town.colors;
  const tex = useWindows(b.tone % 3 === 0 ? '#1B2C4D' : c.secondary, '#4F7AA8', '#CFE8FF', b.w, b.h);
  return (
    <group position={[b.x, TOWN_ISLAND_TOP, b.z]} rotation={[0, b.rot, 0]}>
      <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial map={tex} roughness={0.25} metalness={0.45} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={0.06} />
      </mesh>
      <mesh position={[0, b.h - 2.2, 0]}>
        <boxGeometry args={[b.w + 0.12, 0.7, b.d + 0.12]} />
        <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      <mesh position={[0, b.h + 0.4, 0]} castShadow>
        <boxGeometry args={[b.w * 0.6, 0.8, b.d * 0.6]} />
        <meshStandardMaterial color="#2B3446" roughness={0.6} />
      </mesh>
      {b.tone % 2 === 1 && (
        <mesh position={[0, b.h + 3.2, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 4.8, 6]} />
          <meshStandardMaterial color="#C9CCD2" metalness={0.6} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

/** The headquarters' name over its door, facing the plaza. */
function HqSign({ t, y, name, z = 0.08 }: { t: TownLayout; y: number; name: string; z?: number }) {
  return (
    <Text font={FONT} position={[0, y, t.hq.d / 2 + z]} fontSize={1.05} letterSpacing={0.05} color="#FFFFFF" outlineWidth={0.04} outlineColor={t.town.colors.ink} anchorX="center" anchorY="middle">
      {name}
    </Text>
  );
}

/** Pump.fun's launchpad: a white hall with a green band, a launch gantry and a giant pill on the roof. */
function Launchpad({ t }: { t: TownLayout }) {
  const c = t.town.colors;
  const { hq } = t;
  return (
    <group position={[hq.x, TOWN_PAVED_TOP, hq.z]} rotation={[0, hq.rot, 0]}>
      <mesh position={[0, hq.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[hq.w, hq.h, hq.d]} />
        <meshStandardMaterial color="#F4F7F5" roughness={0.7} />
      </mesh>
      <mesh position={[0, hq.h - 1.4, 0]}>
        <boxGeometry args={[hq.w + 0.1, 1.2, hq.d + 0.1]} />
        <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 1.6, hq.d / 2 + 0.05]}>
        <boxGeometry args={[4, 3.2, 0.1]} />
        <meshStandardMaterial color="#0E1A12" roughness={0.3} metalness={0.4} />
      </mesh>
      <HqSign t={t} y={hq.h - 3.4} name="PUMP.FUN LAUNCHPAD" />
      <group position={[0, hq.h + 4.6, 0]} rotation={[0, 0, -0.55]}>
        <Pill r={2.4} len={9} />
      </group>
      {/* the gantry at the back corner */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[hq.w / 2 - 2 + s * 1.2, (hq.h + 10) / 2, -hq.d / 2 + 2]} castShadow>
          <boxGeometry args={[0.35, hq.h + 10, 0.35]} />
          <meshStandardMaterial color="#C9CCD2" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/** StonkFun's exchange: columns, a pediment and a scrolling ticker tape across the front. */
function Exchange({ t }: { t: TownLayout }) {
  const c = t.town.colors;
  const { hq } = t;
  const tape = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#04070D';
    g.fillRect(0, 0, 1024, 64);
    g.font = 'bold 36px Inter, Arial, sans-serif';
    g.textBaseline = 'middle';
    const ticks: [string, string, boolean][] = [['NVDAx', '+4.2%', true], ['SPYx', '+1.1%', true], ['TSLAx', '-2.3%', false], ['AAPLx', '+0.8%', true], ['STONK', '+12.0%', true], ['METAx', '-0.6%', false]];
    let x = 16;
    for (const [sym, ch, up] of ticks) {
      g.fillStyle = '#E8EEF7';
      g.fillText(sym, x, 34);
      x += g.measureText(sym).width + 10;
      g.fillStyle = up ? '#2BFF88' : '#FF4D5E';
      const s = `${up ? '▲' : '▼'} ${ch}`;
      g.fillText(s, x, 34);
      x += g.measureText(s).width + 34;
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = THREE.RepeatWrapping;
    return tx;
  }, []);
  useEffect(() => () => tape.dispose(), [tape]);
  useFrame((_, d) => {
    tape.offset.x = (tape.offset.x + d * 0.05) % 1;
  });
  const cols = [-6.4, -3.85, -1.3, 1.3, 3.85, 6.4];
  return (
    <group position={[hq.x, TOWN_PAVED_TOP, hq.z]} rotation={[0, hq.rot, 0]}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[hq.w + 1, 1, hq.d + 1]} />
        <meshStandardMaterial color="#D9DCE2" roughness={0.9} />
      </mesh>
      <mesh position={[0, hq.h / 2, -1]} castShadow receiveShadow>
        <boxGeometry args={[hq.w, hq.h, hq.d - 2]} />
        <meshStandardMaterial color={c.secondary} roughness={0.5} metalness={0.2} />
      </mesh>
      {cols.map((x) => (
        <mesh key={x} position={[x, hq.h / 2, hq.d / 2 - 0.6]} castShadow>
          <cylinderGeometry args={[0.5, 0.55, hq.h - 1, 12]} />
          <meshStandardMaterial color="#EDEFF3" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, hq.h + 0.5, 0]} castShadow>
        <boxGeometry args={[hq.w + 1, 1, hq.d + 0.6]} />
        <meshStandardMaterial color="#EDEFF3" roughness={0.6} />
      </mesh>
      <mesh position={[0, hq.h + 1.4, -0.4]} castShadow>
        <boxGeometry args={[hq.w - 2, 0.8, hq.d - 1.6]} />
        <meshStandardMaterial color="#EDEFF3" roughness={0.6} />
      </mesh>
      {/* the ticker tape over the columns */}
      <mesh position={[0, hq.h - 1.6, hq.d / 2 + 0.05]}>
        <planeGeometry args={[hq.w - 1, 1.3]} />
        <meshBasicMaterial map={tape} toneMapped={false} />
      </mesh>
      <HqSign t={t} y={hq.h + 0.5} z={0.36} name="STONKFUN EXCHANGE" />
      {/* the big board on the roof: a green line going up */}
      <group position={[0, hq.h + 7.8, -1]}>
        <mesh>
          <boxGeometry args={[12, 6, 0.4]} />
          <meshStandardMaterial color="#04070D" roughness={0.5} />
        </mesh>
        {[[-5, -2, -2, 0.5], [-2, 0.5, 0.5, -0.5], [0.5, -0.5, 4.8, 2.4]].map(([x0, y0, x1, y1], i) => (
          <mesh key={i} position={[(x0 + x1) / 2, (y0 + y1) / 2, 0.25]} rotation={[0, 0, Math.atan2(y1 - y0, x1 - x0)]}>
            <boxGeometry args={[Math.hypot(x1 - x0, y1 - y0), 0.35, 0.1]} />
            <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A capsule split green and white, standing along its local y axis. */
function Pill({ r, len }: { r: number; len: number }) {
  const green = '#53D769', white = '#FFFFFF';
  return (
    <group>
      {[
        [1, green],
        [-1, white],
      ].map(([s, color]) => (
        <group key={color as string} scale={[1, s as number, 1]}>
          <mesh position={[0, len / 4, 0]} castShadow>
            <cylinderGeometry args={[r, r, len / 2, 28]} />
            <meshStandardMaterial color={color as string} roughness={0.3} emissive={color as string} emissiveIntensity={0.15} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, len / 2, 0]} castShadow>
            <sphereGeometry args={[r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={color as string} roughness={0.3} emissive={color as string} emissiveIntensity={0.15} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Plinth({ t }: { t: TownLayout }) {
  const c = t.town.colors;
  return (
    <>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[4.2, 5, 1.8, 8]} />
        <meshStandardMaterial color={c.ink} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* a glowing band round the top edge (open, so the plinth's top stays dark) */}
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[4.27, 4.37, 0.18, 8, 1, true]} />
        <meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </>
  );
}

/** Pump.fun's monument: a giant pill, tilted, turning slowly over the plaza. */
function PillMonument({ t }: { t: TownLayout }) {
  const spin = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!spin.current) return;
    spin.current.rotation.y = clock.elapsedTime * 0.25;
    spin.current.position.y = 11 + Math.sin(clock.elapsedTime * 0.8) * 0.6;
  });
  return (
    <group>
      <Plinth t={t} />
      <group ref={spin} position={[0, 11, 0]}>
        <group rotation={[0, 0, -0.7]}>
          <Pill r={3.2} len={13} />
        </group>
      </group>
    </group>
  );
}

/** StonkFun's monument: the green line that only goes up, zig-zagging to an arrowhead. */
function StonksArrow({ t }: { t: TownLayout }) {
  const c = t.town.colors;
  const spin = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (spin.current) spin.current.rotation.y = clock.elapsedTime * 0.18;
  });
  const pts: [number, number][] = [[-4, 3.2], [-1.5, 8.5], [0.8, 6.4], [5, 15.5]];
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const head = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  return (
    <group>
      <Plinth t={t} />
      <group ref={spin}>
        {pts.slice(1).map(([x1, y1], i) => {
          const [x0, y0] = pts[i];
          return (
            <mesh key={i} position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} rotation={[0, 0, Math.atan2(y1 - y0, x1 - x0)]} castShadow>
              <boxGeometry args={[Math.hypot(x1 - x0, y1 - y0) + 1.2, 1.2, 1.2]} />
              <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={0.7} roughness={0.35} metalness={0.2} />
            </mesh>
          );
        })}
        <mesh position={[end[0], end[1], 0]} rotation={[0, 0, head - Math.PI / 2]} castShadow>
          <coneGeometry args={[2.2, 3.6, 4]} />
          <meshStandardMaterial color={c.primary} emissive={c.primary} emissiveIntensity={0.7} roughness={0.35} metalness={0.2} />
        </mesh>
        {/* the post holding it up */}
        <mesh position={[-4, 2.5, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 1.5, 8]} />
          <meshStandardMaterial color="#C9CCD2" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
