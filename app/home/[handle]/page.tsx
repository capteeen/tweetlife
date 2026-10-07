import type { Metadata } from 'next';
import { HomeClient } from '@/components/home/HomeClient';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  return { title: `@${params.handle}'s house`, robots: { index: false } };
}

export default function HousePage({ params }: { params: { handle: string } }) {
  return <HomeClient handle={params.handle} />;
}
