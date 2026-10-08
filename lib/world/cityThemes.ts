import { COUNTRIES, DEFAULT_COUNTRY, isCountryId, type CountryId } from './countries';
import { FACADE } from './buildings';

// How each country's capital looks. Every country is the same city plan (lib/world/layout.ts: districts,
// ring road, venues, airport), dressed in its coin's colours: ground, water and sky tints, building
// awnings, roofs, signs and glass, district and venue names, billboard art, ring-road traffic, a
// landmark on its own islet in the lagoon, and a welcome arch on the airport road.
// Every logo is the coin's real mark (public/countries/). Solana City is the city that existed before countries, so its theme changes the least.

/** `logo`: draw the country's real coin logo on the board */
export type Ad = { title: string; sub: string; from: string; to: string; logo?: boolean };

export type CityTheme = {
  country: CountryId;
  /** ground tint over the biome palette, and how strongly (0..1) */
  ground: { color: string; amount: number };
  water: { color: string; amount: number };
  /** sky dome and fog tint */
  sky: { horizon: string; zenith: string; amount: number };
  /** hemisphere light sky colour */
  light: string;
  /** countryside tree multiplier (Robinhood is Sherwood: a forest) */
  trees: number;
  canopy?: string[];
  /** replacement colours for building parts, by facade set (lib/world/buildings.ts FACADE) */
  facade: Partial<Record<keyof typeof FACADE, readonly string[]>>;
  /** district id -> name */
  districts: Record<string, string>;
  /** venue id -> name (and emoji) in this country */
  venues: Record<string, { name: string; emoji?: string }>;
  /** billboards after the owner's own */
  ads: Ad[];
  /** ring-road car colours */
  traffic: string[];
  /** the coin's logo, extruded into a monument on the lagoon islet */
  landmark: { name: string };
  /** ground lettering colour for district names */
  label: string;
};

const SOLANA: CityTheme = {
  country: 'solana',
  ground: { color: '#7A5CC4', amount: 0.06 },
  water: { color: '#4E6BD8', amount: 0.18 },
  sky: { horizon: '#E2C6FF', zenith: '#8A5CF0', amount: 0.16 },
  light: '#E6E0FF',
  trees: 1,
  facade: {
    AWNING: ['#9945FF', '#14F195', '#00C2FF', '#DC1FFF', '#7B3FE4', '#19FB9B'],
    SIGN: ['#120B24', '#9945FF', '#14F195', '#F5F0E6', '#DC1FFF', '#00C2FF'],
  },
  districts: {},
  venues: { airport: { name: 'Solana International' } },
  ads: [
    { title: 'SOLANA CITY', sub: 'Fast blocks. Faster bags.', from: '#9945FF', to: '#14F195', logo: true },
    { title: 'CLUB MOON', sub: 'Dance tonight. Everyone sees.', from: '#FF5D8F', to: '#5B1A6B' },
    { title: 'THE TRENCHES', sub: 'Live memecoins. Ape with bags.', from: '#06D6A0', to: '#0B4D3B' },
    { title: 'PRESIDENT ANSEM', sub: 'Send it. Responsibly.', from: '#DC1FFF', to: '#2A0E5C', logo: true },
    { title: 'FLY PRIVATE', sub: 'Jets at the Airport hangar', from: '#BFE3FF', to: '#3A6EA5' },
    { title: 'SUYA SPOT', sub: 'Pepper. Smoke. Gas.', from: '#E63946', to: '#5C1A1F' },
  ],
  traffic: ['#9945FF', '#F4F1DE', '#F7C600', '#14F195', '#1F4E79'],
  landmark: { name: 'The Three Bars' },
  label: '#FFFFFF',
};

