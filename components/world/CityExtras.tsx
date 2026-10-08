'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Block, CityGrid, Placed } from '@/lib/world/geometry';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { prng, hashString } from '@/lib/world/seed';
import { COUNTRIES } from '@/lib/world/countries';
import { districtName, themeOf, themedPalette, type CityTheme } from '@/lib/world/cityThemes';
import { useWorld } from './store';
import { Landmark, WelcomeArch, logoImage } from './Landmarks';
import { placementSite } from '@/lib/world/placement';
import { palmSpots } from '@/lib/world/scatter';
import { spurRoads } from '@/lib/world/ground';
import {
  DISTRICTS, RING_ROAD_W, RING_SLOTS, airportLayout, billboardSpots, ringRoadRadius, slotAngle, venueRingRadius, type Airport, type Rect,
} from '@/lib/world/layout';
import { planeSound, traffic, type TrafficCar } from '@/lib/audio/state';
import { TreeField, type TreeItem } from './Trees';
import { withDetail } from './groundDetail';

// Everything around the post city that makes it a city: the ring road and its traffic, spur roads,
// district names on the ground, billboards, palms, and the airport island with its bridge.

const FONT = '/fonts/inter-600.woff';
const ASPHALT = '#3E434C';
const CONCRETE = '#C9CCD1';
const YELLOW = '#E8B923';
const PALM_TINTS = ['#FFFFFF', '#F2FBE4', '#E4F2D8', '#FFF6DC'];
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

type Props = { contentRadius: number; boundaryRadius: number; blocks: Block[]; grid: CityGrid; hasCity: boolean; biome: string; handle: string; structures: Placed[]; player?: boolean };

