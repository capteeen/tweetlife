import type { Stats } from './stats';

// Getting around the city. Every ride has a fixed fare in bags, a speed, and a small effect on your stats.
// Walking is free but costs gas. "Your ride" is any car you own: free, a little clout.

export type TransportMode = 'walk' | 'bus' | 'bike' | 'scooter' | 'rideshare' | 'taxi' | 'own';

export type Transport = {
  id: TransportMode;
  name: string;
  emoji: string;
  bags: number;
  /** multiple of walking speed */
  speed: number;
  me: Partial<Stats>;
  blurb: string;
  color: string;
};

export const TRANSPORT: Transport[] = [
  { id: 'walk', name: 'Walk', emoji: '🚶', bags: 0, speed: 1.4, me: { gas: -6 }, blurb: 'Free. Your legs pay instead.', color: '#8FC57A' },
  { id: 'bus', name: 'Bus', emoji: '🚌', bags: 25, speed: 2.2, me: { vibes: -2 }, blurb: 'Cheapest ride in town. Stops at every stop.', color: '#1F4E79' },
  { id: 'bike', name: 'Bike', emoji: '🚲', bags: 40, speed: 2.6, me: { vibes: +2, gas: -2 }, blurb: 'Grab a share bike from the dock. Good for the soul.', color: '#06D6A0' },
  { id: 'scooter', name: 'E-scooter', emoji: '🛴', bags: 60, speed: 3.2, me: { vibes: +3 }, blurb: 'Unlock, scan, zip down the bike lane.', color: '#2EC4B6' },
  { id: 'rideshare', name: 'Rideshare', emoji: '🚙', bags: 120, speed: 3.8, me: { vibes: +1, clout: +1 }, blurb: 'Five stars, phone charger, quiet ride.', color: '#2D2D2D' },
  { id: 'taxi', name: 'Taxi', emoji: '🚕', bags: 180, speed: 4, me: { vibes: +2, clout: +2 }, blurb: 'Hail a yellow cab. Straight there, no detours.', color: '#F7C600' },
];

export const OWN_RIDE: Transport = { id: 'own', name: 'Your ride', emoji: '🚗', bags: 0, speed: 3, me: { clout: +1 }, blurb: 'Your own car. Free.', color: '#1D9BF0' };

export const transportById = (id: string) => (id === 'own' ? OWN_RIDE : TRANSPORT.find((t) => t.id === id) ?? null);

/** Walking speed in world units per second (matches the player controller). */
export const WALK_SPEED = 9;

/** Seconds a trip takes: real distance at the ride's speed, kept between 2.5s and 24s so it never drags. */
export function tripSeconds(length: number, speed: number) {
  return Math.max(2.5, Math.min(24, length / (WALK_SPEED * speed)));
}
