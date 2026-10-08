'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { DANCE_FLOORS, type WalkIn } from '@/lib/world/interiors';
import { beat } from './clubAudio';
import {
  Beams, Bulbs, Decks, FLOOR_Y as F, Kit, LedFloor, LedWall, Neon, Npc, ball, bottleWall, box, cone, cyl, palm, sagLine, stool,
  type Beam, type Part,
} from './clubKit';

// The city's clubs, each built in the venue's own frame (door at +z, facing the ring road) and sized for a crowd:
// - Club Moon: the flagship. Stage with a DJ booth and LED wall, a 10 x 10 LED floor under a lighting truss, the bar
//   down the left wall, VIP booths behind a rail, a lounge, a chill room with the toilets, a queue and a bouncer.
// - Afro Yard: afrobeats in an open-air garden. Live band stage, a round light-up floor, string lights, palms.
// - Warehouse 404: techno in concrete. A shipping-container DJ booth, speaker walls, lasers and strobes.
// - Velvet Room: a jazz bar. A trio on a low stage, candlelit tables, a brass bar.
// - Sunset Beach Club: on the shore. Sand, a pool, cabanas, a tiki bar, a DJ hut and torches.
// Static props are merged per club (clubKit.tsx), so each club costs a handful of draw calls plus its people.

export const CLUB_PALETTES: Record<string, string[]> = {
  club: ['#FF2E88', '#00E5FF', '#FFD60A', '#7B2CFF', '#00F5A0', '#FF6B00'],
  yard: ['#FF9F1C', '#FFBF69', '#2EC4B6', '#E71D36', '#FFD60A', '#3A86FF'],
  warehouse: ['#FF1E3C', '#FFFFFF', '#FF1E3C', '#00FF85'],
  jazz: ['#FFB347', '#4CC9F0', '#FFD089'],
  beach: ['#FF6F91', '#FFC75F', '#00C9A7', '#845EC2', '#F9F871'],
};

/** Centre of Club Moon's LED floor, and of Afro Yard's round one. */
// the dance floors are shared with lib/world/ground.ts, so feet land on the tiles
const MOON = DANCE_FLOORS.club, YARD = DANCE_FLOORS.yard, BEACH = DANCE_FLOORS.beach;
const MOON_FLOOR: [number, number] = [MOON.x, MOON.z];

/** The flagship wears its country's colours: gold lights in Club Yellow, green in Club Sherwood. */
const FLAGSHIP_PALETTES: Record<string, string[]> = {
  bnb: ['#F3BA2F', '#FCD535', '#FFFFFF', '#F0B90B', '#FF8C00'],
  robinhood: ['#00C805', '#CCFF00', '#21CE99', '#E8FFD0', '#00A805'],
};

// ------------------------------------------------------------------ Club Moon