export function CityExtras({ contentRadius, boundaryRadius, blocks, grid, hasCity, biome, handle, structures, player = false }: Props) {
  const country = useWorld((s) => s.country);
  const theme = themeOf(country);
  const pal = themedPalette(PALETTES[(biome as Biome) in PALETTES ? (biome as Biome) : 'meadow'], country);
  const rr = ringRoadRadius(contentRadius);
  const ap = useMemo(() => airportLayout(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);
  const R = boundaryRadius;
  const { K, pitchX, pitchZ, road } = grid;
  const halfW = ((2 * K + 1) * pitchX + road) / 2, halfD = ((2 * K + 1) * pitchZ + road) / 2;

  // spur roads from the grid's edges out to the ring road
  const spurs = useMemo<Rect[]>(() => (hasCity ? spurRoads(grid, contentRadius) : []), [hasCity, grid, contentRadius]);
  const site = useMemo(() => placementSite({ blocks, grid, boundaryRadius, structures }), [blocks, grid, boundaryRadius, structures]);
  const palms = useMemo<TreeItem[]>(
    () => palmSpots(site, { contentRadius, boundaryRadius, handle }).map((p, i) => ({ species: 'palm', x: p.x, y: p.y, z: p.z, s: p.s * 0.85, yaw: p.yaw, tint: PALM_TINTS[i % PALM_TINTS.length] })),
    [site, contentRadius, boundaryRadius, handle],
  );

  const ads = useMemo(() => {
    const top = structures.find((s) => s.isLandmark && s.text) ?? null;
    const quote = top?.text ? `“${top.text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 70)}${top.text.length > 70 ? '…' : ''}”` : 'Every post is a building.';
    // the owner's own board first, then the country's
    const logo = COUNTRIES[theme.country].logo;
    return [{ title: `@${handle}`, sub: quote, from: '#1D9BF0', to: '#0B3B66' }, ...theme.ads.map((a) => ({ ...a, logo: a.logo ? logo : undefined }))];
  }, [structures, handle, theme]);
  const spots = useMemo(() => billboardSpots(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);

  const labelR = Math.min(venueRingRadius(contentRadius) + 11, R - 3.5);

  return (
    <group>
      {hasCity && <RingRoad r={rr} />}
      {/* each district's ground, tinted towards its colour */}
      {hasCity &&
        DISTRICTS.map((d) => {
          const half = Math.PI / RING_SLOTS;
          const a0 = slotAngle(d.slots[0]) - half, a1 = slotAngle(d.slots[d.slots.length - 1]) + half;
          const color = new THREE.Color(pal.lush).lerp(new THREE.Color(d.color), 0.35);
          // ringGeometry runs counter-clockwise in its own plane; laid flat, angle a maps to -a in world z
          return (
            <mesh key={d.id} position={[0, 0.0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={groundMaterial(color)}>
              <ringGeometry args={[rr + RING_ROAD_W / 2 + 0.6, R - 0.6, 48, 1, -a1, a1 - a0]} />
            </mesh>
          );
        })}
      {spurs.map((s, i) => (
        <mesh key={i} position={[s.x, 0.02, s.z]} receiveShadow material={asphalt}>
          <boxGeometry args={[s.w, 0.06, s.d]} />
        </mesh>
      ))}
      {hasCity &&
        DISTRICTS.map((d) => {
          const a = slotAngle(d.slots[Math.floor(d.slots.length / 2)] - (d.slots.length % 2 ? 0 : 0.5));
          const x = Math.cos(a) * labelR, z = Math.sin(a) * labelR;
          return (
            <group key={d.id} position={[x, 0.08, z]} rotation={[0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0]}>
              <Text font={FONT} rotation={[-Math.PI / 2, 0, 0]} fontSize={2.6} letterSpacing={0.18} color={theme.label} fillOpacity={0.8} anchorX="center" anchorY="middle">
                {districtName(d.id, d.name, country).toUpperCase()}
              </Text>
            </group>
          );
        })}
      <Text font={FONT} position={[R + 14, 0.05 - 0.4, -ap.island.d / 2 + 12]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={3.2} letterSpacing={0.3} color="#FFFFFF" fillOpacity={0.6} anchorX="center">
        THE LAGOON
      </Text>
      {hasCity && <AirportScene ap={ap} grass={pal.lush} theme={theme} />}
      {hasCity && <WelcomeArch ap={ap} country={country} />}
      <Landmark boundaryRadius={R} country={country} sand={pal.sand} grass={pal.lush} />
      {hasCity && spots.map((s, i) => <BillboardSign key={i} {...s} ad={ads[i % ads.length]} />)}
      {hasCity && <TreeField items={palms} player={player} />}
      {hasCity && <RingTraffic r={rr} handle={handle} player={player} colors={theme.traffic} />}
    </group>
  );
}

const asphalt = typeof document === 'undefined' ? undefined : withDetail(new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 }), 'asphalt');
const curb = typeof document === 'undefined' ? undefined : withDetail(new THREE.MeshStandardMaterial({ color: '#B9BCC2', roughness: 1 }), 'paving');
const grounds = new Map<string, THREE.MeshStandardMaterial>();
function groundMaterial(color: THREE.Color) {
  const k = color.getHexString();
  let m = grounds.get(k);
  if (!m) grounds.set(k, (m = withDetail(new THREE.MeshStandardMaterial({ color, roughness: 1 }), 'grass')));
  return m;
}

function RingRoad({ r }: { r: number }) {
  const dashes = useMemo(() => {
    const n = Math.floor((Math.PI * 2 * r) / 5);
    return Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
  }, [r]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(0.25, 0.03, 2.2), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    dashes.forEach((a, i) => {
      tmp.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
      tmp.rotation.set(0, -a, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [dashes, r]);
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={curb}>
        <ringGeometry args={[r - RING_ROAD_W / 2 - 0.6, r + RING_ROAD_W / 2 + 0.6, 128, 1]} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={asphalt}>
        <ringGeometry args={[r - RING_ROAD_W / 2, r + RING_ROAD_W / 2, 128, 1]} />
      </mesh>
      {/* two-way road: a yellow centre line, broken, as on the grid's streets */}
      <instancedMesh ref={ref} args={[geo, undefined, dashes.length]} frustumCulled={false}>
        <meshStandardMaterial color={YELLOW} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

/** Buses, vans, yellow cabs and cars going round the ring road, both ways. */
function RingTraffic({ r, handle, player, colors }: { r: number; handle: string; player: boolean; colors: string[] }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const top = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => {
    const rnd = prng(hashString(handle + '|ring'));
    const kinds = [
      { s: [2.4, 2.2, 8.5], c: colors[0], topH: 0.15 },
      { s: [2, 1.6, 4.6], c: colors[1], topH: 0.2 },
      { s: [1.7, 0.6, 3.8], c: colors[2], topH: 0.55 },
      { s: [1.7, 0.6, 3.6], c: colors[3], topH: 0.55 },
      { s: [1.7, 0.6, 3.6], c: colors[4], topH: 0.55 },
    ];
    return Array.from({ length: 12 }, (_, i) => {
      const cruise = (5 + rnd() * 4) / r;
      return { ...kinds[i % kinds.length], dir: i % 2 ? 1 : -1, a: rnd() * Math.PI * 2, cruise, speed: cruise };
    });
  }, [r, handle, colors]);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  // where each car is, for engine sounds (components/audio/WorldSounds.tsx)
  const heard = useMemo<TrafficCar[]>(() => cars.map((c) => ({ x: 0, z: 0, speed: 0, big: c.s[2] > 4.7 })), [cars]);
  useEffect(() => {
    if (!player) return;
    traffic.set('ring', () => heard);
    return () => void traffic.delete('ring');
  }, [heard, player]);
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    cars.forEach((c, i) => b.setColorAt(i, tmpColor.set(c.c)));
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }, [cars]);
  useFrame((_, delta) => {
    const b = body.current, t = top.current;
    if (!b || !t) return;
    const dt = Math.min(delta, 0.1);
    // brake for the player standing in the lane ahead (same rule as the grid traffic in Cars.tsx)
    const me = player ? useWorld.getState().playerPos : null;
    const meR = me ? Math.hypot(me.x, me.z) : 0, meA = me ? Math.atan2(me.z, me.x) : 0;
    cars.forEach((c, i) => {
      const lane = r + c.dir * 1.5;
      let target = c.cruise;
      if (me && Math.abs(meR - lane) < 1.4) {
        let da = (meA - c.a) * c.dir;
        da -= Math.PI * 2 * Math.floor(da / (Math.PI * 2));
        const gap = da * lane - c.s[2] / 2 - 1;
        if (gap < 10) target = gap < 0.5 ? 0 : Math.min(target, (gap / 10) * c.cruise);
      }
      c.speed += (target - c.speed) * Math.min(1, dt * 4);
      c.a += c.speed * c.dir * dt;
      const a = c.a;
      const x = Math.cos(a) * lane, z = Math.sin(a) * lane;
      const rot = -a + (c.dir > 0 ? 0 : Math.PI);
      Object.assign(heard[i], { x, z, speed: c.speed * lane });
      tmp.position.set(x, 0.3 + c.s[1] / 2, z);
      tmp.rotation.set(0, rot, 0);
      tmp.scale.set(c.s[0], c.s[1], c.s[2]);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, 0.3 + c.s[1] + c.topH / 2, z);
      tmp.scale.set(c.s[0] * 0.85, c.topH, c.s[2] * 0.5);
      tmp.updateMatrix();
      t.setMatrixAt(i, tmp.matrix);
    });
    b.instanceMatrix.needsUpdate = t.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={body} args={[geo, undefined, cars.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial flatShading roughness={0.5} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={top} args={[geo, undefined, cars.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#1B2436" flatShading roughness={0.3} />
      </instancedMesh>
    </group>
  );
}

type BoardAd = { title: string; sub: string; from: string; to: string; logo?: string };

function adTexture(ad: BoardAd) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, ad.from);
  grad.addColorStop(1, ad.to);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.arc(440, 40, 120, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.font = '800 58px Inter, system-ui, sans-serif';
  g.textBaseline = 'top';
  // boards with the country's real logo keep its top-right corner for it
  const textW = ad.logo ? 330 : 456;
  g.fillText(ad.title, 28, 34, textW);
  g.font = '500 30px Inter, system-ui, sans-serif';
  const words = ad.sub.split(/\s+/);
  let line = '', y = 120;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > 456 && line) {
      g.fillText(line, 28, y);
      line = w;
      y += 38;
      if (y > 200) break;
    } else line = next;
  }
  if (y <= 200) g.fillText(line, 28, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (ad.logo)
    logoImage(ad.logo, 104, (img) => {
      g.fillStyle = 'rgba(11,14,17,0.55)';
      g.beginPath();
      g.arc(430, 82, 66, 0, Math.PI * 2);
      g.fill();
      g.drawImage(img, 378, 30);
      t.needsUpdate = true;
    });
  return t;
}

function BillboardSign({ x, z, rot, ad }: { x: number; z: number; rot: number; ad: BoardAd }) {
  const tex = useMemo(() => adTexture(ad), [ad]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {[-3.2, 3.2].map((sx) => (
        <mesh key={sx} position={[sx, 2.6, -0.2]} castShadow>
          <boxGeometry args={[0.35, 5.2, 0.35]} />
          <meshStandardMaterial color="#2B2F36" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 6.6, -0.25]} castShadow>
        <boxGeometry args={[10.6, 5.6, 0.3]} />
        <meshStandardMaterial color="#1B1E24" roughness={0.6} />
      </mesh>
      <mesh position={[0, 6.6, -0.08]}>
        <planeGeometry args={[10, 5]} />
        <meshStandardMaterial map={tex} roughness={0.6} emissive="#FFFFFF" emissiveMap={tex} emissiveIntensity={0.25} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- airport

function Slab({ r, y, h, color, rough = 1 }: { r: Rect; y: number; h: number; color: string; rough?: number }) {
  return (
    <mesh position={[r.x, y + h / 2, r.z]} receiveShadow>
      <boxGeometry args={[r.w, h, r.d]} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}

function AirportScene({ ap, grass, theme }: { ap: Airport; grass: string; theme: CityTheme }) {
  const rw = ap.runway;
  const flag = COUNTRIES[theme.country].theme;
  const marks = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number }[] = [];
    for (let z = -rw.d / 2 + 16; z < rw.d / 2 - 16; z += 7) out.push({ x: rw.x, z, w: 0.35, d: 3.5 }); // centreline
    for (const end of [-1, 1]) for (let k = -3; k <= 3; k++) if (k) out.push({ x: rw.x + k * 1.2, z: end * (rw.d / 2 - 3.5), w: 0.6, d: 4.5 }); // thresholds
    for (const end of [-1, 1]) for (const sx of [-1, 1]) out.push({ x: rw.x + sx * 2.4, z: end * (rw.d / 2 - 22), w: 1.4, d: 6 }); // aiming points
    out.push({ x: rw.x - rw.w / 2 + 0.4, z: 0, w: 0.25, d: rw.d - 2 }, { x: rw.x + rw.w / 2 - 0.4, z: 0, w: 0.25, d: rw.d - 2 }); // edges
    return out;
  }, [rw]);
  const lights = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let z = -rw.d / 2 + 2; z <= rw.d / 2 - 2; z += 6) out.push({ x: rw.x - rw.w / 2 - 0.5, z }, { x: rw.x + rw.w / 2 + 0.5, z });
    return out;
  }, [rw]);
  const parked = useMemo(() => {
    const rnd = prng(7);
    const out: { x: number; z: number; c: string }[] = [];
    const cols = ['#E63946', '#1D9BF0', '#F4F1DE', '#2D2D2D', '#FFD166', '#8A96A8'];
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 8; k++) if (rnd() < 0.75) out.push({ x: ap.carPark.x - 3 + row * 3, z: ap.carPark.z - 10 + k * 2.8, c: cols[Math.floor(rnd() * cols.length)] });
    return out;
  }, [ap]);

  return (
    <group>
      {/* bridge over the lagoon */}
      <Slab r={ap.bridge} y={-0.2} h={0.32} color="#9AA0A8" />
      <Slab r={{ ...ap.bridge, d: ap.bridge.d - 2 }} y={0.1} h={0.04} color={ASPHALT} />
      {[-1, 1].map((s) => (
        <Slab key={s} r={{ x: ap.bridge.x, z: s * (ap.bridge.d / 2 - 0.2), w: ap.bridge.w, d: 0.3 }} y={0.1} h={0.9} color="#E8DCC8" />
      ))}
      {Array.from({ length: Math.max(1, Math.floor(ap.bridge.w / 8)) }, (_, i) => (
        <mesh key={i} position={[ap.bridge.x - ap.bridge.w / 2 + 4 + i * 8, -1.2, 0]}>
          <boxGeometry args={[1.2, 2.2, ap.bridge.d - 1]} />
          <meshStandardMaterial color="#8A8F96" roughness={1} />
        </mesh>
      ))}
      {/* mainland road to the bridge */}
      <Slab r={ap.road} y={-0.01} h={0.07} color={ASPHALT} rough={0.95} />
      {/* the island */}
      <Slab r={ap.island} y={-1.2} h={1.25} color={grass} />
      <Slab r={{ ...ap.island, w: ap.island.w + 1.2, d: ap.island.d + 1.2 }} y={-1.4} h={1.1} color="#D9C9A3" />
      <Slab r={ap.islandRoad} y={0.05} h={0.06} color={ASPHALT} rough={0.95} />
      <Slab r={ap.apron} y={0.05} h={0.06} color={CONCRETE} />
      <Slab r={ap.taxiway} y={0.05} h={0.07} color="#555B63" rough={0.95} />
      <Slab r={{ x: ap.taxiway.x, z: 0, w: 0.25, d: ap.taxiway.d - 2 }} y={0.12} h={0.02} color="#F4C430" />
      {[-1, 1].map((e) => (
        <Slab key={e} r={{ x: (ap.taxiway.x + rw.x) / 2, z: e * (rw.d / 2 - 8), w: rw.x - ap.taxiway.x, d: 5 }} y={0.05} h={0.07} color="#555B63" />
      ))}
      <Slab r={rw} y={0.06} h={0.08} color="#2F3338" rough={0.95} />
      <Instanced items={marks.map((m) => ({ ...m, y: 0.15, h: 0.02 }))} color="#F2F4F7" />
      <Instanced items={lights.map((l) => ({ ...l, w: 0.3, d: 0.3, y: 0.15, h: 0.3 }))} color="#FFFFFF" emissive="#FFE8A3" />
      {[-1, 1].map((e) => (
        <Text key={e} font={FONT} position={[rw.x, 0.17, e * (rw.d / 2 - 12)]} rotation={[-Math.PI / 2, 0, e > 0 ? 0 : Math.PI]} fontSize={3.2} color="#F2F4F7" anchorX="center" anchorY="middle">
          {e > 0 ? '36' : '18'}
        </Text>
      ))}
      {/* the terminal is its own walk-through hall (Terminal.tsx) */}
      {/* jet bridges to the gates */}
      {ap.gates.map((g, i) => (
        <mesh key={i} position={[(ap.terminal.x + ap.terminal.w / 2 + g.x - 4) / 2, 3.4, g.z + 2.2]} castShadow>
          <boxGeometry args={[g.x - 4 - ap.terminal.x - ap.terminal.w / 2, 1.6, 1.6]} />
          <meshStandardMaterial color="#D8DCE1" roughness={0.6} />
        </mesh>
      ))}
      {ap.gates.map((g, i) => (
        <Airliner key={i} position={[g.x, 0, g.z]} rotation={-Math.PI / 2} tail={[flag.primary, flag.secondary, flag.accent][i % 3]} />
      ))}
      {/* car park */}
      <Slab r={ap.carPark} y={0.05} h={0.06} color="#4A4F57" />
      <Instanced items={parked.map((p) => ({ x: p.x, z: p.z, w: 1.6, d: 2.6, y: 0.1, h: 0.9, c: p.c }))} />
      {/* hangar */}
      <mesh position={[ap.hangar.x, 0.05, ap.hangar.z]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ap.hangar.w / 2, ap.hangar.w / 2, ap.hangar.d, 18, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#B7BEC7" metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[ap.hangar.x + ap.hangar.w / 2 + 0.01, 2, ap.hangar.z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ap.hangar.d - 3, 3.6]} />
        <meshStandardMaterial color="#1B2436" />
      </mesh>
      {/* control tower */}
      <mesh position={[ap.tower.x, ap.tower.h / 2, ap.tower.z]} castShadow>
        <cylinderGeometry args={[ap.tower.r * 0.6, ap.tower.r, ap.tower.h, 10]} />
        <meshStandardMaterial color="#E8E4DC" roughness={0.8} />
      </mesh>
      <mesh position={[ap.tower.x, ap.tower.h + 1.2, ap.tower.z]} castShadow>
        <cylinderGeometry args={[ap.tower.r * 1.7, ap.tower.r * 1.3, 2.4, 10]} />
        <meshStandardMaterial color={flag.primary} roughness={0.1} metalness={0.5} emissive={flag.primary} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[ap.tower.x, ap.tower.h + 2.8, ap.tower.z]}>
        <cylinderGeometry args={[ap.tower.r * 1.9, ap.tower.r * 1.9, 0.5, 10]} />
        <meshStandardMaterial color="#F4F6F8" />
      </mesh>
      <mesh position={[ap.tower.x, ap.tower.h + 4, ap.tower.z]}>
        <cylinderGeometry args={[0.08, 0.08, 2, 4]} />
        <meshStandardMaterial color="#E63946" emissive="#E63946" emissiveIntensity={1.4} />
      </mesh>
      <TakeOff ap={ap} tail={flag.primary} />
    </group>
  );
}

function Instanced({ items, color, emissive }: { items: { x: number; z: number; w: number; d: number; y: number; h: number; c?: string }[]; color?: string; emissive?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, it.y + it.h / 2, it.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(it.w, it.h, it.d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      if (it.c) m.setColorAt(i, tmpColor.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} frustumCulled={false}>
      <meshStandardMaterial color={color ?? '#FFFFFF'} roughness={0.8} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 1.2 : 0} />
    </instancedMesh>
  );
}

/** A low-poly airliner, nose towards +z before `rotation`. */
export function Airliner({ position, rotation, tail, scale = 1 }: { position: [number, number, number]; rotation: number; tail: string; scale?: number }) {
  const white = <meshStandardMaterial color="#F4F6F8" flatShading roughness={0.5} />;
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.8, 11, 10]} />
        {white}
      </mesh>
      <mesh position={[0, 1.6, 6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.9, 1.6, 10]} />
        {white}
      </mesh>
      <mesh position={[0, 1.2, 0.4]} castShadow>
        <boxGeometry args={[12, 0.18, 2.4]} />
        {white}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 2.6, 0.8, 1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 1.6, 8]} />
          <meshStandardMaterial color="#9AA3AD" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 3.1, -4.8]} castShadow>
        <boxGeometry args={[0.2, 2.6, 1.8]} />
        <meshStandardMaterial color={tail} flatShading />
      </mesh>
      <mesh position={[0, 1.9, -5]} castShadow>
        <boxGeometry args={[4.4, 0.14, 1.2]} />
        {white}
      </mesh>
    </group>
  );
}

/** Every 40s a plane rolls down the runway and climbs out over the water. */
function TakeOff({ ap, tail }: { ap: Airport; tail: string }) {
  const ref = useRef<THREE.Group>(null);
  const rw = ap.runway;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime % 40;
    if (t > 26) {
      g.visible = false;
      planeSound.active = false;
      return;
    }
    g.visible = true;
    const z0 = -rw.d / 2 + 8;
    let z = z0, y = 0, pitch = 0;
    if (t > 6) {
      const s = t - 6;
      z = z0 + 1.2 * s * s; // accelerate
      const liftAt = z0 + rw.d * 0.6;
      if (z > liftAt) {
        y = (z - liftAt) * 0.22;
        pitch = -0.18;
      }
    }
    g.position.set(rw.x, y, z);
    g.rotation.set(pitch, 0, 0);
    Object.assign(planeSound, { x: rw.x, y, z, active: true, thrust: t < 6 ? 0.25 : Math.min(1, 0.6 + (t - 6) * 0.05) });
  });
  return (
    <group ref={ref}>
      <Airliner position={[0, 0, 0]} rotation={0} tail={tail} />
    </group>
  );
}
