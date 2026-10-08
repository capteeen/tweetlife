'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { WorldGeometry } from '@/lib/world/geometry';
import { DISTRICTS, airportLayout, inRect, RING_SLOTS } from '@/lib/world/layout';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { useWorld } from '@/components/world/store';
import { Loop } from '@/lib/audio/loops';
import { sfx } from '@/lib/audio/sfx';
import { setListener } from '@/lib/audio/spatial';
import { insideVenue, type SurfaceMap } from '@/lib/audio/surfaces';
import { planeSound, playerSound, traffic, type TrafficCar } from '@/lib/audio/state';
import { audio } from '@/lib/audio/engine';
import { FootstepSounds } from './FootstepSounds';

// Everything you hear walking around a city, mounted inside the canvas:
//  - the listener rides on the player, turned the way the camera looks
//  - footsteps by surface (FootstepSounds), heavy breathing when sprinting or tired
//  - a city bed that's busiest downtown, wind on the bridge and the airport island, waves along the shore,
//    birds by day and crickets by night, gulls at the waterfront
//  - the nearest traffic's engines in 3D, a whoosh when a car passes close, horns (Cars.tsx)
//  - your ride: bus doors and diesel, bike bell and chain, scooter beeps and whine, car doors and engine,
//    the speedboat and the jet you can buy
//  - crowds at the club, the lounge and the coin shop, cheers in the club, weights at the gym, door sounds
//    walking into a walk-in venue (VenueMusic.tsx muffles the music through its walls)
//  - the airliner taking off, and the airport chime

const ENGINE_VOICES = 4;
const HEAR_TRAFFIC = 45;

type RideKind = 'bus' | 'bike' | 'scooter' | 'car' | 'boat' | 'plane' | null;

