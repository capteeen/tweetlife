// The countries of Tweetlife. Each one is a whole city (same districts, venues, airport and roads)
// dressed in the colours of its coin. Every other feature (nationality, ID cards, governments,
// flights) keys off these ids, so add new countries here and nowhere else.

export const COUNTRY_IDS = ['solana', 'bnb', 'robinhood'] as const;
export type CountryId = (typeof COUNTRY_IDS)[number];

export type CountryTheme = {
  /** main brand colour, used for signage, flags and map tints */
  primary: string;
  /** second brand colour (Solana's gradient end, BNB's black, Robinhood's dark) */
  secondary: string;
  /** small highlights: neon, trim, text on primary */
  accent: string;
  /** the logo gradient, left to right, for UI chips, ID cards and billboards */
  gradient: [string, string];
  /** dark backdrop colour for UI panels in this country */
  ink: string;
};

export type Country = {
  id: CountryId;
  /** "Solana", "BNB", "Robinhood" */
  name: string;
  /** the country's one city, where the game takes place */
  capital: string;
  /** what citizens are called, for ID cards ("Solanan") */
  demonym: string;
  /** coin ticker, shown on the flag and passport */
  ticker: string;
  flag: string;
  president: string;
  /** X handle of the president, without @ */
  presidentHandle: string;
  /** one-line motto shown on the welcome sign and ID card */
  motto: string;
  theme: CountryTheme;
};

export const COUNTRIES: Record<CountryId, Country> = {
  solana: {
    id: 'solana',
    name: 'Solana',
    capital: 'Solana City',
    demonym: 'Solanan',
    ticker: 'SOL',
    flag: '◎',
    president: 'Ansem',
    presidentHandle: 'blknoiz06',
    motto: 'Fast blocks, faster bags',
    theme: { primary: '#9945FF', secondary: '#14F195', accent: '#00FFA3', gradient: ['#9945FF', '#14F195'], ink: '#120B24' },
  },
  bnb: {
    id: 'bnb',
    name: 'BNB',
    capital: 'BNB City',
    demonym: 'BNBian',
    ticker: 'BNB',
    flag: '◆',
    president: 'CZ',
    presidentHandle: 'cz_binance',
    motto: 'Build, build, build',
    theme: { primary: '#F3BA2F', secondary: '#1E2026', accent: '#FCD535', gradient: ['#F3BA2F', '#FCD535'], ink: '#0B0E11' },
  },
  robinhood: {
    id: 'robinhood',
    name: 'Robinhood',
    capital: 'Robinhood City',
    demonym: 'Robinhooder',
    ticker: 'HOOD',
    flag: '🪶',
    president: 'Vlad Tenev',
    presidentHandle: 'vladtenev',
    motto: 'Markets for the people',
    theme: { primary: '#00C805', secondary: '#0B1F0C', accent: '#CCFF00', gradient: ['#00C805', '#CCFF00'], ink: '#07130A' },
  },
};

/** Everyone who existed before countries is Solanan, and the city that was already built is Solana City. */
export const DEFAULT_COUNTRY: CountryId = 'solana';

export const COUNTRY_LIST: Country[] = COUNTRY_IDS.map((id) => COUNTRIES[id]);

export const isCountryId = (v: unknown): v is CountryId => typeof v === 'string' && (COUNTRY_IDS as readonly string[]).includes(v);

/** Look up a country, falling back to Solana for missing or unknown ids (old saves, bad input). */
export const countryOf = (id: string | null | undefined): Country => (isCountryId(id) ? COUNTRIES[id] : COUNTRIES[DEFAULT_COUNTRY]);