export function ClubMoon({ k, country }: { k: WalkIn; country?: string | null }) {
  const pal = (country && FLAGSHIP_PALETTES[country]) || CLUB_PALETTES.club;
  const bt = () => beat('club');
  const back = -k.d / 2 + 0.4;
  const left = -k.w / 2 + 0.4;
  const right = k.w / 2 - 0.4;
  const front = k.d / 2 - 0.4;
  const stageTop = F + 0.7;
  const trussY = F + 6.0;
  const T = 6.4; // half the truss square

  const { parts, glow } = useMemo(() => {
    const parts: Part[] = [];
    const glow: Part[] = [];
    // stage, DJ booth, speaker stacks
    parts.push(box([0, F + 0.35, -9.6], [12.4, 0.7, 4.4], '#17141F'));
    glow.push(box([0, F + 0.71, -7.38], [12.4, 0.06, 0.08], '#FF2E88'));
    parts.push(box([0, stageTop + 0.55, -9.2], [4.2, 1.1, 1.2], '#0F0F14'));
    glow.push(box([0, stageTop + 1.12, -9.2], [4.3, 0.05, 1.25], '#FF2E88'), box([0, stageTop + 0.55, -8.58], [4.0, 0.08, 0.02], '#00E5FF'));
    for (const s of [-1, 1]) {
      const x = s * 7.6;
      parts.push(box([x, F + 1.7, -10], [1.8, 3.4, 1.5], '#111216'));
      for (const y of [0.7, 1.7, 2.7]) parts.push(cyl([x, F + y, -9.24], 0.95, 0.06, '#2A2A2A', [Math.PI / 2, 0, 0]));
      parts.push(box([x, F + 4.2, -10], [1.4, 1.6, 1.2], '#111216'));
    }
    // LED wall frame
    parts.push(box([0, stageTop + 2.2, back + 0.15], [12, 4.6, 0.3], '#0B0B10'));
    // the bar: counter, foot rail, back bar with bottles, stools
    parts.push(box([-12.1, F + 0.55, -2.5], [1.1, 1.1, 11], '#2A1838'));
    glow.push(box([-12.1, F + 1.13, -2.5], [1.2, 0.06, 11.1], '#00E5FF'), box([-11.52, F + 0.15, -2.5], [0.04, 0.06, 11], '#FF2E88'));
    parts.push(box([left + 0.3, F + 0.5, -2.5], [0.6, 1.0, 11], '#1C1226'));
    parts.push(...bottleWall(left + 0.25, -2.5, 10, 3, false, '#3A2A22'));
    for (let i = 0; i < 7; i++) parts.push(...stool(-11.0, -7.4 + i * 1.6, '#FF2E88'));
    // VIP: carpet, rail with gold posts, three U-shaped booths with tables, bottles and sparklers
    parts.push(box([11.9, F + 0.012, -4.6], [5.6, 0.02, 8.6], '#3B0F2E'));
    parts.push(box([8.6, F + 1.0, -4.6], [0.08, 0.08, 8.4], '#C9A227'));
    for (let z = -8.8; z <= -0.4; z += 2.1) parts.push(cyl([8.6, F + 0.5, z], 0.12, 1.0, '#C9A227'));
    for (const z of [-7.6, -4.6, -1.6]) {
      parts.push(box([right - 0.3, F + 0.6, z], [0.6, 1.2, 2.6], '#5A0F3C'), box([right - 1.0, F + 0.25, z], [1.4, 0.5, 2.6], '#7A1650'));
      for (const s of [-1, 1]) parts.push(box([right - 1.5, F + 0.35, z + s * 1.15], [2.4, 0.7, 0.4], '#7A1650'));
      parts.push(cyl([11.3, F + 0.38, z], 1.0, 0.06, '#C9A227'), cyl([11.3, F + 0.19, z], 0.14, 0.38, '#C9A227'));
      parts.push(cyl([11.2, F + 0.58, z - 0.15], 0.14, 0.36, '#0F3D1C'), cyl([11.45, F + 0.52, z + 0.2], 0.22, 0.24, '#D9E3EA'));
      glow.push(cyl([11.2, F + 0.86, z - 0.15], 0.03, 0.22, '#FFF4B0'));
    }
    // lounge, front left: rug, two sofas facing over a coffee table, floor lamps, plants
    parts.push(box([-10, F + 0.012, 8.4], [7.6, 0.02, 5.2], '#2B2247'));
    for (const s of [-1, 1]) {
      const z = 8.4 + s * 1.7;
      parts.push(box([-10, F + 0.25, z], [4.4, 0.5, 1.0], '#4C2A85'), box([-10, F + 0.7, z + s * 0.4], [4.4, 0.6, 0.25], '#4C2A85'));
    }
    parts.push(box([-10, F + 0.22, 8.4], [2.2, 0.44, 1.0], '#1C1C24'));
    for (const x of [-13.6, -6.6]) {
      parts.push(cyl([x, F + 0.8, 10.6], 0.06, 1.6, '#5A5F68'));
      glow.push(cyl([x, F + 1.7, 10.6], 0.5, 0.35, '#FFB347'));
    }
    parts.push(cyl([-14, F + 0.3, 5.6], 0.6, 0.6, '#8B6B4A'), ball([-14, F + 1.0, 5.6], 1.0, '#2E7D32'));
    // chill room and toilets, front right: partitions (also solid), bean bags, water cooler, two WC doors, mirror
    const ph = 3.0;
    parts.push(box([8.1, F + ph / 2, 5.8], [2.2, ph, 0.3], '#2A2140'), box([12.6, F + ph / 2, 5.8], [4.0, ph, 0.3], '#2A2140'), box([7.1, F + ph / 2, 8.7], [0.3, ph, 5.8], '#2A2140'));
    glow.push(box([10.2, F + ph + 0.05, 5.8], [7.6, 0.08, 0.34], '#00F5A0'));
    for (const [x, z, c] of [[8.4, 9.6, '#00B4D8'], [9.8, 10.6, '#FF6B00'], [11.0, 9.2, '#7B2CFF']] as [number, number, string][]) parts.push(ball([x, F + 0.3, z], 1.0, c));
    parts.push(box([8.0, F + 0.5, 7.0], [0.5, 1.0, 0.5], '#E8ECEF'), cyl([8.0, F + 1.2, 7.0], 0.35, 0.5, '#7FD1FF'));
    for (const z of [7.4, 10.0]) {
      parts.push(box([right - 0.06, F + 1.1, z], [0.08, 2.2, 1.1], '#C8CED6'));
      glow.push(box([right - 0.12, F + 2.45, z], [0.04, 0.3, 0.6], '#FFFFFF'));
    }
    parts.push(box([12.6, F + 1.4, 5.98], [3.0, 1.0, 0.04], '#BFD9E8'));
    // lighting truss over the floor
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box([MOON_FLOOR[0] + sx * T, (F + trussY) / 2, MOON_FLOOR[1] + sz * T], [0.22, trussY - F, 0.22], '#5A5F68'));
    for (const s of [-1, 1]) {
      parts.push(box([MOON_FLOOR[0], trussY, MOON_FLOOR[1] + s * T], [2 * T + 0.3, 0.28, 0.28], '#5A5F68'));
      parts.push(box([MOON_FLOOR[0] + s * T, trussY, MOON_FLOOR[1]], [0.28, 0.28, 2 * T + 0.3], '#5A5F68'));
    }
    // neon trim around the room at head height, and the queue outside: red carpet, gold posts and rope
    glow.push(box([0, F + 3.4, back + 0.05], [k.w - 1, 0.08, 0.04], '#7B2CFF'), box([left + 0.05, F + 3.4, 0], [0.04, 0.08, k.d - 1], '#7B2CFF'), box([right - 0.05, F + 3.4, -3], [0.04, 0.08, k.d - 7], '#7B2CFF'));
    parts.push(box([0, F - 0.005, front + 2.6], [3, 0.02, 4.6], '#9B1B30'));
    for (let i = 0; i < 6; i++) {
      const x = 4.6 + i * 1.4;
      parts.push(cyl([x, F + 0.5, front + 1.6], 0.1, 1.0, '#C9A227'), cyl([x, F + 0.05, front + 1.6], 0.36, 0.08, '#C9A227'));
      if (i < 5) parts.push(cyl([x + 0.7, F + 0.82, front + 1.6], 0.06, 1.3, '#B71C1C', [0, 0, Math.PI / 2]));
    }
    return { parts, glow };
  }, [k, back, left, right, front, stageTop, trussY]);

  const beams = useMemo<Beam[]>(
    () => [-4.8, -1.6, 1.6, 4.8].flatMap((x) => [-T, T].map((z) => ({ p: [MOON_FLOOR[0] + x, trussY - 0.2, MOON_FLOOR[1] + z] as [number, number, number], len: 5.6, width: 1.9 }))),
    [trussY],
  );
  // lasers: thin beams fanning out from the front of the stage
  const lasers = useMemo<Beam[]>(() => [-4, -2, 0, 2, 4].map((x) => ({ p: [x, stageTop + 3.6, -8.2] as [number, number, number], len: 14, width: 0.05 })), [stageTop]);
  const mirror = useRef<THREE.Mesh>(null);
  const lA = useRef<THREE.PointLight>(null);
  const lB = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const b = beat('club');
    const bar = Math.floor(b / 4);
    const pulse = Math.pow(1 - (b % 1), 3);
    if (mirror.current) mirror.current.rotation.y = clock.elapsedTime * 0.8;
    if (lA.current) {
      lA.current.color.set(pal[bar % pal.length]);
      lA.current.intensity = 10 + pulse * 26;
    }
    if (lB.current) {
      lB.current.color.set(pal[(bar + 3) % pal.length]);
      lB.current.intensity = 10 + (1 - pulse) * 16;
    }
  });

  return (
    <group>
      <Kit parts={parts} glow={glow} />
      <LedFloor floor={MOON} palette={pal} beat={bt} />
      <LedWall at={[0, stageTop + 0.15, back + 0.34]} w={11.4} h={4.2} bars={24} palette={pal} beat={bt} />
      <Decks position={[0, stageTop + 1.18, -9.2]} accent="#FF2E88" />
      <Beams beams={beams} palette={pal} beat={bt} />
      <Beams beams={lasers} palette={['#00F5A0', '#FF2E88', '#00E5FF']} beat={bt} sway={0.9} speed={1.6} strength={1.6} flicker />
      <mesh ref={mirror} position={[MOON_FLOOR[0], trussY - 1.1, MOON_FLOOR[1]]} castShadow>
        <icosahedronGeometry args={[0.75, 1]} />
        <meshStandardMaterial color="#E8E8F0" metalness={1} roughness={0.12} flatShading emissive="#8888AA" emissiveIntensity={0.5} />
      </mesh>
      <pointLight ref={lA} position={[MOON_FLOOR[0] - 3, F + 3.5, MOON_FLOOR[1]]} distance={20} decay={1.5} />
      <pointLight ref={lB} position={[MOON_FLOOR[0] + 3, F + 3.5, MOON_FLOOR[1]]} distance={20} decay={1.5} />
      <Neon text="BAR" position={[left + 0.08, F + 4.1, -2.5]} rotation={[0, Math.PI / 2, 0]} size={1.0} color="#00E5FF" />
      <Neon text="VIP" position={[right - 0.08, F + 3.0, -4.6]} rotation={[0, -Math.PI / 2, 0]} size={1.0} color="#FFD60A" />
      <Neon text="CHILL ROOM · WC" position={[10.2, F + 3.5, 5.6]} rotation={[0, Math.PI, 0]} size={0.42} color="#00F5A0" />
      {/* the people: resident DJ, bar staff, the crowd, VIP, the door */}
      <Npc seed="dj-selene" act="dance" position={[0, stageTop, -9.95]} name="DJ Selene" nameColor="#FF2E88" />
      <Npc seed="moon-barman" act={null} position={[-13.3, F, -3.5]} rot={Math.PI / 2} />
      <Npc seed="club-ada" act="dance" position={[-2.4, F, -3.2]} rot={0.4} />
      <Npc seed="club-tunde" act="dance" position={[2.0, F, -0.4]} rot={-0.6} />
      <Npc seed="club-zee" act="dance" position={[0.4, F, -5.0]} rot={3} />
      <Npc seed="club-kola" act="dance" position={[-3.2, F, 1.4]} rot={2.2} />
      <Npc seed="club-bisola" act="selfie" position={[-10.8, F, 1.8]} rot={Math.PI / 2} />
      <Npc seed="moon-vip" act="dance" position={[10.6, F, -4.6]} rot={-Math.PI / 2} />
      <Npc seed="moon-bouncer" act={null} position={[-3.8, F, front + 1.2]} rot={0} />
      <Npc seed="moon-queue-a" act={null} position={[5.3, F, front + 2.4]} rot={-Math.PI / 2} />
      <Npc seed="moon-queue-b" act="selfie" position={[7.0, F, front + 2.4]} rot={-Math.PI / 2} />
    </group>
  );
}

