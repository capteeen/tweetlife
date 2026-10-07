import { unstable_cache } from 'next/cache';
import { db } from '../db';
import { buildWorld, type StructureRow, type WorldGeometry } from './geometry';
import { readProgress } from '../x/ingest';

// Everything the renderer needs for one world, read from Postgres only.

export type WorldModel = {
  id: string;
  handle: string;
  ownerName: string;
  ownerAvatar: string | null;
  xUserId: string;
  biome: string;
  access: 'followers' | 'public' | 'invite';
  followersCount: number;
  postCount: number;
  structureCount: number;
  hiddenCount: number;
  lastSyncAt: string | null;
  ingestState: 'queued' | 'building' | 'live' | 'failed';
  ingestError: string | null;
  accountCreatedAt: string;
  showMetrics: boolean;
  chatEnabled: boolean;
  paths: { x: number; z: number }[][];
  geometry: WorldGeometry;
  marks: MarkModel[];
  building: { postsWritten: number; pagesFetched: number } | null;
};

export type MarkModel = { id: string; byHandle: string; text: string; x: number; z: number; at: string; bright: boolean };

export async function findWorldByHandle(handle: string) {
  return db.world.findFirst({
    where: { handle: { equals: handle.replace(/^@/, ''), mode: 'insensitive' } },
    include: { owner: { select: { name: true, avatarUrl: true, revokedAt: true } } },
  });
}

export async function loadWorldModel(handle: string): Promise<WorldModel | null> {
  const world = await findWorldByHandle(handle);
  if (!world) return null;
  const [rows, marks, hiddenCount, progress] = await Promise.all([
    db.structure.findMany({
      where: { worldId: world.id, hidden: false },
      orderBy: { postedAt: 'asc' },
      select: {
        id: true, postId: true, kind: true, conversationId: true, referencedId: true, text: true, mediaUrl: true, mediaKind: true,
        likes: true, reposts: true, replies: true, impressions: true, postedAt: true, hidden: true, lanternsLit: true,
      },
    }),
    db.mark.findMany({ where: { worldId: world.id }, orderBy: { at: 'desc' }, take: 500 }),
    db.structure.count({ where: { worldId: world.id, hidden: true } }),
    world.ingestState === 'building' ? readProgress(world.id) : Promise.resolve(null),
  ]);
  const structureRows: StructureRow[] = rows.map((r) => ({ ...r, postedAt: r.postedAt.toISOString() }));
  const geometry = buildWorld(structureRows, {
    handle: world.handle,
    accountCreatedAt: world.accountCreatedAt,
    followersCount: world.followersCount,
    landmarkPostId: world.landmarkPostId,
    showReplies: world.showReplies,
  });
  return {
    id: world.id,
    handle: world.handle,
    ownerName: world.owner.name,
    ownerAvatar: world.owner.avatarUrl,
    xUserId: world.xUserId,
    biome: world.biome,
    access: world.access,
    followersCount: world.followersCount,
    postCount: world.postCount,
    structureCount: rows.length,
    hiddenCount,
    lastSyncAt: world.lastSyncAt?.toISOString() ?? null,
    ingestState: world.ingestState,
    ingestError: world.ingestError,
    accountCreatedAt: world.accountCreatedAt.toISOString(),
    showMetrics: world.showMetrics,
    chatEnabled: world.chatEnabled,
    paths: (world.paths as { x: number; z: number }[][]) ?? [],
    geometry,
    marks: marks.map((m) => ({ id: m.id, byHandle: m.byHandle, text: m.text, x: m.x, z: m.z, at: m.at.toISOString(), bright: m.bright })),
    building: progress ? { postsWritten: progress.postsWritten, pagesFetched: progress.pagesFetched } : null,
  };
}

/** A short-lived cached read for hot paths (OG images, landing). Building worlds are never cached. */
export const loadWorldModelCached = (handle: string) =>
  unstable_cache(async () => loadWorldModel(handle), ['world-model', handle.toLowerCase()], { revalidate: 30 })();

/** The boundary (outside) view needs only the skyline: positions and sizes, no text. */
export function skylineOf(model: WorldModel) {
  return {
    handle: model.handle,
    ownerName: model.ownerName,
    ownerAvatar: model.ownerAvatar,
    followersCount: model.followersCount,
    structureCount: model.structureCount,
    biome: model.biome,
    accountCreatedAt: model.accountCreatedAt,
    geometry: {
      ...model.geometry,
      structures: model.geometry.structures.map((s) => ({
        ...s,
        text: s.isLandmark ? s.text : '',
        mediaUrl: null,
        likes: null, reposts: null, replies: null, impressions: null,
      })),
    },
    marks: [],
    paths: [],
  };
}
