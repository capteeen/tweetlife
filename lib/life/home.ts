import type { Stats } from './stats';

// The house. Every player gets one room with a starter kit; everything else is bought in the Market's
// Home tab with bags (in-world points) and sits in a fixed slot. Every piece has actions, like a venue:
// a duration, a cost (free or bags), and what it does to Vibes / Clout / Gas.

export type Slot = 'seat' | 'bed' | 'bath' | 'kitchen' | 'wall' | 'power' | 'comfort' | 'table' | 'light';

export type Pose = 'stand' | 'sit' | 'lie';

export type FurnitureAction = {
  id: string;
  label: string;
  emoji: string;
  /** how long the avatar is busy; also the server-side cooldown */
  seconds: number;
  /** bags cost (0 = free) */
  bags: number;
  me: Partial<Stats>;
  pose: Pose;
  line: string;
};

export type FurnitureModel =
  | 'chair' | 'sofa' | 'mattress' | 'bedframe' | 'kingbed' | 'bucket' | 'shower' | 'table' | 'dining'
  | 'bulb' | 'chandelier' | 'fan' | 'ac' | 'cooler' | 'fridge' | 'tv' | 'console' | 'generator';

export type Furniture = {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** bags; 0 = starter kit (free, cannot be sold) */
  price: number;
  slot: Slot;
  tier: 0 | 1 | 2 | 3;
  model: FurnitureModel;
  color: string;
  /** dead during an outage unless the generator is running */
  needsPower?: boolean;
  actions: FurnitureAction[];
};

export const SLOT_LABEL: Record<Slot, string> = {
  seat: 'Seating', bed: 'Sleep', bath: 'Bathroom', kitchen: 'Kitchen', wall: 'Entertainment', power: 'Power',
  comfort: 'Comfort', table: 'Table', light: 'Lighting',
};

