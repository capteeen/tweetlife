import type { Stats } from './stats';

// The house. Every player gets one room with a starter kit; everything else is bought in the Market's
// Home tab with bags (in-world points) and sits in a fixed slot. Every piece has actions, like a venue:
// a duration, a cost (free or bags), and what it does to Vibes / Clout / Gas.

export type Slot = 'seat' | 'bed' | 'bath' | 'kitchen' | 'wall' | 'power' | 'comfort' | 'table' | 'light' | 'rug' | 'desk' | 'plant' | 'lamp' | 'bar' | 'art' | 'audio';

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
  | 'bulb' | 'chandelier' | 'fan' | 'ac' | 'cooler' | 'fridge' | 'tv' | 'console' | 'generator'
  // modern
  | 'sectional' | 'beanbag' | 'recliner' | 'platformbed' | 'jacuzzi' | 'smartfridge' | 'coffee' | 'airfryer'
  | 'smarttv' | 'projector' | 'inverter' | 'towerfan' | 'inverterac' | 'glasstable' | 'marbledining'
  | 'ledstrips' | 'pendant' | 'rug' | 'standingdesk' | 'gamingsetup' | 'homeoffice' | 'plant' | 'floorlamp'
  | 'smartlamp' | 'barcart' | 'minibar' | 'canvas' | 'neon' | 'gallery' | 'speaker' | 'soundbar' | 'hifi';

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
  /** a power source: using it keeps the house lit for this many seconds through an outage */
  powerSeconds?: number;
  /** colour variant for shared models (rugs, plants, art) */
  variant?: string;
  actions: FurnitureAction[];
};

