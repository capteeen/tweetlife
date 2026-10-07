import type { Metadata } from 'next';
import { WorldClient } from '@/components/world/WorldClient';
import { findWorldByHandle } from '@/lib/world/load';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Deep link: spawn the visitor at this post's structure. This is the URL that gets posted to X.

export async function generateMetadata({ params }: { params: { handle: string; id: string } }): Promise<Metadata> {
  const world = await findWorldByHandle(params.handle);
  if (!world) return { title: 'No world', robots: { index: false } };
  const s = await db.structure.findFirst({ where: { worldId: world.id, postId: params.id, hidden: false } });
  const title = `@${world.handle}'s world`;
  const description = s ? `“${s.text.slice(0, 140)}” — stand at this post inside @${world.handle}'s world.` : `Inside @${world.handle}'s world.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `/w/${world.handle}/post/${params.id}`, images: [`/w/${world.handle}/opengraph-image`] },
    twitter: { card: 'summary_large_image', title, description, images: [`/w/${world.handle}/opengraph-image`] },
  };
}

export default function PostDeepLink({ params, searchParams }: { params: { handle: string; id: string }; searchParams: { embed?: string } }) {
  return <WorldClient handle={params.handle} spawnPostId={params.id} embed={searchParams.embed === '1'} />;
}
