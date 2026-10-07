// The Market catalogue. Game content, priced in bags (in-world points). Vehicles change how you move.

export type VehicleKind = 'car' | 'boat' | 'plane';

export type Item = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  kind: VehicleKind;
  /** walking speed multiplier */
  speed: number;
  blurb: string;
  color: string;
};

export const ITEMS: Item[] = [
  { id: 'keke', name: 'Keke', emoji: '🛺', price: 1500, kind: 'car', speed: 1.6, blurb: 'Three wheels, no shame. Gets you across the city.', color: '#FFD166' },
  { id: 'sedan', name: 'Sedan', emoji: '🚗', price: 5000, kind: 'car', speed: 2.2, blurb: 'Reliable. Mid. Respectable.', color: '#8A96A8' },
  { id: 'lambo', name: 'Lambo', emoji: '🏎️', price: 25000, kind: 'car', speed: 3.2, blurb: 'For when the bag hit. Everyone will know.', color: '#E63946' },
  { id: 'speedboat', name: 'Speedboat', emoji: '🚤', price: 12000, kind: 'boat', speed: 2.6, blurb: 'Leave the shore. The water past the boundary is yours.', color: '#F4F1DE' },
  { id: 'yacht', name: 'Yacht', emoji: '🛥️', price: 60000, kind: 'boat', speed: 2.0, blurb: 'Slow, enormous, undeniable.', color: '#FFFFFF' },
  { id: 'jet', name: 'Private jet', emoji: '🛩️', price: 150000, kind: 'plane', speed: 5.0, blurb: 'Fly over everything. Nothing can block you up here.', color: '#BFE3FF' },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id) ?? null;