// ------------------------------------------------------------------ Afro Yard

export function AfroYard({ k }: { k: WalkIn }) {
  const pal = CLUB_PALETTES.yard;
  const bt = () => beat('afro');
  const back = -k.d / 2 + 0.4, left = -k.w / 2 + 0.4, right = k.w / 2 - 0.4, front = k.d / 2 - 0.4;
  const stageTop = F + 0.8;
  const { parts, glow, bulbs } = useMemo(() => {
    const parts: Part[] = [];
    const glow: Part[] = [];
    // hedges along the top of the garden walls
    for (const [x, z, w, d] of [[0, back, k.w, 0.7], [left, 0, 0.7, k.d], [right, 0, 0.7, k.d]] as [number, number, number, number][]) parts.push(box([x, F + k.h + 0.3, z], [w, 0.6, d], '#2F6B2F'));
    // stage with a woven backdrop in stripes
    parts.push(box([0, F + 0.4, -7], [10.4, 0.8, 3.4], '#5D3A1A'));
    glow.push(box([0, F + 0.81, -5.28], [10.4, 0.05, 0.08], '#FF9F1C'));
    const stripes = ['#FF9F1C', '#1B5E20', '#FFD60A', '#0B0E14', '#E71D36'];
    for (let i = 0; i < 20; i++) parts.push(box([-4.75 + i * 0.5, stageTop + 1.6, back + 0.2], [0.5, 3.2, 0.1], stripes[i % stripes.length]));
    // band: drum kit, talking drum, DJ table, amps
    parts.push(cyl([2.6, stageTop + 0.3, -7.2], 0.7, 0.6, '#B71C1C', [Math.PI / 2, 0, 0]), cyl([2.0, stageTop + 0.7, -6.8], 0.45, 0.3, '#ECEFF1'), cyl([3.2, stageTop + 0.7, -6.8], 0.45, 0.3, '#ECEFF1'));
    parts.push(cyl([3.6, stageTop + 1.1, -7.4], 0.6, 0.03, '#C9A227'), cyl([3.6, stageTop + 0.55, -7.4], 0.04, 1.1, '#888'));
    parts.push(cyl([-3.0, stageTop + 0.45, -6.9], 0.4, 0.8, '#8B5A2B'));
    parts.push(box([-0.5, stageTop + 0.5, -7.0], [2.6, 1.0, 0.9], '#1A1A1A'));
    glow.push(box([-0.5, stageTop + 1.02, -7.0], [2.7, 0.04, 0.95], '#FF9F1C'));
    for (const s of [-1, 1]) parts.push(box([s * 6.4, F + 1.2, -7.4], [1.4, 2.4, 1.2], '#141414'));
    // bar with a thatched roof
    parts.push(box([10.6, F + 0.55, -1.5], [1.1, 1.1, 8], '#6D4C2F'));
    glow.push(box([10.6, F + 1.12, -1.5], [1.2, 0.05, 8.1], '#FFBF69'));
    parts.push(...bottleWall(right - 0.25, -1.5, 7, 2, false, '#4E342E'));
    parts.push(box([10.9, F + 3.1, -1.5], [3.2, 0.25, 9], '#C8A26B', [0, 0, -0.18]));
    for (const z of [-5.3, 2.3]) parts.push(cyl([9.7, F + 1.5, z], 0.16, 3.0, '#6D4C2F'));
    for (let i = 0; i < 5; i++) parts.push(...stool(9.6, -4.6 + i * 1.6, '#FF9F1C'));
    // high tables and palms
    for (const [x, z] of [[-8.5, 4.5], [-8.5, 0.5], [-4, 6.4], [4.5, 6.4], [6.5, 2.6]]) {
      parts.push(cyl([x, F + 0.55, z], 0.12, 1.1, '#3A3A3A'), cyl([x, F + 1.1, z], 0.9, 0.06, '#6D4C2F'));
      glow.push(cyl([x, F + 1.2, z], 0.12, 0.14, '#FFD089'));
    }
    parts.push(...palm(-10.4, -6.8, 5.2, 0.3), ...palm(left + 1.2, 7.2, 4.6, 1.1), ...palm(8.6, 7.0, 4.8, 2.2), ...palm(-6.8, -7.6, 4.4, 3.1));
    // string-light poles and the lines between them
    const poles: [number, number][] = [[-9, -4.6], [7.6, -4.6], [-9, 5.6], [7.6, 5.6]];
    for (const [x, z] of poles) parts.push(cyl([x, F + 2.4, z], 0.14, 4.8, '#3A3A3A'));
    const top = F + 4.7;
    const bulbs = [
      ...sagLine([-9, top, -4.6], [7.6, top, 5.6], 22, 0.9),
      ...sagLine([7.6, top, -4.6], [-9, top, 5.6], 22, 0.9),
      ...sagLine([-9, top, -4.6], [7.6, top, -4.6], 18, 0.6),
      ...sagLine([-9, top, 5.6], [7.6, top, 5.6], 18, 0.6),
      ...sagLine([-9, top, -4.6], [-9, top, 5.6], 12, 0.5),
      ...sagLine([7.6, top, -4.6], [7.6, top, 5.6], 12, 0.5),
    ];
    // gate posts with lanterns
    for (const s of [-1, 1]) {
      parts.push(box([s * (k.door / 2 + 0.5), F + 1.2, front + 0.3], [0.5, 2.4, 0.5], '#6D4C2F'));
      glow.push(ball([s * (k.door / 2 + 0.5), F + 2.6, front + 0.3], 0.4, '#FFB347'));
    }
    return { parts, glow, bulbs };
  }, [k, back, left, right, front, stageTop]);
  const pars = useMemo<Beam[]>(() => [-4, -1.4, 1.4, 4].map((x) => ({ p: [x, F + 0.9, -5.2] as [number, number, number], len: 6, width: 1.0 })), []);
  return (
    <group>
      <Kit parts={parts} glow={glow} roughness={0.8} />
      <LedFloor floor={YARD} palette={pal} beat={bt} />
      <Bulbs at={bulbs} palette={['#FFD089', '#FFB347', '#FFE5B4', '#FF9F1C']} size={0.12} beat={bt} />
      <Beams beams={pars} palette={pal} beat={bt} up sway={0.35} speed={0.6} strength={0.16} />
      <Neon text="AFRO YARD" position={[0, stageTop + 3.6, back + 0.3]} size={0.8} color="#FFBF69" />
      <Npc seed="dj-ayo" act="dance" position={[-0.5, stageTop, -7.7]} name="DJ Ayo" nameColor="#FF9F1C" />
      <Npc seed="yard-drummer" act={null} position={[2.6, stageTop, -7.9]} />
      <Npc seed="yard-talkingdrum" act="dance" position={[-3.0, stageTop, -7.6]} />
      <Npc seed="yard-barman" act={null} position={[right - 0.9, F, -1]} rot={-Math.PI / 2} />
      <Npc seed="yard-funke" act="dance" position={[-2.2, F, 1.2]} rot={0.8} />
      <Npc seed="yard-obi" act="dance" position={[0.6, F, -1.4]} rot={-2.4} />
      <Npc seed="yard-tolu" act="selfie" position={[-8.0, F, 2.6]} rot={Math.PI / 2} />
    </group>
  );
}

