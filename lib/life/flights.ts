import type { Stats } from './stats';
import { COUNTRY_IDS, DEFAULT_COUNTRY, isCountryId, type CountryId } from '@/lib/world/countries';

// Flying between countries. Every country's city has the same airport island; the departures board there
// lists the other countries. A commercial seat has a fixed fare in bags (the server never trusts anything
// else), and owning the Private jet from the Market makes every flight free.

export type CabinId = 'economy' | 'first' | 'jet';

export type Cabin = {
  id: CabinId;
  name: string;
  emoji: string;
  bags: number;
  me: Partial<Stats>;
  blurb: string;
};

export const CABINS: Cabin[] = [
  { id: 'economy', name: 'Economy', emoji: '💺', bags: 800, me: { gas: -8, vibes: +3 }, blurb: 'Middle seat, pretzels, you get there.' },
  { id: 'first', name: 'First class', emoji: '🥂', bags: 3000, me: { vibes: +8, clout: +4 }, blurb: 'Lie-flat seat, champagne, priority boarding.' },
  { id: 'jet', name: 'Your private jet', emoji: '🛩️', bags: 0, me: { vibes: +6, clout: +8 }, blurb: 'Your own plane. No fare, no queue, no middle seat.' },
];

export const cabinById = (id: string) => CABINS.find((c) => c.id === id) ?? null;

/** The Market item that is a private jet (lib/life/market.ts). Owning it makes flights free. */
export const JET_ITEM = 'jet';

/** Seconds of each part of a flight, client side. The server only settles the fare and the new location. */
export const FLIGHT = { boarding: 3.5, takeoff: 13, cruise: 5.5, landing: 12, welcome: 4.5 };

/**
 * Where a player is right now: where they last flew to, else their home country, else Solana.
 * `nationality` is read defensively: the nationality feature owns that column.
 */
export function whereIs(p: object): CountryId {
  const loc = (p as { location?: unknown }).location;
  return isCountryId(loc) ? loc : homeOf(p);
}

export function homeOf(p: object): CountryId {
  const nat = (p as { nationality?: unknown }).nationality;
  return isCountryId(nat) ? nat : DEFAULT_COUNTRY;
}

/** A stable, made-up flight number for a route, like "TL 214". */
export function flightNumber(from: CountryId, to: CountryId) {
  const a = COUNTRY_IDS.indexOf(from), b = COUNTRY_IDS.indexOf(to);
  return `TL ${200 + a * 30 + b * 7}`;
}
