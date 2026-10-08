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
import { AirportScene } from './Airport';
import { placementSite } from '@/lib/world/placement';
import { palmSpots } from '@/lib/world/scatter';
import { spurRoads } from '@/lib/world/ground';
import {
  DISTRICTS, RING_ROAD_W, RING_SLOTS, airportLayout, billboardSpots, ringRoadRadius, slotAngle, venueRingRadius, type Rect,
} from '@/lib/world/layout';
import { traffic, type TrafficCar } from '@/lib/audio/state';
import { TreeField, type TreeItem } from './Trees';
import { withDetail } from './groundDetail';

// Everything around the post city that makes it a city: the ring road and its traffic, spur roads,
// district names on the ground, billboards, palms, and the airport island with its bridge.

const FONT = '/fonts/inter-600.woff';
const ASPHALT = '#3E434C';
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
