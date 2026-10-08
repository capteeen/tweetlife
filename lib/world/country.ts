import { revalidateTag, unstable_cache } from 'next/cache';
import { Prisma, type World } from '@prisma/client';
import { db } from '../db';
import { BLOCK_D, BLOCK_W, PITCH_X, PITCH_Z, ROAD, SIDEWALK, LOTS_PER_BLOCK, buildWorld, type Block, type CityGrid, type TerrainClass, type Placed, type StructureRow, type WorldGeometry } from './geometry';
import { CAPITAL_SLOT, PLOT_BLOCKS, PLOT_LOTS, plotBlocks, plotCell, plotRect, type PlotRect } from './country-map';
import { countryOf, type CountryId } from './countries';
import type { MarkModel } from './load';

// Server side of the shared country maps (see lib/world/country-map.ts for the layout).
// A country map is one WorldGeometry: every player's plot (their standout posts, laid out in their own
// 3 x 3 city blocks) plus Capital Square and the free plots, so the capital's roads, traffic, residents,
// venues, airport and map work on it unchanged. Post text is not in it: blocks hand it out one at a time,
// with the same follow rules as before (GET /api/world/<handle>/block).

export type PlotModel = {
  slot: number;
  handle: string;
  worldId: string;
  xUserId: string;
  ownerName: string;
  ownerAvatar: string | null;
  access: 'followers' | 'public' | 'invite';
  followersCount: number;
  /** posts on the X account (may exceed what was fetched) */
  postCount: number;
  /** posts standing in the block */
  shown: number;
  showMetrics: boolean;
  chatEnabled: boolean;
  accountCreatedAt: string;
  lastSyncAt: string | null;
  ingestState: 'queued' | 'building' | 'live' | 'failed';
  rect: PlotRect;
};

/** A guestbook stone, placed in the country frame, and whose block it is in. */
export type CountryMark = MarkModel & { owner: string };

export type CountryModel = {
  country: CountryId;
  geometry: WorldGeometry;
  plots: PlotModel[];
  marks: CountryMark[];
};

/** A player's home country: their nationality, Solana until they pick one. */
export async function homeCountryOf(userId: string): Promise<CountryId> {
  const p = await db.player.findUnique({ where: { id: userId }, select: { nationality: true } });
  return countryOf(p?.nationality).id;
}

/**
 * The world's plot in its owner's home country, given on first need. The lowest free slot wins, so plots
 * fill rings around Capital Square in join order. Changing nationality moves you to your new country.
 */