export function WorldSounds({ geometry }: { geometry: WorldGeometry }) {
  const { camera } = useThree();
  const R = geometry.boundaryRadius;
  const venues = useMemo(() => placeVenues(geometry.contentRadius, R), [geometry.contentRadius, R]);
  const airport = useMemo(() => airportLayout(geometry.contentRadius, R), [geometry.contentRadius, R]);
  const map = useMemo<SurfaceMap>(
    () => ({ blocks: geometry.blocks, grid: geometry.grid, outside: geometry.outside, contentRadius: geometry.contentRadius, boundaryRadius: R, airport, venues }),
    [geometry, R, airport, venues],
  );
  const night = geometry.skyT > 0.8;
  const dusk = geometry.skyT > 0.6 && !night;

  const loops = useMemo(() => {
    const at = (v: PlacedVenue | undefined) => (v ? { x: v.x, y: 1.5, z: v.z } : { x: 0, y: 0, z: 0 });
    const by = (id: string) => venues.find((v) => v.id === id);
    return {
      city: new Loop('city', { bus: 'ambience', fade: 1 }),
      wind: new Loop('wind', { bus: 'ambience', fade: 1 }),
      water: new Loop('water', { bus: 'ambience', fade: 1 }),
      birds: new Loop('birds', { bus: 'ambience', fade: 1 }),
      crickets: new Loop('crickets', { bus: 'ambience', fade: 1 }),
      gulls: new Loop('gulls', { bus: 'ambience', fade: 1 }),
      breath: new Loop('breath', { bus: 'sfx', fade: 0.4 }),
      clubCrowd: new Loop('crowd', { bus: 'ambience', at: at(by('club')), ref: 6, max: 60 }),
      barCrowd: new Loop('crowd', { bus: 'ambience', at: at(by('bar')), ref: 5, max: 50 }),
      shopCrowd: new Loop('crowd', { bus: 'ambience', at: at(by('exchange')), ref: 4, max: 40 }),
      gym: new Loop('gym', { bus: 'ambience', at: at(by('gym')), ref: 5, max: 45 }),
      ride: { kind: null as RideKind, loop: null as Loop | null },
      jet: new Loop('jet', { bus: 'sfx', at: { x: 0, y: 0, z: 0 }, ref: 18, max: 260, rolloff: 0.8 }),
      engines: Array.from({ length: ENGINE_VOICES }, () => ({ loop: new Loop('engine', { bus: 'sfx', at: { x: 0, y: 0.6, z: 0 }, ref: 3, max: 60 }), car: null as TrafficCar | null })),
    };
  }, [venues]);
  const all = useMemo(() => [...Object.values(loops).filter((l): l is Loop => l instanceof Loop), ...loops.engines.map((v) => v.loop)], [loops]);
  useEffect(
    () => () => {
      all.forEach((l) => l.dispose());
      loops.ride.loop?.dispose();
    },
    [all, loops],
  );

  const fwd = useRef(new THREE.Vector3());
  const slow = useRef(0);
  const inside = useRef<string | null>(null);
  const passing = useRef(new WeakMap<TrafficCar, { d: number; done: boolean }>());
  const lastTrip = useRef<string | null>(null);
  const nextCheer = useRef(0);
  const nextChime = useRef(0);

  useFrame((state) => {
    const p = playerSound;
    camera.getWorldDirection(fwd.current);
    const fl = Math.hypot(fwd.current.x, fwd.current.z) || 1;
    setListener(p.x, p.y + 1.4, p.z, fwd.current.x / fl, fwd.current.z / fl);
    const now = state.clock.elapsedTime;
    const st = useWorld.getState();
    if (!audio()) {
      // muted or not unlocked yet: wind everything down (loops shut themselves off once quiet)
      if (now - slow.current > 1) {
        slow.current = now;
        all.forEach((l) => l.set(0));
        loops.ride.loop?.set(0);
      }
      lastTrip.current = st.trip ? `${st.trip.mode}:${st.trip.startedAt}` : null;
      return;
    }

    // ----- breathing -----
    const moving = p.onFoot && p.speed > 0.1;
    const puff = moving ? Math.max(p.sprint ? 0.55 + p.tired * 0.45 : 0, p.tired * 0.8) : p.tired * 0.25;
    loops.breath.set(puff * 0.9, { rate: 0.7 + puff * 1.3, hard: puff });

    // ----- your ride -----
    const trip = st.trip;
    const tripKey = trip ? `${trip.mode}:${trip.startedAt}` : null;
    if (tripKey !== lastTrip.current) {
      const was = lastTrip.current?.split(':')[0];
      if (trip) onBoard(trip.mode);
      else if (was) onArrive(was);
      lastTrip.current = tripKey;
    }
    const kind: RideKind = trip
      ? trip.mode === 'bus' ? 'bus' : trip.mode === 'bike' ? 'bike' : trip.mode === 'scooter' ? 'scooter' : trip.mode === 'walk' ? null : 'car'
      : st.riding ? (st.riding.kind === 'boat' ? 'boat' : st.riding.kind === 'plane' ? 'plane' : st.riding.kind === 'car' ? 'car' : null) : null;
    if (kind !== loops.ride.kind) {
      loops.ride.loop?.set(0);
      const l = loops.ride.loop;
      if (l) setTimeout(() => l.dispose(), 1500);
      loops.ride.kind = kind;
      loops.ride.loop = kind
        ? new Loop(kind === 'bus' ? 'diesel' : kind === 'bike' ? 'bike' : kind === 'scooter' ? 'whine' : kind === 'boat' ? 'outboard' : kind === 'plane' ? 'jet' : 'engine', { bus: 'sfx', fade: 0.4 })
        : null;
    }
    if (loops.ride.loop) {
      const rpm = trip ? 0.6 + Math.sin(now * 0.7) * 0.1 : p.speed;
      const lvl = kind === 'bike' ? (trip ? 0.8 : p.speed) : kind === 'plane' ? 0.5 : kind === 'scooter' ? 0.7 : 0.45;
      loops.ride.loop.set(lvl, { rpm, thrust: 0.4 + p.speed * 0.6 });
    }

    // ----- where am I -----
    const r = Math.hypot(p.x, p.z);
    const onBridge = inRect(airport.bridge, p.x, p.z);
    const onIsland = inRect(airport.island, p.x, p.z, 4);
    const shore = Math.max(0, 1 - Math.abs(r - R) / 18);
    const centre = Math.max(0, 1 - r / (geometry.contentRadius + 30));
    const ang = (Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2);
    const slot = Math.round((ang / (Math.PI * 2)) * RING_SLOTS) % RING_SLOTS;
    const district = r > geometry.contentRadius ? DISTRICTS.find((d) => d.slots.includes(slot))?.id ?? null : null;
    const near = (id: string, range: number) => {
      const v = venues.find((x) => x.id === id);
      return v ? Math.max(0, 1 - Math.hypot(v.x - p.x, v.z - p.z) / range) : 0;
    };

    // a walk-in venue: doors as you go through, and the city goes quiet inside
    const inV = insideVenue(venues, p.x, p.z);
    const inId = inV?.id ?? null;
    if (inId !== inside.current) {
      const door = inV ?? venues.find((v) => v.id === inside.current);
      if (door && p.onFoot) {
        const d = { x: door.x + Math.sin(door.rot) * (door.d / 2), y: 1.2, z: door.z + Math.cos(door.rot) * (door.d / 2) };
        sfx(inV ? 'doorOpen' : 'doorClose', { at: d, gain: 0.8 });
      }
      inside.current = inId;
    }
    const indoors = inId ? 0.35 : 1;

    // ----- ambience, eased a few times a second -----
    if (now - slow.current > 0.25) {
      slow.current = now;
      const busy = Math.min(1, centre * 1.2 + 0.2) * (night ? 0.6 : 1);
      loops.city.set((onIsland ? 0.12 : 0.2 + centre * 0.35) * indoors, { busy });
      loops.wind.set(Math.min(0.6, (onBridge ? 0.6 : 0) + (onIsland ? 0.4 : 0) + shore * 0.2) * indoors);
      loops.water.set(Math.min(0.7, shore * 0.6 + (onBridge ? 0.5 : 0)) * indoors);
      const green = district === 'wellness' ? 1 : district === 'waterfront' ? 0.5 : 0.6 - centre * 0.4;
      loops.birds.set(night ? 0 : (dusk ? 0.4 : 1) * green * indoors * 0.8);
      loops.crickets.set(night ? (0.5 + (1 - centre) * 0.4) * indoors : dusk ? 0.15 * indoors : 0);
      loops.gulls.set(!night && (district === 'waterfront' || onBridge || shore > 0.6) ? 0.6 * indoors : 0);
      const strip = district === 'strip' ? 1 : 0;
      loops.clubCrowd.set((inId === 'club' ? 0.9 : near('club', 40) * 0.8) * (night ? 1.2 : 0.8) + strip * 0.05, { busy: 1 });
      loops.barCrowd.set(inId === 'bar' ? 0.6 : near('bar', 32) * 0.5, { busy: 0.6 });
      loops.shopCrowd.set(inId === 'exchange' ? 0.5 : near('exchange', 26) * 0.35, { busy: 0.5 });
      loops.gym.set(inId === 'gym' ? 1 : near('gym', 30) * 0.8);

      // the club cheers when the drop hits
      if ((inId === 'club' || near('club', 30) > 0) && now > nextCheer.current) {
        if (nextCheer.current) {
          const v = venues.find((x) => x.id === 'club')!;
          sfx('cheer', { at: { x: v.x, y: 1.5, z: v.z }, v: inId === 'club' ? 1 : 0.6 });
        }
        nextCheer.current = now + 14 + Math.random() * 22;
      }
      // the airport's boarding chime
      if (onIsland && now > nextChime.current) {
        if (nextChime.current) sfx('boarding', { at: { x: airport.terminal.x, y: 4, z: airport.terminal.z }, gain: 0.7 });
        nextChime.current = now + 35 + Math.random() * 30;
      }
    }

    // ----- the plane taking off -----
    if (planeSound.active) {
      loops.jet.move(planeSound.x, planeSound.y + 2, planeSound.z);
      loops.jet.set(0.9, { thrust: planeSound.thrust });
    } else loops.jet.set(0);

    // ----- traffic -----
    const nearest: { c: TrafficCar; d: number }[] = [];
    for (const list of traffic.values()) {
      for (const c of list()) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d > HEAR_TRAFFIC) continue;
        nearest.push({ c, d });
        // a whoosh when a moving car goes by close
        const prev = passing.current.get(c);
        if (d < 9) {
          if (prev && !prev.done && d > prev.d && prev.d < 4.5 && c.speed > 3) {
            sfx('whoosh', { at: { x: c.x, y: 0.8, z: c.z }, v: Math.min(1.2, c.speed / 8) * (c.big ? 1.3 : 1) });
            prev.done = true;
          }
          if (!prev) passing.current.set(c, { d, done: false });
          else prev.d = d;
        } else if (prev) passing.current.delete(c);
      }
    }
    nearest.sort((a, b) => a.d - b.d);
    const top = nearest.slice(0, ENGINE_VOICES).map((n) => n.c);
    // keep voices on the cars they already follow, hand free voices to new cars
    for (const v of loops.engines) if (v.car && !top.includes(v.car)) v.car = null;
    for (const c of top) {
      if (loops.engines.some((v) => v.car === c)) continue;
      const free = loops.engines.find((v) => !v.car);
      if (free) free.car = c;
    }
    for (const v of loops.engines) {
      if (!v.car) {
        v.loop.set(0);
        continue;
      }
      const c = v.car;
      v.loop.move(c.x, 0.6, c.z);
      const rpm = Math.min(1, c.speed / 10);
      v.loop.set(0.25 + rpm * 0.35, c.big ? { rpm, base: 26, range: 34 } : { rpm, base: 38, range: 60 });
    }
  });

  return <FootstepSounds map={map} />;
}

function onBoard(mode: string) {
  if (mode === 'bus') sfx('busDoors');
  else if (mode === 'bike') sfx('bikeBell');
  else if (mode === 'scooter') sfx('scooterBeep');
  else if (mode !== 'walk') sfx('carDoor');
}

function onArrive(mode: string) {
  if (mode === 'bus') sfx('busDoors');
  else if (mode === 'bike') sfx('bikeBell', { gain: 0.6 });
  else if (mode === 'scooter') sfx('scooterBeep', { gain: 0.6 });
  else if (mode !== 'walk') sfx('carDoor');
}
