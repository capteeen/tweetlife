'use client';
import type { CountryId } from '@/lib/world/countries';
import { useWorld } from './store';

// The country whose capital this world is showing (the store's `country`, set from a ?country link, your
// nationality or a flight). Every country-aware piece of the government (the house, its residents, national
// rules sent with venue actions and coin sales) reads it through here.

export function currentCountryId(): CountryId {
  return useWorld.getState().country;
}

/** Hook form, for components. */
export function useCountry(): CountryId {
  return useWorld((s) => s.country);
}
