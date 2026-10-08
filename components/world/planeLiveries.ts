import { COUNTRIES, COUNTRY_IDS, isCountryId, type CountryId } from '@/lib/world/countries';

// Plane paint schemes. Each country flies its coin's colours with the coin's logo on the fin (the same marks as
// public/countries/*.svg); everything else gets the Tweetlife house colours, or a single tint.

export type LogoMark = {
  /** SVG path data in a 24 x 24 box, y down */
  d: string;
  /** a flat fill, or a two-stop gradient running bottom-left to top-right */
  fill: string | [string, string];
};

export type Livery = {
  key: string;
  top: string;
  belly: string;
  /** the stripe along the windows; a pair fades nose to tail */
  cheat: string | [string, string];
  fin: string;
  engine: string;
  wing: string;
  winglet: string;
  logo?: LogoMark;
};

export const LOGOS: Record<CountryId, LogoMark> = {
  solana: {
    d: 'm23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z',
    fill: ['#9945FF', '#14F195'],
  },
  bnb: {
    d: 'M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z',
    fill: '#F3BA2F',
  },
  robinhood: {
    d: 'M2.84 24h.53c.096 0 .192-.048.224-.128C7.591 13.696 11.94 8.656 14.67 5.638c.112-.128.064-.225-.096-.225h-4.88a.55.55 0 0 0-.45.225L5.746 9.972c-.514.642-.642 1.236-.642 2.086v4.43c-1.14 3.194-1.862 5.361-2.392 7.32-.032.125.016.192.129.192M20.447.646c-.754-.802-4.157-.834-5.73-.224a3 3 0 0 0-.786.465 41 41 0 0 0-3.323 3.178c-.112.113-.064.225.097.225h5.409c.497 0 .786.289.786.786v6.1c0 .16.128.208.225.064l3.258-4.254c.53-.69.69-.898.835-1.861.192-1.413.08-3.58-.77-4.479m-6.982 16.18 2.231-3.676a.7.7 0 0 0 .064-.29V6.73c0-.16-.112-.225-.224-.097-3.355 3.74-5.971 7.672-8.395 12.407-.06.12.016.225.16.177l5.009-1.54c.565-.174.882-.402 1.155-.852',
    fill: '#CCFF00',
  },
};

const WHITE = '#F3F5F8';
const WING = '#D3D8DF';

const COUNTRY_LIVERIES: Record<CountryId, Livery> = {
  solana: { key: 'solana', top: WHITE, belly: '#120B24', cheat: ['#14F195', '#9945FF'], fin: '#120B24', engine: '#9945FF', wing: WING, winglet: '#14F195', logo: LOGOS.solana },
  bnb: { key: 'bnb', top: WHITE, belly: '#1E2026', cheat: '#F3BA2F', fin: '#1E2026', engine: '#F3BA2F', wing: WING, winglet: '#F3BA2F', logo: LOGOS.bnb },
  robinhood: { key: 'robinhood', top: WHITE, belly: '#0B1F0C', cheat: '#00C805', fin: '#0B1F0C', engine: '#00C805', wing: WING, winglet: '#CCFF00', logo: LOGOS.robinhood },
};

export const HOUSE: Livery = { key: 'house', top: WHITE, belly: '#C5CCD6', cheat: '#1D9BF0', fin: '#1D9BF0', engine: '#E9EDF2', wing: WING, winglet: '#1D9BF0' };

/** A plain scheme in one colour: white body, tinted fin, stripe and winglets. */
export function tintLivery(tint: string): Livery {
  return { key: `tint:${tint.toLowerCase()}`, top: WHITE, belly: '#C5CCD6', cheat: tint, fin: tint, engine: '#E9EDF2', wing: WING, winglet: tint };
}

/** Pick a livery: a country by id, a country whose primary colour is `tint`, a plain tint, or the house colours. */
export function liveryFor(country?: string | null, tint?: string | null): Livery {
  if (country && isCountryId(country)) return COUNTRY_LIVERIES[country];
  if (tint) {
    const match = COUNTRY_IDS.find((id) => COUNTRIES[id].theme.primary.toLowerCase() === tint.toLowerCase());
    return match ? COUNTRY_LIVERIES[match] : tintLivery(tint);
  }
  return HOUSE;
}