export async function ensurePlot(world: Pick<World, 'id' | 'xUserId'>): Promise<{ country: CountryId; slot: number }> {
  const home = await homeCountryOf(world.xUserId);
  const have = await db.plot.findUnique({ where: { worldId: world.id } });
  if (have && have.country === home) return { country: home, slot: have.slot };
  for (let attempt = 0; attempt < 5; attempt++) {
    const used = await db.plot.findMany({ where: { country: home }, select: { slot: true }, orderBy: { slot: 'asc' } });
    let slot = CAPITAL_SLOT + 1;
    for (const u of used) {
      if (u.slot === slot) slot++;
      else if (u.slot > slot) break;
    }
    try {
      if (have) await db.plot.update({ where: { worldId: world.id }, data: { country: home, slot } });
      else await db.plot.create({ data: { worldId: world.id, country: home, slot } });
      if (have) revalidateTag(`country:${have.country}`);
      revalidateTag(`country:${home}`);
      return { country: home, slot };
    } catch (e) {
      // someone took that slot a moment ago: look again
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  throw new Error('Could not find a free plot.');
}

/** Where a handle's block is: country, slot and footprint. Gives the world a plot if it has none yet. */
export async function blockOf(world: Pick<World, 'id' | 'xUserId'>) {
  const { country, slot } = await ensurePlot(world);
  return { country, slot, rect: plotRect(slot) };
}

type BlockRow = Omit<StructureRow, 'text' | 'mediaUrl' | 'hidden'> & { worldId: string };

/**
 * The posts that stand in each block: the pinned (or best) post, then the most engaged, up to one per lot.
 * Lamps (reposts) and sheds (replies to others) stay in the full world. Same choice for map and texts.
 */
async function blockRows(worldIds: string[]): Promise<BlockRow[]> {
  if (worldIds.length === 0) return [];
  return db.$queryRaw<BlockRow[]>`
    SELECT id, "worldId", "postId", kind::text AS kind, "conversationId", "referencedId", "mediaKind", likes, reposts, replies, impressions,
           to_char("postedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "postedAt", "lanternsLit"
    FROM (
      SELECT s.*, row_number() OVER (
        PARTITION BY s."worldId"
        ORDER BY (s."postId" = w."landmarkPostId") DESC NULLS LAST,
                 (coalesce(s.likes, 0) + 2 * coalesce(s.reposts, 0) + coalesce(s.replies, 0) + coalesce(s.impressions, 0) / 100.0) DESC,
                 s."postedAt" DESC
      ) AS rk
      FROM "Structure" s JOIN "World" w ON w.id = s."worldId"
      WHERE s."worldId" = ANY(${worldIds}) AND s.hidden = false AND s.kind::text NOT IN ('lantern', 'outbuilding')
    ) t
    WHERE rk <= ${PLOT_LOTS}`;
}

/** The post ids standing in one world's block, for handing out their text. */
export async function blockPostIds(worldId: string) {
  return (await blockRows([worldId])).map((r) => r.postId);
}

const ringOf = (slot: number) => {
  const c = plotCell(slot);
  return Math.max(Math.abs(c.pi), Math.abs(c.pj));
};

async function buildCountry(country: CountryId): Promise<CountryModel> {
  const plots = await db.plot.findMany({
    where: { country, world: { owner: { revokedAt: null } } },
    orderBy: { slot: 'asc' },
    include: { world: { include: { owner: { select: { name: true, avatarUrl: true } } } } },
  });
  const ids = plots.map((p) => p.worldId);
  const [rows, marks] = await Promise.all([
    blockRows(ids),
    ids.length ? db.mark.findMany({ where: { worldId: { in: ids } }, orderBy: { at: 'desc' }, take: 40 * ids.length }) : Promise.resolve([]),
  ]);
  const byWorld = new Map<string, BlockRow[]>();
  for (const r of rows) byWorld.get(r.worldId)?.push(r) ?? byWorld.set(r.worldId, [r]);

  const structures: Placed[] = [];
  const blocks: Block[] = [];
  const taken = new Set<string>();
  const models: PlotModel[] = [];
  let followers = 0;
  for (const p of plots) {
    const w = p.world;
    const mine = (byWorld.get(w.id) ?? []).map((r) => ({ ...r, text: '', mediaUrl: null, hidden: false }) as StructureRow);
    const g = buildWorld(mine, {
      handle: w.handle,
      accountCreatedAt: w.accountCreatedAt,
      followersCount: w.followersCount,
      landmarkPostId: w.landmarkPostId,
      showReplies: true,
      blockOrder: plotBlocks(p.slot),
      noGaps: true,
    });
    for (const s of g.structures) structures.push({ ...s, owner: w.handle });
    for (const b of g.blocks) {
      blocks.push(b);
      taken.add(`${b.i},${b.j}`);
    }
    followers += w.followersCount;
    models.push({
      slot: p.slot,
      handle: w.handle,
      worldId: w.id,
      xUserId: w.xUserId,
      ownerName: w.owner.name,
      ownerAvatar: w.owner.avatarUrl,
      access: w.access,
      followersCount: w.followersCount,
      postCount: w.postCount,
      shown: g.structures.length,
      showMetrics: w.showMetrics,
      chatEnabled: w.chatEnabled,
      accountCreatedAt: w.accountCreatedAt.toISOString(),
      lastSyncAt: w.lastSyncAt?.toISOString() ?? null,
      ingestState: w.ingestState,
      rect: plotRect(p.slot),
    });
  }

  // Every other city block inside the square of rings: Capital Square is a park, free plots are bare lots.
  const rings = Math.max(1, ...plots.map((p) => ringOf(p.slot)));
  const K = rings * PLOT_BLOCKS + (PLOT_BLOCKS - 1) / 2;
  const capital = new Set(plotBlocks(CAPITAL_SLOT).map((b) => `${b.i},${b.j}`));
  for (let i = -K; i <= K; i++)
    for (let j = -K; j <= K; j++) {
      const key = `${i},${j}`;
      if (taken.has(key)) continue;
      const cls: TerrainClass = capital.has(key) ? 'lush' : 'sand';
      const x = i * PITCH_X, z = j * PITCH_Z;
      const vacant = Array.from({ length: LOTS_PER_BLOCK }, (_, l) => {
        const row = l < LOTS_PER_BLOCK / 2 ? -1 : 1;
        const col = l % (LOTS_PER_BLOCK / 2);
        const lw = BLOCK_W / (LOTS_PER_BLOCK / 2), ld = BLOCK_D / 2;
        return { x: x - BLOCK_W / 2 + lw / 2 + col * lw, z: z + (row * ld) / 2, w: lw, d: ld, cls, facing: row as 1 | -1 };
      });
      blocks.push({ i, j, x, z, cls, vacant, used: 0 });
    }

  const grid: CityGrid = { K, pitchX: PITCH_X, pitchZ: PITCH_Z, blockW: BLOCK_W, blockD: BLOCK_D, road: ROAD, sidewalk: SIDEWALK };
  const contentRadius = Math.hypot((K + 0.5) * PITCH_X, (K + 0.5) * PITCH_Z);
  const geometry: WorldGeometry = {
    structures,
    blocks,
    grid,
    outside: 'lush',
    boundaryRadius: contentRadius + 45,
    contentRadius,
    // a country keeps its own clock: early afternoon
    skyPhase: 'noon',
    skyT: 0.36,
    residents: Math.min(40, 8 + Math.round(Math.log10(1 + followers) * 4)),
    cars: Math.min(64, 12 + plots.length * 4),
    landmarkId: null,
  };

  // Guestbook stones are kept relative to their block's centre (older ones were laid in a world of their own,
  // centred the same way); clamp them into the block so a stone from a big old world never lands next door.
  const rectOf = new Map(models.map((m) => [m.worldId, m]));
  const perWorld = new Map<string, number>();
  const out: CountryMark[] = [];
  for (const m of marks) {
    const pm = rectOf.get(m.worldId);
    if (!pm) continue;
    const n = perWorld.get(m.worldId) ?? 0;
    if (n >= 40) continue;
    perWorld.set(m.worldId, n + 1);
    const hx = pm.rect.w / 2 - 4, hz = pm.rect.d / 2 - 4;
    out.push({
      id: m.id, byHandle: m.byHandle, text: m.text, at: m.at.toISOString(), bright: m.bright, owner: pm.handle,
      x: pm.rect.x + Math.max(-hx, Math.min(hx, m.x)),
      z: pm.rect.z + Math.max(-hz, Math.min(hz, m.z)),
    });
  }
  return { country, geometry, plots: models, marks: out };
}

/** A country's map, cached briefly (and dropped whenever a plot is given out). */
export const loadCountryModel = (country: CountryId) =>
  unstable_cache(() => buildCountry(country), ['country-model', country], { revalidate: 20, tags: [`country:${country}`] })();
