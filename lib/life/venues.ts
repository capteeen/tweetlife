import type { Stats } from './stats';
import type { ActivityId } from './activities';
import { WALK_IN } from '@/lib/world/interiors';
import { SPARE_SLOTS, airportLayout, districtOf, slotAngle, venueRingRadius } from '@/lib/world/layout';
import { districtName, themeOf } from '@/lib/world/cityThemes';

// Venues: the city's services, in districts on a ring just outside the post blocks so they are never
// mistaken for posts. Same set in every world; placement is deterministic from the city size.

export type VenueAction = {
  id: string;
  label: string;
  emoji: string;
  /** bags cost (negative = earn) */
  bags: number;
  me: Partial<Stats>;
  /** applied to visitors within earshot (client reports who is near) */
  nearby?: Partial<Stats>;
  /** seconds before this action can be repeated */
  cooldown: number;
  line: string;
  /** the move your avatar plays while doing it (lib/life/activities.ts), and for how long */
  act?: ActivityId;
  actSeconds?: number;
};

export type Venue = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  blurb: string;
  actions: VenueAction[];
  /** opens a phone app instead of (or as well as) actions */
  app?: 'wallet' | 'market' | 'trenches';
  marketKind?: 'car' | 'boat' | 'plane';
};

export const VENUES: Venue[] = [
  {
    id: 'bar', name: 'Degen Lounge', emoji: '🍸', color: '#8338EC', blurb: 'Drinks, gist, slow jams, bad decisions.',
    actions: [
      { id: 'drink', label: 'Buy a drink', emoji: '🍹', bags: 200, me: { vibes: +8, gas: -2 }, cooldown: 60, line: 'is having a drink' },
      { id: 'chapman', label: 'Chapman, no alcohol', emoji: '🧃', bags: 120, me: { vibes: +4, gas: +3 }, cooldown: 60, line: 'is sipping chapman' },
      { id: 'sway', label: 'Two-step to the slow jams', emoji: '🕺', bags: 0, me: { vibes: +5, gas: -2 }, cooldown: 90, line: 'is two-stepping', act: 'dance', actSeconds: 10 },
      { id: 'round', label: 'Buy a round for everyone here', emoji: '🥂', bags: 1000, me: { vibes: +6, clout: +8 }, nearby: { vibes: +10 }, cooldown: 300, line: 'bought a round 🥂' },
    ],
  },
  {
    id: 'suya', name: 'Suya Spot', emoji: '🍢', color: '#E63946', blurb: 'Pepper, smoke, gas.',
    actions: [
      { id: 'eat', label: 'Eat suya', emoji: '🍢', bags: 150, me: { gas: +15, vibes: +3 }, cooldown: 120, line: 'is eating suya' },
      { id: 'feast', label: 'Order for the table', emoji: '🍽️', bags: 800, me: { gas: +15, clout: +5 }, nearby: { gas: +8 }, cooldown: 300, line: 'ordered for the table 🍽️' },
    ],
  },
  {
    id: 'gym', name: 'Iron Trenches Gym', emoji: '🏋️', color: '#2D6A4F', blurb: 'Lift. Get gas. Get clout.',
    actions: [
      { id: 'train', label: 'Lift weights', emoji: '🏋️', bags: 0, me: { gas: +12, clout: +2, vibes: -2 }, cooldown: 600, line: 'is lifting', act: 'pushups', actSeconds: 10 },
      { id: 'treadmill', label: 'Run on the treadmill', emoji: '🏃', bags: 100, me: { gas: +8, vibes: +2 }, cooldown: 300, line: 'is on the treadmill', act: 'stretch', actSeconds: 8 },
      { id: 'yoga', label: 'Yoga class', emoji: '🧘', bags: 250, me: { vibes: +8, gas: +6 }, cooldown: 900, line: 'is in yoga class', act: 'rest', actSeconds: 12 },
      { id: 'coach', label: 'Session with a coach', emoji: '💪', bags: 800, me: { gas: +18, clout: +6 }, cooldown: 1800, line: 'is training with a coach', act: 'pushups', actSeconds: 10 },
      { id: 'shake', label: 'Protein shake', emoji: '🥤', bags: 150, me: { gas: +10 }, cooldown: 300, line: 'is drinking a protein shake' },
      { id: 'shower', label: 'Gym shower', emoji: '🚿', bags: 50, me: { vibes: +4, clout: +1 }, cooldown: 600, line: 'is fresh from the shower' },
    ],
  },
  {
    id: 'barber', name: 'Fresh Cuts', emoji: '💈', color: '#1D9BF0', blurb: 'A cut that changes the timeline.',
    actions: [{ id: 'cut', label: 'Fresh cut', emoji: '💈', bags: 500, me: { clout: +8, vibes: +4 }, cooldown: 1800, line: 'got a fresh cut 💈' }],
  },
  {
    id: 'clinic', name: 'Clinic', emoji: '🏥', color: '#5FB3B3', blurb: 'Full recovery. Not cheap. Hiring doctors.',
    actions: [{ id: 'recover', label: 'Full recovery', emoji: '💊', bags: 2000, me: { gas: +100, vibes: +5 }, cooldown: 600, line: 'is fully recovered' }],
  },
  {
    id: 'hustle', name: 'Hustle Hub', emoji: '🏢', color: '#8338EC', blurb: 'The job centre. Find a real job on the board, or grab a day of casual work.',
    // casual work for anyone without a job; a real job (lib/life/jobs.ts) always pays more
    actions: [{ id: 'shift', label: 'Casual day work (+250 bags)', emoji: '💼', bags: -250, me: { gas: -15, vibes: -5, clout: +1 }, cooldown: 1800, line: 'finished a shift 💼' }],
  },
  {
    id: 'tech', name: 'Devnet Labs', emoji: '💻', color: '#3A86FF', blurb: 'The tech office. Standing desks, free coffee, hiring programmers.',
    actions: [
      { id: 'coffee', label: 'Free office coffee', emoji: '☕', bags: 0, me: { gas: +4, vibes: +1 }, cooldown: 900, line: 'is on the office coffee' },
      { id: 'meetup', label: 'Tech meetup', emoji: '🎤', bags: 150, me: { clout: +4, vibes: +2, gas: -2 }, cooldown: 1800, line: 'is at a tech meetup' },
    ],
  },
  { id: 'bank', name: 'Bank', emoji: '🏦', color: '#D4C3A5', blurb: 'Your bags, your sends.', actions: [], app: 'wallet' },
  {
    id: 'club', name: 'Club Moon', emoji: '🎧', color: '#FF5D8F', blurb: 'Music loud, lights mad. Dance. Everyone sees.',
    actions: [
      { id: 'dance', label: 'Hit the dance floor', emoji: '💃', bags: 300, me: { vibes: +12, gas: -8 }, nearby: { vibes: +3 }, cooldown: 120, line: 'is dancing 💃', act: 'dance', actSeconds: 14 },
      { id: 'request', label: 'Request a song from the DJ', emoji: '🎶', bags: 500, me: { vibes: +6, clout: +4 }, nearby: { vibes: +4 }, cooldown: 600, line: 'requested a song 🎶' },
      { id: 'vip', label: 'VIP table with bottle service', emoji: '🍾', bags: 3000, me: { clout: +15, vibes: +10 }, nearby: { vibes: +6 }, cooldown: 1800, line: 'popped bottles in VIP 🍾' },
      { id: 'selfie', label: 'Selfie under the lights', emoji: '🤳', bags: 0, me: { clout: +3 }, cooldown: 300, line: 'took a club selfie', act: 'selfie', actSeconds: 6 },
    ],
  },
  { id: 'dealership', name: 'Dealership', emoji: '🚗', color: '#FFD166', blurb: 'Keke to Lambo.', actions: [], app: 'market', marketKind: 'car' },
  { id: 'marina', name: 'Marina', emoji: '⚓', color: '#6FA8C7', blurb: 'Boats. Leave the shore.', actions: [], app: 'market', marketKind: 'boat' },
  { id: 'airport', name: 'Airport', emoji: '✈️', color: '#BFE3FF', blurb: 'Fly to another country from the departures board. Own a jet and every flight is free.', actions: [], app: 'market', marketKind: 'plane' },
  { id: 'exchange', name: 'Trenches Coin Shop', emoji: '🪙', color: '#06D6A0', blurb: 'Live memecoins over the counter. Buy with bags, watch them float on your hand.', actions: [], app: 'trenches' },
];