export const FURNITURE: Furniture[] = [
  // ----- starter kit (tier 0, free) -----
  {
    id: 'chair_plastic', name: 'Plastic chair', emoji: '🪑', blurb: 'The one from every owambe. It holds.', price: 0, slot: 'seat', tier: 0, model: 'chair', color: '#E63946',
    actions: [{ id: 'sit', label: 'Sit down', emoji: '🪑', seconds: 8, bags: 0, me: { gas: +3 }, pose: 'sit', line: 'is sitting down' }],
  },
  {
    id: 'mattress_foam', name: 'Foam mattress', emoji: '🛏️', blurb: 'On the floor. It still counts as a bed.', price: 0, slot: 'bed', tier: 0, model: 'mattress', color: '#3A86FF',
    actions: [
      { id: 'nap', label: 'Quick nap', emoji: '😴', seconds: 20, bags: 0, me: { gas: +8 }, pose: 'lie', line: 'is napping' },
      { id: 'sleep', label: 'Sleep till morning', emoji: '🌙', seconds: 60, bags: 0, me: { gas: +25, vibes: -2 }, pose: 'lie', line: 'is asleep' },
    ],
  },
  {
    id: 'bucket', name: 'Bucket & bowl', emoji: '🪣', blurb: 'Cold water. Builds character.', price: 0, slot: 'bath', tier: 0, model: 'bucket', color: '#1D9BF0',
    actions: [{ id: 'bath', label: 'Bucket bath', emoji: '🚿', seconds: 15, bags: 0, me: { vibes: +4, gas: +2 }, pose: 'stand', line: 'is having a bucket bath' }],
  },
  {
    id: 'table_small', name: 'Small table', emoji: '🪵', blurb: 'For your phone, your plate, your plans.', price: 0, slot: 'table', tier: 0, model: 'table', color: '#C99A5B',
    actions: [{ id: 'plan', label: 'Plan the hustle', emoji: '📝', seconds: 10, bags: 0, me: { clout: +2, gas: -1 }, pose: 'stand', line: 'is planning' }],
  },
  {
    id: 'bulb', name: 'One bulb', emoji: '💡', blurb: 'Sixty watts of hope.', price: 0, slot: 'light', tier: 0, model: 'bulb', color: '#FFD089', needsPower: true,
    actions: [{ id: 'read', label: 'Read under the bulb', emoji: '📖', seconds: 12, bags: 0, me: { clout: +3 }, pose: 'stand', line: 'is reading' }],
  },

  // ----- tier 1 -----
  {
    id: 'fan', name: 'Standing fan', emoji: '🌀', blurb: 'Lagos heat has met its match. Mostly.', price: 800, slot: 'comfort', tier: 1, model: 'fan', color: '#9AA6B8', needsPower: true,
    actions: [{ id: 'cool', label: 'Cool off', emoji: '🌀', seconds: 10, bags: 0, me: { gas: +5, vibes: +2 }, pose: 'stand', line: 'is cooling off' }],
  },
  {
    id: 'cooler', name: 'Cooler', emoji: '🧊', blurb: 'An ice chest. Buy ice separately.', price: 600, slot: 'kitchen', tier: 1, model: 'cooler', color: '#1D9BF0',
    actions: [{ id: 'drink', label: 'Grab a cold drink', emoji: '🥤', seconds: 5, bags: 50, me: { vibes: +5 }, pose: 'stand', line: 'is having a cold one' }],
  },
  {
    id: 'bedframe', name: 'Wooden bed frame', emoji: '🛏️', blurb: 'Off the floor at last.', price: 2500, slot: 'bed', tier: 1, model: 'bedframe', color: '#8B6F47',
    actions: [
      { id: 'nap', label: 'Quick nap', emoji: '😴', seconds: 20, bags: 0, me: { gas: +12 }, pose: 'lie', line: 'is napping' },
      { id: 'sleep', label: 'Sleep till morning', emoji: '🌙', seconds: 60, bags: 0, me: { gas: +35 }, pose: 'lie', line: 'is asleep' },
    ],
  },
  {
    id: 'dining', name: 'Dining table', emoji: '🍽️', blurb: 'Four chairs. Guests expected.', price: 2000, slot: 'table', tier: 1, model: 'dining', color: '#5C4033',
    actions: [
      { id: 'eat', label: 'Eat at the table', emoji: '🍛', seconds: 10, bags: 120, me: { gas: +12, vibes: +3 }, pose: 'sit', line: 'is eating' },
      { id: 'plan', label: 'Plan the hustle', emoji: '📝', seconds: 10, bags: 0, me: { clout: +3, gas: -1 }, pose: 'sit', line: 'is planning' },
    ],
  },

  // ----- tier 2 -----
  {
    id: 'sofa_velvet', name: 'Velvet Sofa', emoji: '🛋️', blurb: 'Mummy-approved. Keep the nylon on? Your choice.', price: 4000, slot: 'seat', tier: 2, model: 'sofa', color: '#2D6A4F',
    actions: [
      { id: 'relax', label: 'Kick Back & Relax', emoji: '🛋️', seconds: 9, bags: 0, me: { gas: +6, vibes: +4 }, pose: 'sit', line: 'is kicking back' },
      { id: 'nap', label: 'Nap on Sofa', emoji: '😴', seconds: 15, bags: 0, me: { gas: +10 }, pose: 'lie', line: 'is napping on the sofa' },
      { id: 'gist', label: 'Gist on Phone', emoji: '📱', seconds: 7, bags: 0, me: { clout: +5 }, pose: 'sit', line: 'is gisting on the phone' },
      { id: 'chill', label: 'Sit & Chill', emoji: '😎', seconds: 28, bags: 0, me: { gas: +12, vibes: +8 }, pose: 'sit', line: 'is chilling' },
    ],
  },
  {
    id: 'tv', name: 'Flat-screen TV', emoji: '📺', blurb: 'Nollywood, the match, and the news you avoid.', price: 6000, slot: 'wall', tier: 2, model: 'tv', color: '#0B0E14', needsPower: true,
    actions: [
      { id: 'nollywood', label: 'Watch Nollywood', emoji: '🎬', seconds: 30, bags: 0, me: { vibes: +12 }, pose: 'sit', line: 'is watching Nollywood' },
      { id: 'match', label: 'Watch the match', emoji: '⚽', seconds: 45, bags: 0, me: { vibes: +8, clout: +5 }, pose: 'sit', line: 'is watching the match' },
    ],
  },
  {
    id: 'shower', name: 'Shower + water heater', emoji: '🚿', blurb: 'Hot water on demand. Welcome to comfort.', price: 5000, slot: 'bath', tier: 2, model: 'shower', color: '#BFE3FF', needsPower: true,
    actions: [{ id: 'hot', label: 'Hot shower', emoji: '🚿', seconds: 10, bags: 0, me: { vibes: +10, gas: +5 }, pose: 'stand', line: 'is taking a hot shower' }],
  },
  {
    id: 'fridge', name: 'Fridge', emoji: '🧊', blurb: 'Leftover jollof, cold Malta, and a light that works.', price: 8000, slot: 'kitchen', tier: 2, model: 'fridge', color: '#F4F1DE', needsPower: true,
    actions: [
      { id: 'jollof', label: 'Eat leftover jollof', emoji: '🍛', seconds: 10, bags: 100, me: { gas: +18, vibes: +4 }, pose: 'stand', line: 'is eating leftover jollof' },
      { id: 'malta', label: 'Cold Malta', emoji: '🍾', seconds: 5, bags: 60, me: { gas: +6, vibes: +5 }, pose: 'stand', line: 'is drinking a cold Malta' },
    ],
  },
  {
    id: 'generator', name: 'Small generator', emoji: '⚡', blurb: '"I better pass my neighbour." Loud, but the light stays on.', price: 7000, slot: 'power', tier: 2, model: 'generator', color: '#FFD166',
    actions: [{ id: 'fuel', label: 'Buy fuel & power on', emoji: '⛽', seconds: 5, bags: 150, me: { clout: +2 }, pose: 'stand', line: 'put the gen on' }],
  },

  // ----- tier 3 -----
  {
    id: 'ac', name: 'Split AC', emoji: '❄️', blurb: 'Close the door. Cold room energy.', price: 12000, slot: 'comfort', tier: 3, model: 'ac', color: '#FFFFFF', needsPower: true,
    actions: [{ id: 'chill', label: 'Chill in the cold', emoji: '❄️', seconds: 20, bags: 0, me: { gas: +12, vibes: +8 }, pose: 'stand', line: 'is enjoying the AC' }],
  },
  {
    id: 'chandelier', name: 'Chandelier', emoji: '✨', blurb: 'Every visitor looks up.', price: 3000, slot: 'light', tier: 2, model: 'chandelier', color: '#FFD089', needsPower: true,
    actions: [{ id: 'admire', label: 'Admire the light', emoji: '✨', seconds: 6, bags: 0, me: { vibes: +4, clout: +3 }, pose: 'stand', line: 'is admiring the chandelier' }],
  },
  {
    id: 'console', name: 'PS5 corner', emoji: '🎮', blurb: 'FIFA till 3am. Friends optional, trash talk mandatory.', price: 18000, slot: 'wall', tier: 3, model: 'console', color: '#8338EC', needsPower: true,
    actions: [
      { id: 'fifa', label: 'Play FIFA', emoji: '🎮', seconds: 40, bags: 0, me: { vibes: +18, gas: -4 }, pose: 'sit', line: 'is playing FIFA' },
      { id: 'friend', label: 'Invite a friend to play', emoji: '🕹️', seconds: 40, bags: 0, me: { vibes: +12, clout: +8, gas: -4 }, pose: 'sit', line: 'is playing FIFA with a friend' },
    ],
  },
  {
    id: 'kingbed', name: 'King bed + duvet', emoji: '👑', blurb: 'Sleep like you own the building.', price: 22000, slot: 'bed', tier: 3, model: 'kingbed', color: '#F4F1DE',
    actions: [
      { id: 'nap', label: 'Power nap', emoji: '😴', seconds: 15, bags: 0, me: { gas: +18 }, pose: 'lie', line: 'is power napping' },
      { id: 'sleep', label: 'Sleep like a boss', emoji: '👑', seconds: 60, bags: 0, me: { gas: +100, vibes: +5 }, pose: 'lie', line: 'is sleeping like a boss' },
    ],
  },
];