// ------------------------------------------------------------------ Warehouse 404

export function Warehouse({ k }: { k: WalkIn }) {
  const pal = CLUB_PALETTES.warehouse;
  const bt = () => beat('techno');
  const back = -k.d / 2 + 0.4, left = -k.w / 2 + 0.4, right = k.w / 2 - 0.4;
  const rigY = F + 6.2;
  const { parts, glow, strobes } = useMemo(() => {
    const parts: Part[] = [];
    const glow: Part[] = [];
    // the shipping container booth: open at the front, ribbed, the decks inside
    const cz = -6.9, ch = 2.8;
    parts.push(box([0, F + ch + 0.08, cz], [7.2, 0.16, 3.0], '#8E2A20'), box([0, F + ch / 2, cz - 1.42], [7.2, ch, 0.16], '#A33224'));
    for (const s of [-1, 1]) parts.push(box([s * 3.52, F + ch / 2, cz], [0.16, ch, 3.0], '#A33224'));
    for (let i = 0; i < 18; i++) parts.push(box([-3.4 + i * 0.4, F + ch / 2, cz - 1.52], [0.12, ch, 0.06], '#7A241B'));
    parts.push(box([0, F + 0.5, cz + 0.4], [3.6, 1.0, 0.9], '#141414'));
    glow.push(box([0, F + 1.02, cz + 0.4], [3.7, 0.04, 0.95], '#FF1E3C'), box([0, F + ch - 0.1, cz + 1.4], [7.0, 0.08, 0.08], '#FF1E3C'));
    // speaker walls
    for (const s of [-1, 1]) for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const x = s * (8.2 + c * 1.3), y = F + 0.8 + r * 1.6;
      parts.push(box([x, y, -7.2], [1.25, 1.55, 1.3], '#0E0E0E'), cyl([x, y, -6.53], 0.9, 0.05, '#262626', [Math.PI / 2, 0, 0]));
    }
    // concrete pillars, industrial lamps, the rig
    for (const [x, z] of [[-5, -1], [5, -1], [-5, 4.5], [5, 4.5]]) parts.push(box([x, F + k.h / 2, z], [0.8, k.h, 0.8], '#6B6E73'));
    for (let x = -9; x <= 9; x += 4.5) parts.push(box([x, rigY, 0], [0.2, 0.2, k.d - 2], '#3A3D42'));
    parts.push(box([0, rigY, -4], [k.w - 2, 0.2, 0.2], '#3A3D42'), box([0, rigY, 3], [k.w - 2, 0.2, 0.2], '#3A3D42'));
    // bar on the left in concrete, red neon underneath
    parts.push(box([-10.3, F + 0.55, 1], [1.0, 1.1, 7], '#55585D'));
    glow.push(box([-9.78, F + 0.12, 1], [0.04, 0.08, 7], '#FF1E3C'));
    parts.push(...bottleWall(left + 0.25, 1, 6, 2, false, '#2B2C2F'));
    for (let i = 0; i < 4; i++) parts.push(...stool(-9.3, -1.2 + i * 1.5, '#FF1E3C'));
    // floor markings: hazard stripes at the edge of the booth, and a fog machine
    for (let i = 0; i < 9; i++) parts.push(box([-4 + i, F + 0.005, -5.0], [0.5, 0.01, 0.4], i % 2 ? '#111' : '#F2C200', [0, 0.6, 0]));
    parts.push(box([6.0, F + 0.25, -5.4], [0.9, 0.5, 0.6], '#222'));
    // graffiti panels on the side walls
    const tags = ['#FF1E3C', '#00FF85', '#3A86FF', '#FFD60A'];
    for (let i = 0; i < 4; i++) parts.push(box([right - 0.05, F + 2.2 + (i % 2) * 0.6, -5 + i * 3.2], [0.05, 1.4, 2.4], tags[i], [0.08 * (i - 1.5), 0, 0]));
    // strobes along the rig
    const strobes: [number, number, number][] = [];
    for (let x = -9; x <= 9; x += 4.5) for (const z of [-4, 3]) strobes.push([x, rigY - 0.3, z]);
    return { parts, glow, strobes };
  }, [k, left, right, rigY]);
  const lasers = useMemo<Beam[]>(() => Array.from({ length: 10 }, (_, i) => ({ p: [-3.2 + i * 0.7, F + 2.95, -5.5] as [number, number, number], len: 16, width: 0.05 })), []);
  const heads = useMemo<Beam[]>(() => [-6.75, -2.25, 2.25, 6.75].flatMap((x) => [-4, 3].map((z) => ({ p: [x, rigY - 0.2, z] as [number, number, number], len: 6.2, width: 1.2 }))), [rigY]);
  return (
    <group>
      <Kit parts={parts} glow={glow} roughness={0.9} />
      <Beams beams={lasers} palette={['#FF1E3C', '#00FF85']} beat={bt} sway={1.0} speed={2.1} strength={1.8} flicker />
      <Beams beams={heads} palette={['#FFFFFF', '#FF1E3C']} beat={bt} sway={0.45} speed={1.3} strength={0.15} />
      <Bulbs at={strobes} palette={['#FFFFFF']} size={0.55} beat={bt} mode="strobe" />
      <Neon text="404" position={[left + 0.08, F + 3.6, 1]} rotation={[0, Math.PI / 2, 0]} size={1.6} color="#FF1E3C" />
      <Neon text="NO PHONES ON THE FLOOR" position={[0, F + 3.6, back + 0.08]} size={0.45} color="#FFFFFF" />
      <Npc seed="dj-krnl" act="dance" position={[0, F, -7.6]} name="KRNL" nameColor="#FF1E3C" />
      <Npc seed="wh-barman" act={null} position={[left + 0.9, F, 0]} rot={Math.PI / 2} />
      <Npc seed="wh-raver-a" act="dance" position={[-1.8, F, -2.2]} rot={0.3} />
      <Npc seed="wh-raver-b" act="dance" position={[1.6, F, -1.0]} rot={-0.2} />
      <Npc seed="wh-raver-c" act="dance" position={[0.2, F, 1.6]} rot={2.9} />
      <Npc seed="wh-raver-d" act="dance" position={[-3.0, F, 2.4]} rot={2.5} />
    </group>
  );
}

