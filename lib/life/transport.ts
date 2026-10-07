import type { Stats } from './stats';

// Getting around the city. Every ride has a fixed fare in bags, a speed, and a small effect on your stats.
// Trek is free but costs gas. "Your ride" is any car you own: free, a little clout.

export type TransportMode = 'trek' | 'danfo' | 'keke' | 'okada' | 'cab' | 'own';

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
  { id: 'trek', name: 'Trek', emoji: '🚶', bags: 0, speed: 1.4, me: { gas: -6 }, blurb: 'Free. Your legs pay instead.', color: '#8FC57A' },
  { id: 'danfo', name: 'Danfo', emoji: '🚐', bags: 30, speed: 2.4, me: { vibes: -2 }, blurb: 'Cheap. Packed like sardines.', color: '#FFC300' },
  { id: 'keke', name: 'Keke', emoji: '🛺', bags: 60, speed: 2.8, me: {}, blurb: 'Three wheels, no wahala.', color: '#FFD166' },
  { id: 'okada', name: 'Okada', emoji: '🏍️', bags: 90, speed: 3.6, me: { vibes: +3, gas: -1 }, blurb: 'Fastest through traffic. Hold on.', color: '#E63946' },
  { id: 'cab', name: 'Cab', emoji: '🚕', bags: 200, speed: 4, me: { vibes: +2, clout: +1 }, blurb: 'AC, aux cord, arrive looking fresh.', color: '#F4D35E' },
];

export const OWN_RIDE: Transport = { id: 'own', name: 'Your ride', emoji: '🚗', bags: 0, speed: 3, me: { clout: +1 }, blurb: 'Your own car. Free.', color: '#1D9BF0' };

export const transportById = (id: string) => (id === 'own' ? OWN_RIDE : TRANSPORT.find((t) => t.id === id) ?? null);

/** Walking speed in world units per second (matches the player controller). */
export const WALK_SPEED = 9;

/** Seconds a trip takes: real distance at the ride's speed, kept between 2.5s and 24s so it never drags. */
export function tripSeconds(length: number, speed: number) {
  return Math.max(2.5, Math.min(24, length / (WALK_SPEED * speed)));
}
