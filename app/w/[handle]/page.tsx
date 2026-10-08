import type { Metadata } from 'next';
import { WorldClient } from '@/components/world/WorldClient';
import { findWorldByHandle } from '@/lib/world/load';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const world = await findWorldByHandle(params.handle);
  if (!world) return { title: 'No world', robots: { index: false } };
  const count = await db.structure.count({ where: { worldId: world.id, hidden: false } });
  const title = `@${world.handle}'s world`;
  const description = `${count} posts as structures, built from @${world.handle}'s real timeline. Visit their block in TweetLife.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `/w/${world.handle}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// The player's block, in their country's shared city (or, as an embed or the title backdrop, their world on its own).
export default function WorldPage({ params, searchParams }: { params: { handle: string }; searchParams: { embed?: string; backdrop?: string; country?: string } }) {
  return <WorldClient handle={params.handle} embed={searchParams.embed === '1'} backdrop={searchParams.backdrop === '1'} country={searchParams.country} />;
}