// ------------------------------------------------------------------ Velvet Room

export function VelvetRoom({ k }: { k: WalkIn }) {
  const bt = () => beat('jazz');
  const back = -k.d / 2 + 0.4, left = -k.w / 2 + 0.4, right = k.w / 2 - 0.4;
  const stageTop = F + 0.5;
  const { parts, glow } = useMemo(() => {
    const parts: Part[] = [];
    const glow: Part[] = [];
    // stage and a red velvet curtain in folds
    parts.push(box([-2, F + 0.25, -5.2], [8.4, 0.5, 2.8], '#4A2C1A'));
    glow.push(box([-2, F + 0.51, -3.82], [8.4, 0.04, 0.06], '#FFB347'));
    for (let i = 0; i < 22; i++) parts.push(cyl([-6.0 + i * 0.38, F + 2.3, back + 0.2], 0.42, 4.2, i % 2 ? '#7A0F1E' : '#8E1426'));
    // grand piano, upright bass, mic
    parts.push(box([-4.6, stageTop + 0.75, -5.4], [1.5, 0.35, 2.1], '#0B0B0D'), box([-4.6, stageTop + 1.2, -5.7], [1.5, 0.05, 1.6], '#0B0B0D', [0.6, 0, 0]));
    for (const [dx, dz] of [[-0.6, -0.9], [0.6, -0.9], [0, 0.9]]) parts.push(cyl([-4.6 + dx, stageTop + 0.3, -5.4 + dz], 0.1, 0.6, '#0B0B0D'));
    parts.push(box([-4.6, stageTop + 0.62, -4.25], [1.4, 0.08, 0.3], '#F5F0E6'));
    parts.push(box([-1.3, stageTop + 0.95, -5.6], [0.6, 1.3, 0.25], '#7B3F1D'), box([-1.3, stageTop + 1.95, -5.6], [0.12, 0.8, 0.1], '#3A1F0F'));
    parts.push(cyl([1.1, stageTop + 0.8, -4.4], 0.04, 1.6, '#AAAAAA'), ball([1.1, stageTop + 1.62, -4.4], 0.12, '#333'));
    // round tables with candles and two chairs each
    for (const [x, z] of [[-5.5, -0.4], [-2.2, 0.6], [1.6, -0.6], [4.2, 1.8], [-5.0, 3.4], [-1.2, 4.0], [2.6, 4.6]]) {
      parts.push(cyl([x, F + 0.37, z], 1.0, 0.05, '#2B1B12'), cyl([x, F + 0.18, z], 0.1, 0.36, '#C9A227'));
      glow.push(cyl([x, F + 0.47, z], 0.09, 0.14, '#FFD089'));
      for (const s of [-1, 1]) parts.push(box([x + s * 0.85, F + 0.25, z], [0.45, 0.06, 0.45], '#5A1A2A'), box([x + s * 1.06, F + 0.5, z], [0.06, 0.5, 0.45], '#5A1A2A'));
    }
    // brass bar on the right
    parts.push(box([7.3, F + 0.55, -1.2], [1.0, 1.1, 6.5], '#3B2A20'));
    parts.push(box([7.3, F + 1.13, -1.2], [1.1, 0.06, 6.6], '#C9A227'));
    parts.push(...bottleWall(right - 0.25, -1.2, 6, 3, false, '#2B1B12'));
    for (let i = 0; i < 4; i++) parts.push(...stool(6.4, -3.6 + i * 1.6, '#7A0F1E'));
    for (const z of [-3.6, -1.2, 1.2]) {
      parts.push(cyl([7.0, F + 3.5, z], 0.02, 1.6, '#333'));
      glow.push(cone([7.0, F + 2.6, z], 0.45, 0.35, '#FFB347'));
    }
    // wall sconces and a framed poster wall
    for (const z of [-3, 1, 5]) glow.push(box([left + 0.06, F + 2.4, z], [0.08, 0.35, 0.25], '#FFB347'));
    for (let i = 0; i < 3; i++) parts.push(box([left + 0.05, F + 2.2, -1 + i * 2], [0.04, 1.1, 0.8], ['#1B4965', '#5A1A2A', '#C9A227'][i]));
    return { parts, glow };
  }, [back, left, right, stageTop]);
  const spots = useMemo<Beam[]>(() => [-4.6, -1.3, 1.1].map((x) => ({ p: [x, F + k.h + 0.2, -3.2] as [number, number, number], len: 5.4, width: 1.1 })), [k.h]);
  return (
    <group>
      <Kit parts={parts} glow={glow} roughness={0.75} />
      <Beams beams={spots} palette={['#FFD089', '#FFB347', '#4CC9F0']} beat={bt} sway={0.12} speed={0.4} strength={0.13} />
      <Neon text="VELVET ROOM" position={[-2, F + 4.0, back + 0.75]} size={0.5} color="#4CC9F0" />
      <Npc seed="jazz-pianist" act={null} position={[-4.6, stageTop, -3.85]} rot={Math.PI} name="The Lamports Trio" nameColor="#4CC9F0" />
      <Npc seed="jazz-bassist" act="dance" position={[-1.6, stageTop, -5.1]} />
      <Npc seed="jazz-singer" act="dance" position={[1.1, stageTop, -4.9]} />
      <Npc seed="jazz-barman" act={null} position={[right - 0.9, F, -1.2]} rot={-Math.PI / 2} />
      <Npc seed="jazz-couple-a" act="dance" position={[-0.4, F, 2.2]} rot={0.6} />
      <Npc seed="jazz-couple-b" act="dance" position={[0.3, F, 2.8]} rot={-2.5} />
    </group>
  );
}

