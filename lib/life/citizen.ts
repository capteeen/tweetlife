import { countryOf, type Country } from '../world/countries';

// National ID numbers. Derived from the player id so they never change and need no column:
// "SOL-4821-0937". The prefix is the country's ticker, so a passport check reads at a glance.

export function citizenNumber(playerId: string, country: Country): string {
  let h = 2166136261;
  for (let i = 0; i < playerId.length; i++) h = Math.imul(h ^ playerId.charCodeAt(i), 16777619);
  const n = String((h >>> 0) % 100_000_000).padStart(8, '0');
  return `${country.ticker}-${n.slice(0, 4)}-${n.slice(4)}`;
}

/** What the phone, ID card and flights need about a player's citizenship. */
export function citizenship(p: { id: string; nationality: string | null; createdAt: Date }) {
  const country = countryOf(p.nationality);
  return {
    /** null until the player has picked (or skipped); read `country` for the effective home */
    nationality: p.nationality ? country.id : null,
    /** home country id: where they spawn and fly home to */
    country: country.id,
    citizenNo: citizenNumber(p.id, country),
    since: p.createdAt.toISOString(),
  };
}
export type Citizenship = ReturnType<typeof citizenship>;