const BNB: CityTheme = {
  country: 'bnb',
  ground: { color: '#C9A13A', amount: 0.22 },
  water: { color: '#2E4756', amount: 0.35 },
  sky: { horizon: '#FFD27A', zenith: '#C99A2E', amount: 0.42 },
  light: '#FFE9B8',
  trees: 0.6,
  canopy: ['#6E8B3D', '#8C9A4C', '#A3A14E', '#C9A13A'],
  facade: {
    ROOF: ['#2B2F36', '#1E2026', '#3A3F47', '#F3BA2F', '#C99A1E', '#474D57'],
    AWNING: ['#F3BA2F', '#1E2026', '#FCD535', '#2B2F36', '#E0A100', '#F0B90B'],
    SIGN: ['#0B0E11', '#F3BA2F', '#FCD535', '#F5F0E6', '#1E2026', '#F0B90B'],
    PAINT: ['#F3BA2F', '#2B2F36', '#E8D6A0', '#C99A1E', '#474D57', '#F5E6B8', '#1E2026', '#FCD535'],
    GLASS: ['#3A3524', '#2E2C25', '#4A4230', '#38342A', '#423C2B', '#2F2E28', '#3B372C'],
    DARK_GLASS: ['#1E2026', '#23252B', '#2B2F36', '#1A1C21', '#2A2A26'],
    FRAME: ['#F3BA2F', '#C8CED6', '#1E2026', '#8C949E', '#FCD535'],
  },
  districts: { waterfront: 'Binance Bay', wellness: 'SAFU Row', strip: 'The Gold Strip', trenches: 'Pancake Quarter' },
  venues: {
    club: { name: 'Club Yellow' },
    yard: { name: 'Gold Yard' },
    warehouse: { name: 'Warehouse 4' },
    jazz: { name: 'Golden Hour Jazz' },
    beach: { name: 'Binance Bay Beach Club' },
    bar: { name: 'SAFU Lounge' },
    suya: { name: 'Pancake House', emoji: '🥞' },
    gym: { name: 'Build Build Gym' },
    barber: { name: 'Diamond Cuts' },
    clinic: { name: 'SAFU Clinic' },
    hustle: { name: 'Builder Hub' },
    tech: { name: 'BUIDL Labs' },
    bank: { name: 'Gold Vault' },
    exchange: { name: 'Pancake Coin Shop' },
    dealership: { name: 'Gold Motors' },
    marina: { name: 'Binance Bay Marina' },
    airport: { name: 'BNB International' },
  },
  ads: [
    { title: 'BUILD BUILD BUILD', sub: 'President CZ is watching.', from: '#F3BA2F', to: '#1E2026', logo: true },
    { title: 'FUNDS ARE SAFU', sub: 'Gold Vault, Pancake Quarter', from: '#FCD535', to: '#3A2E05', logo: true },
    { title: 'CLUB YELLOW', sub: 'Gold lights. Black floor. Dance.', from: '#F0B90B', to: '#0B0E11' },
    { title: 'PANCAKE HOUSE', sub: 'Stacks on stacks. Gas refill.', from: '#E8A33D', to: '#4A2A0A' },
    { title: 'FLY PRIVATE', sub: 'BNB International hangar', from: '#FCD535', to: '#2B2F36' },
    { title: '4', sub: 'Ignore the FUD. Keep building.', from: '#1E2026', to: '#F3BA2F' },
  ],
  traffic: ['#F3BA2F', '#1E2026', '#FCD535', '#2B2F36', '#F5E6B8'],
  landmark: { name: 'The Gold Diamond' },
  label: '#FCD535',
};

