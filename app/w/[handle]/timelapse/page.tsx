import { notFound } from 'next/navigation';
import { renderKeyFor } from '@/lib/timelapse';
import { loadWorldModel } from '@/lib/world/load';
import { TimelapseFrame } from './TimelapseFrame';

export const dynamic = 'force-dynamic';

// Headless render surface for the timelapse worker. Not linked from the UI; requires the render key.

export default async function TimelapsePage({ params, searchParams }: { params: { handle: string }; searchParams: { key?: string } }) {
  const model = await loadWorldModel(params.handle);
  if (!model || !searchParams.key || searchParams.key !== renderKeyFor(model.id)) notFound();
  return <TimelapseFrame model={model} />;
}
