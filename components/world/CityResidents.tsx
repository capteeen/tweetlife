'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { castFor, type Resident } from '@/lib/life/residents';
import { useCountry } from './country';
import { COUNTRIES } from '@/lib/world/countries';
import { todaysAddress } from '@/lib/life/government';
import { placeVenues } from '@/lib/life/venues';
import type { Block, CityGrid } from '@/lib/world/geometry';
import { surfaceY } from '@/lib/world/ground';
import { useWorld } from './store';
import { Figure } from './Figure';
import type { FigureAct } from './figureMoves';
import type { HomePose } from './figurePoses';
import { buildRoutes, poseAt, type Route } from './residentPaths';

// The city's named residents (lib/life/residents.ts), walking their routes between the venues. Tap one to talk
// (components/life/ResidentCard.tsx). Walk past and they sometimes say something.

/** Where each resident is right now, for the chat card and their passing remarks. */
export const residentPos = new Map<string, { x: number; z: number }>();

const BUBBLE_MS = 7000;

export function CityResidents({ contentRadius, boundaryRadius, blocks, grid, interactive }: { contentRadius: number; boundaryRadius: number; blocks: Block[]; grid: CityGrid; interactive: boolean }) {
  const venues = useMemo(() => placeVenues(contentRadius, boundaryRadius), [contentRadius, boundaryRadius]);
  const country = useCountry();
  const cast = useMemo(() => castFor(country), [country]);
  const routes = useMemo(() => {
    const all = buildRoutes(cast, venues, contentRadius);
    return cast.map((r, i) => ({ r, route: all[i] }));
  }, [cast, venues, contentRadius]);

  // passing remarks: now and then, someone near you says one of their lines
  useEffect(() => {
    if (!interactive) return;
    const last = new Map<string, number>();
    let greeted = false;
    const id = setInterval(() => {
      const s = useWorld.getState();
      if (document.hidden) return;
      const me = s.playerPos;
      // walk up to the president and they open with a line from today's address
      const pres = cast.find((r) => r.office === 'president');
      const pp = pres && residentPos.get(pres.id);
      if (pres && pp && !greeted && pres.id !== s.selectedResident && Math.hypot(pp.x - me.x, pp.z - me.z) < 9) {
        greeted = true;
        last.set(pres.id, Date.now());
        const line = todaysAddress(country).text.split(/(?<=[.!?])\s/)[0];
        s.residentSay(pres.id, line.length > 90 ? line.slice(0, 87).replace(/\s+\S*$/, '') + '…' : line);
        return;
      }
      if (Math.random() < 0.4) return;
      const near = cast.filter((r) => {
        const p = residentPos.get(r.id);
        return p && r.id !== s.selectedResident && Math.hypot(p.x - me.x, p.z - me.z) < 14 && Date.now() - (last.get(r.id) ?? 0) > 35000;
      });
      if (!near.length) return;
      const r = near[Math.floor(Math.random() * near.length)];
      last.set(r.id, Date.now());
      s.residentSay(r.id, r.ambient[Math.floor(Math.random() * r.ambient.length)]);
    }, 4000);
    return () => clearInterval(id);
  }, [interactive, cast, country]);

  return (
    <>
      {routes.map(({ r, route }) =>
        route ? <NamedResident key={r.id} r={r} route={route} blocks={blocks} grid={grid} boundaryRadius={boundaryRadius} interactive={interactive} /> : null,
      )}
    </>
  );
}

function NamedResident({ r, route, blocks, grid, boundaryRadius, interactive }: { r: Resident; route: Route; blocks: Block[]; grid: CityGrid; boundaryRadius: number; interactive: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const act = useRef<FigureAct | HomePose | null>(null);
  const placed = useRef(false);
  const selectResident = useWorld((s) => s.selectResident);
  const selected = useWorld((s) => s.selectedResident === r.id);
  const say = useWorld((s) => s.residentSays[r.id]);
  // presidents wear a sash in their country's colours
  const sash = useMemo<[string, string] | undefined>(() => (r.office === 'president' && r.country ? [COUNTRIES[r.country].theme.primary, COUNTRIES[r.country].theme.secondary] : undefined), [r]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const p = poseAt(route, Date.now() / 1000);
    const st = useWorld.getState();
    const talking = st.selectedResident === r.id;
    // stopped mid-walk to talk to you: stand still and face you; anyone dancing or sitting carries on
    const halt = talking && p.moving && !p.act;
    const x = halt ? g.position.x : p.x, z = halt ? g.position.z : p.z;
    const y = p.y ?? surfaceY(blocks, grid, x, z, boundaryRadius);
    const far = Math.hypot(g.position.x - x, g.position.z - z) > 20;
    if (!placed.current || far) {
      g.position.set(x, y, z);
      placed.current = true;
    } else {
      // after a chat they catch up with their route
      const k = 1 - Math.exp(-dt * 6);
      g.position.x += (x - g.position.x) * k;
      g.position.z += (z - g.position.z) * k;
      g.position.y += (y - g.position.y) * Math.min(1, dt * 10);
    }
    const yaw = halt ? Math.atan2(st.playerPos.x - g.position.x, st.playerPos.z - g.position.z) : p.rot;
    let d = yaw - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * 8);
    speed.current = halt ? 0 : p.moving ? 0.5 : 0;
    act.current = halt ? { base: 'stand', upper: 'idle', seat: 0 } : p.act;
    residentPos.set(r.id, { x: g.position.x, z: g.position.z });
  });

  return (
    <group
      ref={ref}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        selectResident(r.id);
      }}
    >
      <Figure seed={`resident:${r.id}`} look={r.look} speedRef={speed} actRef={act} label={r.name} labelColor={selected ? '#FFD166' : '#FFE8B0'} sash={sash} />
      {say && <Bubble key={say.at} at={say.at} text={say.text} />}
    </group>
  );
}

export function Bubble({ text, at }: { text: string; at: number }) {
  const [phase, setPhase] = useState<'on' | 'fading' | 'gone'>(() => (Date.now() - at < BUBBLE_MS ? 'on' : 'gone'));
  useEffect(() => {
    const left = BUBBLE_MS - (Date.now() - at);
    const t = setTimeout(() => setPhase('fading'), Math.max(0, left - 600));
    const u = setTimeout(() => setPhase('gone'), Math.max(0, left));
    return () => (clearTimeout(t), clearTimeout(u));
  }, [at]);
  if (phase === 'gone') return null;
  return (
    <Html position={[0, 2.45, 0]} center zIndexRange={[11, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className="max-w-[220px] rounded-2xl bg-white px-3 py-1.5 text-center text-[13px] font-medium leading-snug text-[#0B0E14] shadow-lg transition-opacity duration-500"
        style={{ width: 'max-content', opacity: phase === 'fading' ? 0 : 1 }}
      >
        {text}
      </div>
    </Html>
  );
}
