'use client';
import { DEFAULT_COUNTRY, type CountryId } from '@/lib/world/countries';

// The country whose city this world is showing. Every country-aware piece (the government house, its
// residents, national rules sent with venue actions and coin sales) reads it from here, so it can follow the
// cities' own "current country" in one place once that lands. Until then every city is Solana City.

export function currentCountryId(): CountryId {
  return DEFAULT_COUNTRY;
}

/** Hook form, for components. */
export function useCountry(): CountryId {
  return currentCountryId();
}