export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id) ?? null;

/** Everyone starts with these. Free, and they cannot be sold. */
export const STARTER_KIT = ['chair_plastic', 'mattress_foam', 'bucket', 'table_small', 'bulb'] as const;

/** Half the price back when you sell. Starter pieces are worth nothing. */
export const resaleValue = (paid: number) => Math.floor(paid / 2);

// ----- the room -----
// One room, 14 wide (x) by 12 deep (z), centred on the origin. Back wall at z = -6, right wall at x = +7;
// the front and left are open to the camera, which sits front-left like the reference. The door is on the
// back wall, the window on the right wall.

export const ROOM_W = 14;
export const ROOM_D = 12;
export const WALL_H = 4.2;
export const DOOR_X = -4;
export const SPAWN = { x: -1.5, z: 3 };

export type SlotSpot = { x: number; z: number; rot: number; /** where the avatar stands to use it */ use: { x: number; z: number } };

export const SLOTS: Record<Slot, SlotSpot> = {
  bed: { x: 4.6, z: -4.1, rot: 0, use: { x: 4.6, z: -4.1 } },
  wall: { x: 0, z: -5.6, rot: 0, use: { x: 0, z: -3.2 } },
  light: { x: 0, z: 0, rot: 0, use: { x: 0.8, z: 0.8 } },
  seat: { x: -2.6, z: 0.4, rot: Math.PI, use: { x: -2.6, z: 0.4 } },
  table: { x: 3.4, z: 1.6, rot: 0, use: { x: 3.4, z: 2.9 } },
  kitchen: { x: 6.2, z: 3.6, rot: -Math.PI / 2, use: { x: 4.9, z: 3.6 } },
  bath: { x: -5.6, z: 4.2, rot: Math.PI / 2, use: { x: -4.3, z: 4.2 } },
  comfort: { x: -5.6, z: -4.4, rot: Math.PI / 2, use: { x: -4.2, z: -4.4 } },
  power: { x: 5.8, z: 5.2, rot: 0, use: { x: 4.4, z: 5.2 } },
};