const ROBINHOOD: CityTheme = {
  country: 'robinhood',
  ground: { color: '#2E9E3A', amount: 0.24 },
  water: { color: '#1F7A66', amount: 0.32 },
  sky: { horizon: '#D6FFB8', zenith: '#3E9E68', amount: 0.3 },
  light: '#E6FFE0',
  trees: 2.6,
  canopy: ['#1F6B2A', '#2E8B3A', '#00A805', '#3E8E41', '#2F7A3A'],
  facade: {
    ROOF: ['#1F6B2A', '#174D20', '#2D3B2F', '#0F3D1C', '#3E6B2F', '#2A4A2E'],
    AWNING: ['#00C805', '#CCFF00', '#0B1F0C', '#21CE99', '#00A805', '#E8FFD0'],
    SIGN: ['#0B1F0C', '#00C805', '#CCFF00', '#F5F0E6', '#21CE99', '#003D10'],
    PAINT: ['#21CE99', '#E8F5E0', '#00C805', '#6FAF5A', '#9BD770', '#2D6A4F', '#B7E4C7', '#F4F1DE'],
    GLASS: ['#3E6B5A', '#4A7F66', '#3A6B60', '#2F5F4F', '#5A8C74', '#40705C', '#4E7F70'],
    FRAME: ['#E9ECEF', '#CCFF00', '#0B1F0C', '#8C949E', '#00C805'],
  },
  districts: { waterfront: 'Sherwood Waterfront', wellness: 'Feather Row', strip: 'Market Street', trenches: 'The Options Pit' },
  venues: {
    club: { name: 'Club Sherwood' },
    yard: { name: 'Greenwood Yard' },
    warehouse: { name: 'The Vault' },
    jazz: { name: 'Sherwood Jazz Den', emoji: '🎺' },
    beach: { name: 'Sherwood Shore Club' },
    bar: { name: 'Merry Men Tavern', emoji: '🍺' },
    suya: { name: "Archer's Grill", emoji: '🍖' },
    gym: { name: 'Green Candle Gym' },
    barber: { name: 'Feather Cuts' },
    clinic: { name: 'Free Clinic' },
    hustle: { name: 'Market Hours Hub' },
    tech: { name: 'Sherwood Labs' },
    bank: { name: 'Hood Bank' },
    exchange: { name: 'Options Pit Coin Shop' },
    dealership: { name: 'Sherwood Motors' },
    marina: { name: 'Sherwood Marina' },
    airport: { name: 'Robinhood International' },
  },
  ads: [
    { title: 'MARKETS FOR THE PEOPLE', sub: 'President Vlad Tenev', from: '#00C805', to: '#0B1F0C', logo: true },
    { title: 'ZERO COMMISSION', sub: 'Options Pit Coin Shop. Ape for free.', from: '#CCFF00', to: '#1F3D00', logo: true },
    { title: 'CLUB SHERWOOD', sub: 'Green lights. Merry dancing.', from: '#21CE99', to: '#0B2A1F' },
    { title: 'TAKE FROM THE RICH', sub: 'Give to your bags.', from: '#00C805', to: '#CCFF00', logo: true },
    { title: 'FLY PRIVATE', sub: 'Robinhood International hangar', from: '#E8FFD0', to: '#1F6B2A' },
    { title: "ARCHER'S GRILL", sub: 'Fire. Smoke. Gas.', from: '#E67E22', to: '#3A1A05' },
  ],
  traffic: ['#00C805', '#0B1F0C', '#F4F1DE', '#CCFF00', '#21CE99'],
  landmark: { name: 'The Green Feather' },
  label: '#CCFF00',
};

export const CITY_THEMES: Record<CountryId, CityTheme> = { solana: SOLANA, bnb: BNB, robinhood: ROBINHOOD };

export const themeOf = (id: string | null | undefined): CityTheme => CITY_THEMES[isCountryId(id) ? id : DEFAULT_COUNTRY];

/** District name in a country (falls back to the district's own name). */
export const districtName = (districtId: string, fallback: string, country: string | null | undefined) =>
  themeOf(country).districts[districtId] ?? fallback;

/** Map from original facade hex to the country's replacement, for the building renderer. */
const recolorCache = new Map<CountryId, Map<string, string>>();
export function facadeRecolor(country: string | null | undefined): Map<string, string> {
  const t = themeOf(country);
  let m = recolorCache.get(t.country);
  if (m) return m;
  m = new Map();
  for (const key of Object.keys(t.facade) as (keyof typeof FACADE)[]) {
    const from = FACADE[key], to = t.facade[key]!;
    from.forEach((hex, i) => m!.set(hex, to[i % to.length]));
  }
  recolorCache.set(t.country, m);
  return m;
}

/** "Welcome to BNB City" on the arch, and the capital for HUD chips. */
export const welcomeLine = (country: string | null | undefined) => {
  const c = COUNTRIES[themeOf(country).country];
  return { title: `WELCOME TO ${c.capital.toUpperCase()}`, sub: c.motto };
};

export const mixHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase();
};

/** A biome palette tinted towards a country: ground, water and fog. Same shape in, same shape out. */
export function themedPalette<P extends { lush: string; dry: string; sand: string; water: string; fog: string; grass: string }>(pal: P, country: string | null | undefined): P {
  const t = themeOf(country);
  const g = (hex: string) => mixHex(hex, t.ground.color, t.ground.amount);
  return {
    ...pal,
    lush: g(pal.lush),
    dry: g(pal.dry),
    grass: g(pal.grass),
    sand: mixHex(pal.sand, t.ground.color, t.ground.amount),
    water: mixHex(pal.water, t.water.color, t.water.amount),
    fog: mixHex(pal.fog, t.sky.horizon, t.sky.amount),
  };
}

/** Where the country's landmark islet sits: in the lagoon due west, opposite the airport. */
export const landmarkSpot = (boundaryRadius: number) => ({ x: -(boundaryRadius + 16), z: 0, r: 12 });
