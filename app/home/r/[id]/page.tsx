import type { Metadata } from 'next';
import { HomeClient } from '@/components/home/HomeClient';
import { residentById } from '@/lib/life/residents';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return { title: `${residentById(params.id)?.name ?? 'A resident'}'s place`, robots: { index: false } };
}

// An AI resident's place: furnished from the catalogue, open to people they said yes to.
export default function ResidentHousePage({ params }: { params: { id: string } }) {
  return <HomeClient residentId={params.id} />;
}
