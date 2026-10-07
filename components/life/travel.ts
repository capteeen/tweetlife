'use client';
import { useWorld } from '@/components/world/store';
import { ITEMS } from '@/lib/life/market';
import { OWN_RIDE, TRANSPORT, tripSeconds, type Transport } from '@/lib/life/transport';
import { pathLength, route, type Pt } from '@/lib/world/layout';
import { lifeActions } from './useLife';
import { WALK_IN } from '@/lib/world/interiors';
import type { PlacedVenue } from '@/lib/life/venues';

// Client side of travel: plan the road route, price each ride, pay, then hand the trip to the player
// controller, which drives it.

export function plannedRoute(to: Pt): Pt[] {
  const s = useWorld.getState();
  const g = s.model?.geometry;
  if (!g) return [s.playerPos, to];
  const { K, pitchX, pitchZ, road } = g.grid;
  const box = g.blocks.length ? { halfW: ((2 * K + 1) * pitchX + road) / 2, halfD: ((2 * K + 1) * pitchZ + road) / 2, pitchX, pitchZ } : null;
  return route({ x: s.playerPos.x, z: s.playerPos.z }, to, g.contentRadius, g.boundaryRadius, box);
}

/** Rides on offer: the public ones, plus your own car if you have one. */
export function rideOptions(): (Transport & { itemId?: string })[] {
  const assets = useWorld.getState().life?.assets ?? [];
  const cars = assets.filter((a) => a.kind === 'car').sort((a, b) => b.speed - a.speed);
  const own = cars[0];
  return own ? [...TRANSPORT, { ...OWN_RIDE, emoji: own.emoji, name: `Your ${own.name}`, speed: Math.max(OWN_RIDE.speed, own.speed * 1.4), itemId: own.id }] : TRANSPORT;
}

export const etaLabel = (sec: number) => (sec < 60 ? `${Math.round(sec)}s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`);

export async function travelTo(ride: Transport & { itemId?: string }, to: Pt, label: string) {
  const s = useWorld.getState();
  const path = plannedRoute(to);
  await lifeActions.travel(ride.id, label);
  const duration = tripSeconds(pathLength(path), ride.speed);
  s.setTrip({ mode: ride.id, emoji: ride.emoji, label, path, startedAt: performance.now(), duration, itemId: ride.itemId ?? null });
  s.selectVenue(null);
  s.setMapOpen(false);
  s.closePhone();
  s.pushToast(`${ride.emoji} ${ride.name} to ${label}${ride.bags ? ` · ${ride.bags} bags` : ''}`, 'travel');
}

export const carItem = (id?: string | null) => (id ? ITEMS.find((i) => i.id === id) ?? null : null);

/** "Enter <venue>": walk through the door of a walk-in venue to the middle of the floor, then open its sheet.
 * Venues you cannot walk into (the bank, the market, the airport) just open their sheet. */
export function enterVenue(v: PlacedVenue) {
  const s = useWorld.getState();
  const k = WALK_IN[v.id];
  if (!k || s.trip) return s.selectVenue(v);
  // the venue's frame: +z runs out through the door towards the city centre
  const c = Math.cos(v.rot), sn = Math.sin(v.rot);
  const at = (lx: number, lz: number) => ({ x: v.x + lx * c + lz * sn, z: v.z - lx * sn + lz * c });
  const me = { x: s.playerPos.x, z: s.playerPos.z };
  const dx = me.x - v.x, dz = me.z - v.z;
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  // already inside: just open the menu
  if (Math.abs(lx) < k.w / 2 && Math.abs(lz) < k.d / 2) return s.selectVenue(v);
  const front = k.d / 2 + 2;
  // round the corner first when you are beside or behind the building, so you never walk through a wall
  const side = lx < 0 ? -1 : 1;
  const around = lz < front - 0.5 ? [at(side * (k.w / 2 + 2), Math.max(-k.d / 2 - 2, lz)), at(side * (k.w / 2 + 2), front)] : [];
  const path = [me, ...around, at(0, front), at(0, k.d / 2 - 1.5), at(0, 0)];
  const duration = tripSeconds(pathLength(path), 1);
  s.selectVenue(null);
  // you can't dance on a keke: leave your ride at the door
  if (s.riding) {
    const ride = s.riding;
    lifeActions.equip(null).then(() => s.pushToast(`${ride.emoji} Parked your ${ride.name} outside`, 'travel')).catch(() => {});
  }
  s.setTrip({ mode: 'walk', emoji: '🚶', label: v.name, path, startedAt: performance.now(), duration, itemId: null });
  setTimeout(() => {
    const now = useWorld.getState();
    // still on this walk (not cancelled or replaced by a ride): open the venue's menu once inside
    if (!now.trip || now.trip.label === v.name) now.selectVenue(v);
  }, duration * 1000 + 150);
}
