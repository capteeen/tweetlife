import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorldClient } from '@/components/world/WorldClient';
import { COUNTRIES, isCountryId } from '@/lib/world/countries';

export const dynamic = 'force-dynamic';

// /c/<country>: a country's shared city, arriving at Capital Square. Everyone in the country is here together;
// every player's posts city is their own block (lib/world/country-map.ts).
export function generateMetadata({ params }: { params: { country: string } }): Metadata {
  if (!isCountryId(params.country)) return { title: 'No such country', robots: { index: false } };
  const c = COUNTRIES[params.country];
  const title = `${c.capital}, ${c.name}`;
  const description = `${c.motto}. One city for every ${c.demonym} on TweetLife: walk the streets and visit everyone's block.`;
  return { title, description, openGraph: { title, description, type: 'website', url: `/c/${c.id}` }, twitter: { card: 'summary', title, description } };
}

export default function CountryPage({ params }: { params: { country: string } }) {
  if (!isCountryId(params.country)) notFound();
  return <WorldClient handle="" country={params.country} />;
}
