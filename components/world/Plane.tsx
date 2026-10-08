'use client';
import { Airliner } from './CityExtras';
import { PrivateJet } from './Aircraft';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';

// The one plane component flights and the airport use. Facing +z with wheels on y = 0; the parent group
// places and turns it. Swap the models behind this without touching flight code.
export type PlaneKind = 'airliner' | 'jet';

/** `country` paints that country's livery; `tint` is a plain colour for when there is no country. */
export function Plane({ kind, country, tint, flying = false }: { kind: PlaneKind; country?: CountryId; tint?: string; flying?: boolean }) {
  tint = country ? COUNTRIES[country].theme.primary : tint;
  if (kind === 'jet') return <PrivateJet stripe={tint ?? '#3A6EA5'} gearDown={!flying} />;
  return <Airliner position={[0, 0, 0]} rotation={0} tail={tint ?? '#1D9BF0'} />;
}