/** Footprint (w × d, before rotation) per model, for walking around things. Ceiling and wall-mounted pieces take no floor. */
export const FOOTPRINT: Record<FurnitureModel, { w: number; d: number } | null> = {
  chair: { w: 0.9, d: 0.9 }, sofa: { w: 3.2, d: 1.4 }, mattress: { w: 2.2, d: 3.2 }, bedframe: { w: 2.4, d: 3.4 }, kingbed: { w: 3.2, d: 3.6 },
  bucket: { w: 0.9, d: 0.9 }, shower: { w: 1.6, d: 1.6 }, table: { w: 1.4, d: 1.0 }, dining: { w: 2.8, d: 1.8 }, bulb: null, chandelier: null,
  fan: { w: 0.8, d: 0.8 }, ac: null, cooler: { w: 1.1, d: 0.8 }, fridge: { w: 1.2, d: 1.1 }, tv: null, console: { w: 1.6, d: 0.6 }, generator: { w: 1.4, d: 0.9 },
};

// ----- NEPA -----
// Public power follows a fixed timetable so every player sees the same outage: half an hour dark every two
// hours. A fuelled generator keeps the lights on through it.

const OUTAGE_PERIOD = 2 * 3600_000;
const OUTAGE_LEN = 30 * 60_000;
export const GENERATOR_RUN = 3600; // seconds of light per tank

export function publicPower(now = Date.now()): { on: boolean; changesAt: number } {
  const into = now % OUTAGE_PERIOD;
  const on = into >= OUTAGE_LEN;
  return { on, changesAt: now - into + (on ? OUTAGE_PERIOD : OUTAGE_LEN) };
}

export type PowerState = { grid: boolean; generator: boolean; /** epoch ms when the current state changes */ changesAt: number };

export const hasPower = (p: PowerState) => p.grid || p.generator;

export type HomeItem = { itemId: string; slot: Slot; paid: number; stored: boolean; acquiredAt: string };
export type HomeView = {
  owner: { handle: string; name: string; avatarUrl: string | null };
  mine: boolean;
  placed: HomeItem[];
  stored: HomeItem[];
  power: PowerState;
};