export const venueById = (id: string) => VENUES.find((v) => v.id === id) ?? null;

export type PlacedVenue = Venue & {
  x: number; z: number; rot: number; w: number; d: number; h: number;
  /** district name for the sheet and the map */
  district: string;
  /** drawn by its own scene component (the airport terminal), not the generic venue building */
  custom?: boolean;
  /** an open-roofed place you walk into (lib/world/interiors.ts); collisions are its walls, not its footprint */
  walkIn?: boolean;
};

export const VENUE_W = 9;
export const VENUE_D = 9;
export const VENUE_H = 6;

/**
 * Venues sit in districts on a ring just outside the city, facing the centre (see lib/world/layout.ts).
 * The airport is the terminal on the airport island. `boundaryRadius` defaults to the smallest a world gets.
 * `country` only renames venues and districts (Club Moon is Club Yellow in BNB City); ids and places stay.
 */
export function placeVenues(contentRadius: number, boundaryRadius = contentRadius + 36, country?: string | null): PlacedVenue[] {
  const r = venueRingRadius(contentRadius);
  const names = themeOf(country).venues;
  const spare = [...SPARE_SLOTS];
  let extra = 0;
  return VENUES.map((base) => {
    const v = names[base.id] ? { ...base, name: names[base.id].name, emoji: names[base.id].emoji ?? base.emoji } : base;
    if (v.id === 'airport') {
      const t = airportLayout(contentRadius, boundaryRadius).terminal;
      return { ...v, x: t.x, z: t.z, rot: -Math.PI / 2, w: t.w, d: t.d, h: 7, district: 'Airport island', custom: true };
    }
    const dd = districtOf(v.id);
    const slot = dd ? dd.slots[dd.venues.indexOf(v.id)] : spare.shift();
    // past the spare slots, further venues go on an outer ring
    const rr = slot === undefined ? r + 22 : r;
    const a = slot === undefined ? slotAngle(extra++ * 2 + 1) : slotAngle(slot);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const k = WALK_IN[v.id];
    return { ...v, x, z, rot: Math.atan2(-x, -z), w: k?.w ?? VENUE_W, d: k?.d ?? VENUE_D, h: k?.h ?? VENUE_H, district: dd ? districtName(dd.id, dd.name, country) : 'Downtown', walkIn: !!k };
  });
}
