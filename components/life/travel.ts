'use client';
import { useWorld } from '@/components/world/store';
import { ITEMS } from '@/lib/life/market';
import { OWN_RIDE, TRANSPORT, tripSeconds, type Transport } from '@/lib/life/transport';
import { pathLength, route, type Pt } from '@/lib/world/layout';
import { lifeActions } from './useLife';

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
  return own ? [...TRANSPORT, { ...OWN_RIDE, emoji: own.emoji, name: own.name, speed: Math.max(OWN_RIDE.speed, own.speed * 1.4), itemId: own.id }] : TRANSPORT;
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
