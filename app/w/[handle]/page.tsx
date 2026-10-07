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
  const description = `${count} posts as structures, built from @${world.handle}'s real timeline. Followers can walk in.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `/w/${world.handle}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function WorldPage({ params, searchParams }: { params: { handle: string }; searchParams: { embed?: string } }) {
  return <WorldClient handle={params.handle} embed={searchParams.embed === '1'} />;
}