// ------------------------------------------------------------------ Sunset Beach Club

export function BeachClub({ k }: { k: WalkIn }) {
  const pal = CLUB_PALETTES.beach;
  const bt = () => beat('beach');
  const back = -k.d / 2 + 0.4, left = -k.w / 2 + 0.4, right = k.w / 2 - 0.4, front = k.d / 2 - 0.4;
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = water.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 1.7) * 0.15;
  });
  const { parts, glow, lanterns } = useMemo(() => {
    const parts: Part[] = [];
    const glow: Part[] = [];
    // sand runs out the back to the water
    parts.push(box([0, 0.12, -k.d / 2 - 4], [k.w + 8, 0.08, 8], '#E8D3A2'));
    // DJ hut on a deck, thatched roof
    parts.push(box([0, F + 0.3, -7.2], [5, 0.6, 2.6], '#8B6B4A'));
    for (const [x, z] of [[-2.3, -8.3], [2.3, -8.3], [-2.3, -6.1], [2.3, -6.1]]) parts.push(cyl([x, F + 1.8, z], 0.18, 3.0, '#6D4C2F'));
    parts.push(cone([0, F + 3.9, -7.2], 7.4, 1.6, '#C8A26B', [0, Math.PI / 4, 0]));
    parts.push(box([0, F + 1.1, -6.3], [3.2, 0.9, 0.7], '#2B2B2B'));
    glow.push(box([0, F + 1.57, -6.3], [3.3, 0.04, 0.75], '#FF6F91'));
    // pool: tiled rim and loungers along the front of it
    parts.push(box([5.5, F + 0.1, -1.2], [7.4, 0.2, 5.0], '#F5F5F0'));
    for (let i = 0; i < 4; i++) {
      const x = 2.6 + i * 2.0;
      parts.push(box([x, F + 0.3, 2.6], [0.8, 0.12, 2.0], '#FFFFFF', [0.12, 0, 0]), box([x, F + 0.15, 2.6], [0.7, 0.3, 1.8], '#D9D9D9'));
      parts.push(cyl([x + 0.6, F + 1.2, 3.4], 0.05, 2.4, '#DDD'), cone([x + 0.6, F + 2.5, 3.4], 1.9, 0.5, ['#FF6F91', '#00C9A7', '#FFC75F', '#845EC2'][i]));
    }
    // cabanas at the back right: posts, white canopy, daybed
    for (const x of [6.2, 9.6]) {
      for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) parts.push(cyl([x + dx, F + 1.25, -7.0 + dz], 0.12, 2.5, '#F5F0E6'));
      parts.push(box([x, F + 2.55, -7.0], [2.9, 0.08, 2.5], '#FFFFFF'), box([x, F + 0.3, -7.0], [2.2, 0.6, 1.8], '#F5F0E6'), box([x, F + 0.65, -7.0], [2.0, 0.12, 1.6], '#00C9A7'));
    }
    // tiki bar on the left
    parts.push(box([-9.8, F + 0.55, -0.5], [1.1, 1.1, 7], '#7A5C3E'));
    glow.push(box([-9.8, F + 1.12, -0.5], [1.2, 0.05, 7.1], '#FFC75F'));
    parts.push(box([-10.6, F + 2.8, -0.5], [3.0, 0.25, 8.4], '#C8A26B', [0, 0, 0.2]));
    for (const z of [-3.8, 2.8]) parts.push(cyl([-9.0, F + 1.4, z], 0.16, 2.8, '#6D4C2F'));
    parts.push(...bottleWall(left + 0.25, -0.5, 6, 2, false, '#6D4C2F'));
    for (let i = 0; i < 4; i++) parts.push(...stool(-8.8, -2.8 + i * 1.5, '#00C9A7'));
    // palms, beach balls, a surfboard by the gate
    parts.push(...palm(left + 1.4, -7.4, 5.6, 0.4), ...palm(-6.6, 6.6, 5.0, 1.6), ...palm(right - 1.4, 6.4, 5.4, 2.6), ...palm(3.0, -8.2, 4.6, 3.5));
    parts.push(ball([-2.4, F + 0.35, 3.8], 0.7, '#FF6F91'), ball([1.0, F + 0.35, 5.6], 0.7, '#FFC75F'));
    parts.push(box([k.door / 2 + 1.2, F + 1.1, front + 0.5], [0.7, 2.2, 0.12], '#00C9A7', [0, 0, 0.12]));
    // tiki torches along the fence
    for (const [x, z] of [[left + 0.6, -3], [left + 0.6, 4], [right - 0.6, -3], [right - 0.6, 3.5], [-k.door / 2 - 0.6, front - 0.4], [k.door / 2 + 0.6, front - 0.4]] as [number, number][]) {
      parts.push(cyl([x, F + 0.9, z], 0.1, 1.8, '#6D4C2F'));
      glow.push(cone([x, F + 2.0, z], 0.28, 0.5, '#FF8C1A'));
    }
    // lanterns strung from palm to palm over the dance floor
    const lanterns = [
      ...sagLine([left + 1.4, F + 4.6, -7.4], [right - 1.4, F + 4.6, 6.4], 20, 1.0),
      ...sagLine([-6.6, F + 4.2, 6.6], [3.0, F + 4.0, -8.2], 16, 0.8),
    ];
    return { parts, glow, lanterns };
  }, [k, left, right, front]);
  const ups = useMemo<Beam[]>(() => [-8, -3, 3, 8].map((x) => ({ p: [x, F + 0.2, back + 0.6] as [number, number, number], len: 14, width: 1.0 })), [back]);
  return (
    <group>
      <Kit parts={parts} glow={glow} roughness={0.85} />
      <mesh ref={water} position={[5.5, F + 0.18, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.6, 4.2]} />
        <meshStandardMaterial color="#29B6F6" emissive="#00B4D8" emissiveIntensity={0.6} roughness={0.1} metalness={0.2} />
      </mesh>
      <LedFloor floor={BEACH} palette={pal} beat={bt} />
      <Bulbs at={lanterns} palette={pal} size={0.22} beat={bt} mode="chase" />
      <Beams beams={ups} palette={pal} beat={bt} up sway={0.3} speed={0.5} strength={0.14} />
      <Neon text="SUNSET BEACH CLUB" position={[0, F + 4.9, -7.2]} size={0.55} color="#FF6F91" />
      <Npc seed="dj-coral" act="dance" position={[0, F + 0.6, -7.6]} name="DJ Coral" nameColor="#FF6F91" />
      <Npc seed="beach-barman" act={null} position={[left + 0.9, F, 0]} rot={Math.PI / 2} />
      <Npc seed="beach-a" act="dance" position={[-4.2, F, -2.0]} rot={0.5} />
      <Npc seed="beach-b" act="dance" position={[-2.6, F, -3.4]} rot={-2.6} />
      <Npc seed="beach-c" act="selfie" position={[1.8, F, 4.2]} rot={Math.PI} />
    </group>
  );
}
