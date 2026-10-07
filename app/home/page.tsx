import type { Metadata } from 'next';
import { HomeClient } from '@/components/home/HomeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your house', robots: { index: false } };

export default function MyHomePage() {
  return <HomeClient />;
}
