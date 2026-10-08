import { COUNTRIES, DEFAULT_COUNTRY, countryOf, isCountryId, type CountryId } from '../world/countries';
import { publicPower } from './home';

// Each country's government: a government house in its city where the president and two ministers live
// (residents in lib/life/residents.ts), a daily presidential address, and the national rules every player in
// that country lives under. Kept small on purpose: a tax on coin sales, a daily stipend for citizens, one
// national perk, and a curfew that shuts the house while NEPA has taken light.

export type NationalRules = {
  /** share of every Coin Shop sale kept by the state, 0..1 */
  tradeTax: number;
  /** bags a citizen can collect at the government house once a day */
  stipend: number;
  /** extra pay on Hustle Hub shifts, 0..1 (0.2 = +20%) */
  shiftBonus: number;
  /** bail at this country's police station, as a multiple of the usual (lib/life/crimeRules.ts bailFor) */
  bail: number;
  /** the national perk in plain words, for the venue sheet */
  perk: string;
};

export type Government = {
  country: CountryId;
  /** "Solana State House" */
  house: string;
  /** under the name on the venue sheet */
  blurb: string;
  rules: NationalRules;
  /** the president's daily address, one per day in turn */
  addresses: string[];
};

export const GOVERNMENTS: Record<CountryId, Government> = {
  solana: {
    country: 'solana',
    house: 'Solana State House',
    blurb: 'Where Ansem runs the country between charts.',
    rules: { tradeTax: 0.01, stipend: 300, shiftBonus: 0, bail: 1, perk: 'Lowest fees in the land: 1% on coin sales' },
    addresses: [
      'Fellow Solanans: the network is fast, the bags are faster. Today is a good day to touch grass, then touch the Trenches.',
      'I have one message for the nation: conviction. Paper hands will be studied by historians.',
      'Effective today, every citizen is entitled to one (1) fresh cut at Fresh Cuts. You still have to pay for it.',
      'NEPA has been summoned to the State House. They did not come. The light situation is under review.',
      'Solana City does not sleep. Club Moon stays open, the Coin Shop stays open, and so does my DM.',
      'To the citizens who got rugged this week: the nation sees you. Next one sends.',
      'We are a country of builders, traders and people who refresh the chart every four seconds. I salute all three.',
    ],
  },
  bnb: {
    country: 'bnb',
    house: 'BNB Build House',
    blurb: 'CZ\'s office. The sign on the door says "4".',
    rules: { tradeTax: 0.02, stipend: 500, shiftBonus: 0.2, bail: 1.25, perk: 'Builders get paid: Hustle Hub shifts pay 20% more' },
    addresses: [
      'Build, build, build. Today\'s national holiday is cancelled so we can keep building.',
      'To every BNBian who posted FUD this morning: 4. That is the whole address.',
      'Funds are SAFU. Your gas is not. Eat suya and get back to work.',
      'The Hustle Hub now pays 20% more for every shift. A nation of builders deserves real bags.',
      'Ignore the noise, focus on the product. Also, please stop asking me about the price.',
      'BNB City welcomes every visitor. Fly in, open a shop, build something. Then build another thing.',
      'Long-term thinking wins. Today\'s plan: the same as yesterday\'s plan. Build.',
    ],
  },
  robinhood: {
    country: 'robinhood',
    house: 'Robinhood Capitol',
    blurb: 'Vlad\'s Capitol. Commission-free since day one.',
    rules: { tradeTax: 0, stipend: 200, shiftBonus: 0, bail: 0.75, perk: 'Markets for the people: 0% tax on coin sales' },
    addresses: [
      'Citizens of Robinhood: markets are for everyone. Today, trading in the Coin Shop remains commission-free.',
      'We believe every citizen should own a piece of the action. Even if the action is a frog coin.',
      'The Capitol is open, the confetti is optional, and the coin tax is still zero.',
      'A reminder from your president: diversify. Two memecoins is technically a portfolio.',
      'Robinhood City was built to democratise finance. Club Moon was built to democratise dancing.',
      'Today we celebrate the retail trader. You are the market. Please stop panic selling the market.',
      'NEPA took light at the Capitol again. Our servers run on a generator and pure conviction.',
    ],
  },
};

export const governmentOf = (id: CountryId) => GOVERNMENTS[id];

const DAY = 86400_000;

/** Today's presidential address for a country; it changes at midnight UTC and is the same for everyone. */
export function todaysAddress(id: CountryId, now = Date.now()) {
  const g = GOVERNMENTS[id];
  const day = Math.floor(now / DAY);
  // countries start their week on different days so they don't all repeat together
  const k = (day + COUNTRY_SHIFT[id]) % g.addresses.length;
  return { text: g.addresses[k], president: COUNTRIES[id].president, day };
}
const COUNTRY_SHIFT: Record<CountryId, number> = { solana: 0, bnb: 2, robinhood: 5 };

/** Curfew: the government house closes while NEPA has taken light (lib/life/home.ts timetable). */
export function curfew(now = Date.now()) {
  const p = publicPower(now);
  return { on: !p.on, endsAt: p.on ? null : p.changesAt };
}

/** A tax line for the receipt: what the state keeps from a sale of `bags`. */
export function tradeTaxOn(id: CountryId, bags: number) {
  return Math.floor(bags * GOVERNMENTS[id].rules.tradeTax);
}

/** Read a country id sent by the client (the city you are standing in), falling back to the default. */
export const countryParam = (v: unknown): CountryId => (isCountryId(v) ? v : DEFAULT_COUNTRY);

/** Which country a player is a citizen of: a Player row (server) or the client's `me` (its `citizen`). Unpicked = Solana. */
export function citizenOf(p: { nationality?: string | null; citizen?: { country: string } | null }): CountryId {
  return countryOf(p.citizen?.country ?? p.nationality).id;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
