import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { db } from '@/lib/db';
import { getUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Serve a finished timelapse MP4 to its world's owner.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const job = await db.timelapseJob.findUnique({ where: { id: params.id }, include: { world: true } });
  if (!job || job.world.xUserId !== user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!job.filePath) return NextResponse.json({ error: 'Not rendered yet.' }, { status: 409 });
  let size: number;
  try {
    size = statSync(job.filePath).size;
  } catch {
    return NextResponse.json({ error: 'Render file is missing on disk.' }, { status: 410 });
  }
  const stream = Readable.toWeb(createReadStream(job.filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(size),
      'content-disposition': `attachment; filename="tweetlife-${job.world.handle}.mp4"`,
    },
  });
}