export const SLOT_LABEL: Record<Slot, string> = {
  seat: 'Seating', bed: 'Sleep', bath: 'Bathroom', kitchen: 'Kitchen', wall: 'Entertainment', power: 'Power',
  comfort: 'Comfort', table: 'Table', light: 'Lighting', rug: 'Rugs', desk: 'Workspace', plant: 'Plants',
  lamp: 'Lamps', bar: 'Bar', art: 'Wall art', audio: 'Sound',
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
    id: 'generator', name: 'Small generator', emoji: '⚡', blurb: '"I better pass my neighbour." Loud, but the light stays on.', price: 7000, slot: 'power', tier: 2, model: 'generator', color: '#FFD166', powerSeconds: 3600,
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

  // ===== modern =====
  // seating
  {
    id: 'beanbag', name: 'Giant beanbag', emoji: '🫘', blurb: 'Sink in. Getting out is tomorrow\'s problem.', price: 1200, slot: 'seat', tier: 1, model: 'beanbag', color: '#FF5D8F',
    actions: [
      { id: 'sink', label: 'Sink in', emoji: '🫘', seconds: 10, bags: 0, me: { gas: +5, vibes: +4 }, pose: 'sit', line: 'has sunk into the beanbag' },
      { id: 'scroll', label: 'Doomscroll', emoji: '📱', seconds: 12, bags: 0, me: { clout: +3, vibes: -1 }, pose: 'sit', line: 'is doomscrolling' },
    ],
  },
  {
    id: 'sectional', name: 'L-shaped sectional', emoji: '🛋️', blurb: 'Grey bouclé, seats six, hides crumbs.', price: 9000, slot: 'seat', tier: 3, model: 'sectional', color: '#9AA6B8',
    actions: [
      { id: 'lounge', label: 'Lounge', emoji: '🛋️', seconds: 12, bags: 0, me: { gas: +8, vibes: +6 }, pose: 'sit', line: 'is lounging' },
      { id: 'nap', label: 'Nap on the long side', emoji: '😴', seconds: 18, bags: 0, me: { gas: +14 }, pose: 'lie', line: 'is napping on the sectional' },
      { id: 'host', label: 'Host the gang', emoji: '🎉', seconds: 30, bags: 300, me: { vibes: +12, clout: +10, gas: -3 }, pose: 'sit', line: 'is hosting' },
      { id: 'netflix', label: 'Netflix & chill', emoji: '🍿', seconds: 30, bags: 0, me: { vibes: +10, gas: +6 }, pose: 'sit', line: 'is on Netflix and chill' },
    ],
  },
  {
    id: 'recliner', name: 'Massage recliner', emoji: '💆', blurb: 'Leather, heated, and it kneads your back.', price: 15000, slot: 'seat', tier: 3, model: 'recliner', color: '#5C4033', needsPower: true,
    actions: [
      { id: 'massage', label: 'Full-body massage', emoji: '💆', seconds: 25, bags: 0, me: { gas: +20, vibes: +8 }, pose: 'sit', line: 'is getting a massage' },
      { id: 'recline', label: 'Recline & nap', emoji: '😴', seconds: 15, bags: 0, me: { gas: +12 }, pose: 'lie', line: 'is reclined' },
    ],
  },
  // sleep
  {
    id: 'platformbed', name: 'Platform bed + LED', emoji: '🛏️', blurb: 'Floating frame, under-glow, hotel sheets.', price: 12000, slot: 'bed', tier: 2, model: 'platformbed', color: '#1B2436', needsPower: true,
    actions: [
      { id: 'nap', label: 'Power nap', emoji: '😴', seconds: 15, bags: 0, me: { gas: +16 }, pose: 'lie', line: 'is power napping' },
      { id: 'sleep', label: 'Sleep in the glow', emoji: '🌌', seconds: 60, bags: 0, me: { gas: +60, vibes: +6 }, pose: 'lie', line: 'is asleep in the glow' },
    ],
  },
  // bathroom
  {
    id: 'jacuzzi', name: 'Jacuzzi tub', emoji: '🛁', blurb: 'Bubbles, jets, and a glass of something.', price: 25000, slot: 'bath', tier: 3, model: 'jacuzzi', color: '#FFFFFF', needsPower: true,
    actions: [
      { id: 'soak', label: 'Long soak', emoji: '🛁', seconds: 25, bags: 0, me: { vibes: +15, gas: +12 }, pose: 'sit', line: 'is soaking in the jacuzzi' },
      { id: 'spa', label: 'Spa night', emoji: '🕯️', seconds: 40, bags: 500, me: { vibes: +22, gas: +15, clout: +4 }, pose: 'sit', line: 'is having a spa night' },
    ],
  },
  // kitchen
  {
    id: 'airfryer', name: 'Air fryer', emoji: '🍟', blurb: 'Crispy everything in twelve minutes.', price: 2200, slot: 'kitchen', tier: 1, model: 'airfryer', color: '#0B0E14', needsPower: true,
    actions: [
      { id: 'yam', label: 'Air-fry yam & egg', emoji: '🍳', seconds: 12, bags: 120, me: { gas: +16, vibes: +3 }, pose: 'stand', line: 'is air-frying yam' },
      { id: 'wings', label: 'Crispy wings', emoji: '🍗', seconds: 12, bags: 180, me: { gas: +18, vibes: +6 }, pose: 'stand', line: 'is making wings' },
    ],
  },
  {
    id: 'coffee', name: 'Espresso machine', emoji: '☕', blurb: 'Chrome, loud, and worth every bag.', price: 3500, slot: 'kitchen', tier: 2, model: 'coffee', color: '#9AA6B8', needsPower: true,
    actions: [
      { id: 'espresso', label: 'Double espresso', emoji: '☕', seconds: 6, bags: 80, me: { gas: +12, clout: +1 }, pose: 'stand', line: 'is pulling a shot' },
      { id: 'latte', label: 'Oat latte for a guest', emoji: '🥛', seconds: 8, bags: 150, me: { clout: +6, vibes: +3 }, pose: 'stand', line: 'is making lattes' },
    ],
  },
  {
    id: 'smartfridge', name: 'Smart fridge', emoji: '🧊', blurb: 'Touchscreen door, ice maker, judges your groceries.', price: 20000, slot: 'kitchen', tier: 3, model: 'smartfridge', color: '#2F3A4A', needsPower: true,
    actions: [
      { id: 'mealprep', label: 'Meal-prep feast', emoji: '🥗', seconds: 14, bags: 200, me: { gas: +25, vibes: +5 }, pose: 'stand', line: 'is eating meal prep' },
      { id: 'smoothie', label: 'Protein smoothie', emoji: '🥤', seconds: 6, bags: 120, me: { gas: +12, vibes: +4 }, pose: 'stand', line: 'is blending' },
      { id: 'champagne', label: 'Pop champagne', emoji: '🍾', seconds: 8, bags: 800, me: { vibes: +15, clout: +10 }, pose: 'stand', line: 'popped champagne 🍾' },
    ],
  },
  // entertainment wall
  {
    id: 'smarttv', name: '65" smart TV', emoji: '📺', blurb: 'OLED. Blacks so deep you lose the remote in them.', price: 14000, slot: 'wall', tier: 3, model: 'smarttv', color: '#0B0E14', needsPower: true,
    actions: [
      { id: 'binge', label: 'Binge a series', emoji: '🎬', seconds: 45, bags: 0, me: { vibes: +18, gas: +4 }, pose: 'sit', line: 'is binge-watching' },
      { id: 'match', label: 'Champions League night', emoji: '⚽', seconds: 45, bags: 0, me: { vibes: +12, clout: +8 }, pose: 'sit', line: 'is watching the match' },
      { id: 'youtube', label: 'YouTube rabbit hole', emoji: '📱', seconds: 20, bags: 0, me: { vibes: +6, clout: +3 }, pose: 'sit', line: 'is down a rabbit hole' },
    ],
  },
  {
    id: 'projector', name: 'Home cinema projector', emoji: '🎥', blurb: 'A whole wall of film. Popcorn not included.', price: 30000, slot: 'wall', tier: 3, model: 'projector', color: '#1B2436', needsPower: true,
    actions: [
      { id: 'movie', label: 'Movie night', emoji: '🍿', seconds: 60, bags: 0, me: { vibes: +25, gas: +5 }, pose: 'sit', line: 'is at the movies' },
      { id: 'premiere', label: 'Invite everyone to a premiere', emoji: '🎟️', seconds: 60, bags: 600, me: { vibes: +20, clout: +18 }, pose: 'sit', line: 'is hosting a premiere' },
    ],
  },
  // power
  {
    id: 'inverter', name: 'Solar inverter + battery', emoji: '☀️', blurb: 'Silent. NEPA who? Six hours of light per charge.', price: 40000, slot: 'power', tier: 3, model: 'inverter', color: '#06D6A0', powerSeconds: 6 * 3600,
    actions: [{ id: 'charge', label: 'Charge from the sun', emoji: '☀️', seconds: 5, bags: 0, me: { clout: +3, vibes: +2 }, pose: 'stand', line: 'switched to solar' }],
  },
  // comfort
  {
    id: 'towerfan', name: 'Tower fan', emoji: '🌬️', blurb: 'Bladeless, quiet, slightly smug.', price: 2000, slot: 'comfort', tier: 1, model: 'towerfan', color: '#E8DCC8', needsPower: true,
    actions: [{ id: 'breeze', label: 'Catch the breeze', emoji: '🌬️', seconds: 10, bags: 0, me: { gas: +7, vibes: +3 }, pose: 'stand', line: 'is catching a breeze' }],
  },
  {
    id: 'inverterac', name: 'Inverter AC', emoji: '❄️', blurb: 'Whisper-quiet cold and a lighter light bill.', price: 25000, slot: 'comfort', tier: 3, model: 'inverterac', color: '#FFFFFF', needsPower: true,
    actions: [
      { id: 'chill', label: 'Deep chill', emoji: '❄️', seconds: 20, bags: 0, me: { gas: +16, vibes: +10 }, pose: 'stand', line: 'is deep chilling' },
      { id: 'sleepmode', label: 'Sleep mode nap', emoji: '😴', seconds: 25, bags: 0, me: { gas: +20 }, pose: 'stand', line: 'is napping in the cold' },
    ],
  },
  // tables
  {
    id: 'glasstable', name: 'Glass coffee table', emoji: '🪟', blurb: 'Tempered glass, gold legs, fingerprints forever.', price: 3000, slot: 'table', tier: 2, model: 'glasstable', color: '#FFD089',
    actions: [
      { id: 'plan', label: 'Plan the hustle', emoji: '📝', seconds: 10, bags: 0, me: { clout: +4 }, pose: 'stand', line: 'is planning' },
      { id: 'snacks', label: 'Lay out small chops', emoji: '🍢', seconds: 8, bags: 200, me: { vibes: +6, clout: +4 }, pose: 'stand', line: 'laid out small chops' },
    ],
  },
  {
    id: 'marbledining', name: 'Marble dining table', emoji: '🍽️', blurb: 'Seats eight. The owambe starts here.', price: 9000, slot: 'table', tier: 3, model: 'marbledining', color: '#F4F1DE',
    actions: [
      { id: 'dinner', label: 'Dinner party', emoji: '🍽️', seconds: 30, bags: 500, me: { gas: +18, vibes: +12, clout: +12 }, pose: 'sit', line: 'is hosting dinner' },
      { id: 'brunch', label: 'Sunday brunch', emoji: '🥞', seconds: 15, bags: 250, me: { gas: +14, vibes: +8 }, pose: 'sit', line: 'is at brunch' },
    ],
  },
  // lighting
  {
    id: 'ledstrips', name: 'RGB LED strips', emoji: '🌈', blurb: 'Every colour, every mood, every TikTok.', price: 2500, slot: 'light', tier: 1, model: 'ledstrips', color: '#8338EC', needsPower: true,
    actions: [
      { id: 'vibe', label: 'Set the vibe', emoji: '🌈', seconds: 6, bags: 0, me: { vibes: +6 }, pose: 'stand', line: 'set the vibe' },
      { id: 'tiktok', label: 'Film a TikTok', emoji: '🎵', seconds: 15, bags: 0, me: { clout: +8, gas: -2 }, pose: 'stand', line: 'is filming a TikTok' },
    ],
  },
  {
    id: 'pendant', name: 'Pendant lights', emoji: '💡', blurb: 'Three brass pendants. Warm. Architectural.', price: 6000, slot: 'light', tier: 2, model: 'pendant', color: '#FFD089', needsPower: true,
    actions: [{ id: 'read', label: 'Read in warm light', emoji: '📖', seconds: 12, bags: 0, me: { clout: +4, vibes: +3 }, pose: 'stand', line: 'is reading' }],
  },
  // rugs
  {
    id: 'rug_persian', name: 'Persian rug', emoji: '🧶', blurb: 'Red and gold. Shoes off, please.', price: 1500, slot: 'rug', tier: 1, model: 'rug', variant: '#A4243B', color: '#A4243B',
    actions: [{ id: 'stretch', label: 'Stretch on the rug', emoji: '🧘', seconds: 10, bags: 0, me: { gas: +5, vibes: +3 }, pose: 'stand', line: 'is stretching' }],
  },
  {
    id: 'rug_shaggy', name: 'Shaggy rug', emoji: '🐑', blurb: 'Cream, deep pile, dangerously comfortable.', price: 4000, slot: 'rug', tier: 2, model: 'rug', variant: '#EDE4D3', color: '#EDE4D3',
    actions: [
      { id: 'yoga', label: 'Morning yoga', emoji: '🧘', seconds: 15, bags: 0, me: { gas: +8, vibes: +5 }, pose: 'stand', line: 'is doing yoga' },
      { id: 'floor', label: 'Lie on the floor and think', emoji: '💭', seconds: 12, bags: 0, me: { vibes: +4, clout: +2 }, pose: 'lie', line: 'is lying on the rug thinking' },
    ],
  },
  {
    id: 'rug_designer', name: 'Designer rug', emoji: '🎨', blurb: 'Abstract, hand-tufted, a conversation starter.', price: 9000, slot: 'rug', tier: 3, model: 'rug', variant: '#2EC4B6', color: '#2EC4B6',
    actions: [
      { id: 'yoga', label: 'Morning yoga', emoji: '🧘', seconds: 15, bags: 0, me: { gas: +8, vibes: +6 }, pose: 'stand', line: 'is doing yoga' },
      { id: 'shoot', label: 'Photo shoot on the rug', emoji: '📸', seconds: 12, bags: 0, me: { clout: +10 }, pose: 'stand', line: 'is doing a photo shoot' },
    ],
  },
  // workspace
  {
    id: 'homeoffice', name: 'Laptop desk', emoji: '💻', blurb: 'A desk, a laptop, a dream.', price: 4000, slot: 'desk', tier: 1, model: 'homeoffice', color: '#C99A5B',
    actions: [
      { id: 'work', label: 'Remote work shift (+400 bags)', emoji: '💻', seconds: 30, bags: -400, me: { gas: -10, clout: +2 }, pose: 'sit', line: 'is on a remote shift' },
      { id: 'thread', label: 'Write a thread', emoji: '🧵', seconds: 12, bags: 0, me: { clout: +8, gas: -3 }, pose: 'sit', line: 'is writing a thread' },
    ],
  },
  {
    id: 'standingdesk', name: 'Standing desk', emoji: '🧍', blurb: 'Motorised. Stand, sit, pretend to be productive.', price: 7000, slot: 'desk', tier: 2, model: 'standingdesk', color: '#FFFFFF', needsPower: true,
    actions: [
      { id: 'work', label: 'Deep work (+700 bags)', emoji: '💻', seconds: 40, bags: -700, me: { gas: -12, clout: +4 }, pose: 'stand', line: 'is in deep work' },
      { id: 'calls', label: 'Back-to-back calls', emoji: '🎧', seconds: 20, bags: 0, me: { clout: +8, vibes: -3 }, pose: 'stand', line: 'is on calls' },
    ],
  },
  {
    id: 'gamingsetup', name: 'RGB gaming setup', emoji: '🖥️', blurb: 'Triple monitors, mechanical keys, a chair that costs more than a keke.', price: 35000, slot: 'desk', tier: 3, model: 'gamingsetup', color: '#8338EC', needsPower: true,
    actions: [
      { id: 'rank', label: 'Ranked grind', emoji: '🎮', seconds: 40, bags: 0, me: { vibes: +20, gas: -6 }, pose: 'sit', line: 'is grinding ranked' },
      { id: 'stream', label: 'Go live on Twitch', emoji: '📡', seconds: 45, bags: -300, me: { clout: +18, vibes: +8, gas: -8 }, pose: 'sit', line: 'is live on Twitch' },
      { id: 'trade', label: 'Trade with six screens', emoji: '📈', seconds: 20, bags: 0, me: { clout: +6, gas: -4 }, pose: 'sit', line: 'is trading on six screens' },
    ],
  },
  // plants
  {
    id: 'snake_plant', name: 'Snake plant', emoji: '🪴', blurb: 'Survives neglect. Like you.', price: 800, slot: 'plant', tier: 1, model: 'plant', variant: 'snake', color: '#2D6A4F',
    actions: [{ id: 'water', label: 'Water it', emoji: '💧', seconds: 5, bags: 0, me: { vibes: +3 }, pose: 'stand', line: 'is watering the plants' }],
  },
  {
    id: 'monstera', name: 'Monstera', emoji: '🌿', blurb: 'Big leaves, big energy.', price: 2000, slot: 'plant', tier: 2, model: 'plant', variant: 'monstera', color: '#2D6A4F',
    actions: [
      { id: 'water', label: 'Water & mist', emoji: '💧', seconds: 6, bags: 0, me: { vibes: +5 }, pose: 'stand', line: 'is misting the monstera' },
      { id: 'breathe', label: 'Breathe with it', emoji: '🌿', seconds: 10, bags: 0, me: { gas: +4, vibes: +4 }, pose: 'stand', line: 'is breathing' },
    ],
  },
  {
    id: 'fiddle_fig', name: 'Fiddle-leaf fig', emoji: '🌳', blurb: 'Two metres of leaf. Instagram famous.', price: 5000, slot: 'plant', tier: 3, model: 'plant', variant: 'fig', color: '#2D6A4F',
    actions: [
      { id: 'water', label: 'Water & mist', emoji: '💧', seconds: 6, bags: 0, me: { vibes: +6 }, pose: 'stand', line: 'is tending the fig' },
      { id: 'pose', label: 'Pose beside it', emoji: '📸', seconds: 8, bags: 0, me: { clout: +8 }, pose: 'stand', line: 'is posing with the fig' },
    ],
  },
  // lamps
  {
    id: 'floorlamp', name: 'Arc floor lamp', emoji: '🪔', blurb: 'Swoops over the sofa like it owns the place.', price: 2500, slot: 'lamp', tier: 1, model: 'floorlamp', color: '#FFD089', needsPower: true,
    actions: [{ id: 'read', label: 'Read under the arc', emoji: '📖', seconds: 12, bags: 0, me: { clout: +4, vibes: +2 }, pose: 'stand', line: 'is reading' }],
  },
  {
    id: 'smartlamp', name: 'Smart lamp', emoji: '🔮', blurb: 'Sixteen million colours. Talks to your phone.', price: 6000, slot: 'lamp', tier: 2, model: 'smartlamp', color: '#2EC4B6', needsPower: true,
    actions: [
      { id: 'mood', label: 'Mood lighting', emoji: '🔮', seconds: 6, bags: 0, me: { vibes: +6 }, pose: 'stand', line: 'set mood lighting' },
      { id: 'sunrise', label: 'Sunrise wake-up', emoji: '🌅', seconds: 10, bags: 0, me: { gas: +8, vibes: +3 }, pose: 'stand', line: 'is waking up slowly' },
    ],
  },
  // bar
  {
    id: 'barcart', name: 'Bar cart', emoji: '🍸', blurb: 'Gold cart, glass shelves, bottles you can\'t pronounce.', price: 5000, slot: 'bar', tier: 2, model: 'barcart', color: '#FFD089',
    actions: [
      { id: 'cocktail', label: 'Mix a cocktail', emoji: '🍸', seconds: 8, bags: 150, me: { vibes: +8, clout: +3 }, pose: 'stand', line: 'is mixing a cocktail' },
      { id: 'round', label: 'Drinks for guests', emoji: '🥂', seconds: 12, bags: 400, me: { vibes: +8, clout: +10 }, pose: 'stand', line: 'poured drinks for everyone' },
    ],
  },
  {
    id: 'minibar', name: 'Wine fridge', emoji: '🍷', blurb: 'Glass door, blue light, twelve bottles.', price: 15000, slot: 'bar', tier: 3, model: 'minibar', color: '#1B2436', needsPower: true,
    actions: [
      { id: 'glass', label: 'Pour a glass', emoji: '🍷', seconds: 6, bags: 200, me: { vibes: +9, gas: -1 }, pose: 'stand', line: 'is sipping wine' },
      { id: 'tasting', label: 'Wine tasting night', emoji: '🍇', seconds: 25, bags: 900, me: { vibes: +16, clout: +14 }, pose: 'stand', line: 'is hosting a tasting' },
    ],
  },
  // wall art
  {
    id: 'canvas_art', name: 'Abstract canvas', emoji: '🖼️', blurb: 'Big, bold, nobody knows what it means.', price: 3000, slot: 'art', tier: 1, model: 'canvas', variant: '#F28C28', color: '#F28C28',
    actions: [{ id: 'admire', label: 'Admire it', emoji: '🖼️', seconds: 6, bags: 0, me: { vibes: +4, clout: +2 }, pose: 'stand', line: 'is admiring the art' }],
  },
  {
    id: 'neon_sign', name: 'Neon sign', emoji: '💗', blurb: '"good vibes only", in pink, buzzing softly.', price: 8000, slot: 'art', tier: 2, model: 'neon', color: '#FF5D8F', needsPower: true,
    actions: [
      { id: 'selfie', label: 'Neon selfie', emoji: '🤳', seconds: 6, bags: 0, me: { clout: +8, vibes: +3 }, pose: 'stand', line: 'is taking a neon selfie' },
    ],
  },
  {
    id: 'gallery_wall', name: 'Gallery wall', emoji: '🎨', blurb: 'Nine frames, one grid, hours of levelling.', price: 12000, slot: 'art', tier: 3, model: 'gallery', color: '#F4F1DE',
    actions: [
      { id: 'tour', label: 'Give a guest the tour', emoji: '🎨', seconds: 10, bags: 0, me: { clout: +8, vibes: +4 }, pose: 'stand', line: 'is giving the gallery tour' },
    ],
  },
  // sound
  {
    id: 'speaker', name: 'Bluetooth speaker', emoji: '🔊', blurb: 'Small, loud, always on 100.', price: 2000, slot: 'audio', tier: 1, model: 'speaker', color: '#0B0E14', needsPower: true,
    actions: [
      { id: 'afrobeats', label: 'Play Afrobeats', emoji: '🎶', seconds: 15, bags: 0, me: { vibes: +8 }, pose: 'stand', line: 'is playing Afrobeats' },
      { id: 'dance', label: 'Dance in the room', emoji: '💃', seconds: 15, bags: 0, me: { vibes: +10, gas: -5 }, pose: 'stand', line: 'is dancing' },
    ],
  },
  {
    id: 'soundbar', name: 'Soundbar + sub', emoji: '🎚️', blurb: 'The neighbours know the bassline.', price: 7000, slot: 'audio', tier: 2, model: 'soundbar', color: '#1B2436', needsPower: true,
    actions: [
      { id: 'playlist', label: 'Run the playlist', emoji: '🎶', seconds: 20, bags: 0, me: { vibes: +12 }, pose: 'stand', line: 'is running the playlist' },
      { id: 'party', label: 'House party', emoji: '🎉', seconds: 40, bags: 500, me: { vibes: +18, clout: +14, gas: -8 }, pose: 'stand', line: 'is throwing a house party' },
    ],
  },
  {
    id: 'hifi', name: 'Hi-fi + turntable', emoji: '🎧', blurb: 'Vinyl, tube amp, a sound you can taste.', price: 20000, slot: 'audio', tier: 3, model: 'hifi', color: '#C99A5B', needsPower: true,
    actions: [
      { id: 'vinyl', label: 'Spin a record', emoji: '🎧', seconds: 25, bags: 0, me: { vibes: +16, gas: +4 }, pose: 'stand', line: 'is spinning vinyl' },
      { id: 'listening', label: 'Listening party', emoji: '🎉', seconds: 40, bags: 700, me: { vibes: +18, clout: +18 }, pose: 'stand', line: 'is hosting a listening party' },
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
  // modern additions: the rug lies under the seating, the desk sits under the window, the rest fill the gaps
  rug: { x: -1.8, z: 1.2, rot: 0, use: { x: -0.6, z: 2.4 } },
  desk: { x: 6.1, z: -1.4, rot: -Math.PI / 2, use: { x: 4.9, z: -1.4 } },
  plant: { x: -2.1, z: -5.2, rot: 0, use: { x: -2.1, z: -4.0 } },
  lamp: { x: -5.1, z: 1.9, rot: 0, use: { x: -4.0, z: 1.9 } },
  bar: { x: 2.2, z: 5.0, rot: 0, use: { x: 2.2, z: 3.8 } },
  art: { x: 4.6, z: -5.75, rot: 0, use: { x: 4.6, z: -2.0 } },
  audio: { x: -6.0, z: -0.4, rot: Math.PI / 2, use: { x: -4.9, z: -0.4 } },
};

/** Footprint (w × d, before rotation) per model, for walking around things. Ceiling and wall-mounted pieces take no floor. */
export const FOOTPRINT: Record<FurnitureModel, { w: number; d: number } | null> = {
  chair: { w: 0.9, d: 0.9 }, sofa: { w: 3.2, d: 1.4 }, mattress: { w: 2.2, d: 3.2 }, bedframe: { w: 2.4, d: 3.4 }, kingbed: { w: 3.2, d: 3.6 },
  bucket: { w: 0.9, d: 0.9 }, shower: { w: 1.6, d: 1.6 }, table: { w: 1.4, d: 1.0 }, dining: { w: 2.8, d: 1.8 }, bulb: null, chandelier: null,
  fan: { w: 0.8, d: 0.8 }, ac: null, cooler: { w: 1.1, d: 0.8 }, fridge: { w: 1.2, d: 1.1 }, tv: null, console: { w: 1.6, d: 0.6 }, generator: { w: 1.4, d: 0.9 },
  sectional: { w: 3.6, d: 2.6 }, beanbag: { w: 1.3, d: 1.3 }, recliner: { w: 1.2, d: 1.5 }, platformbed: { w: 3.0, d: 3.6 }, jacuzzi: { w: 2.0, d: 2.0 },
  smartfridge: { w: 1.4, d: 1.1 }, coffee: { w: 0.8, d: 0.7 }, airfryer: { w: 0.7, d: 0.7 }, smarttv: null, projector: null, inverter: { w: 1.0, d: 0.6 },
  towerfan: { w: 0.5, d: 0.5 }, inverterac: null, glasstable: { w: 1.6, d: 0.9 }, marbledining: { w: 3.0, d: 1.6 }, ledstrips: null, pendant: null, rug: null,
  standingdesk: { w: 1.8, d: 0.9 }, gamingsetup: { w: 2.2, d: 1.3 }, homeoffice: { w: 1.5, d: 0.8 }, plant: { w: 0.7, d: 0.7 }, floorlamp: { w: 0.6, d: 0.6 },
  smartlamp: { w: 0.5, d: 0.5 }, barcart: { w: 1.0, d: 0.6 }, minibar: { w: 0.9, d: 0.7 }, canvas: null, neon: null, gallery: null, speaker: { w: 0.5, d: 0.5 },
  soundbar: { w: 1.6, d: 0.5 }, hifi: { w: 1.4, d: 0.6 },
};

// ----- NEPA -----
// Public power follows a fixed timetable so every player sees the same outage: half an hour dark every two
// hours. A fuelled generator keeps the lights on through it.

const OUTAGE_PERIOD = 2 * 3600_000;
const OUTAGE_LEN = 30 * 60_000;

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
