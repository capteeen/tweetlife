import { seededFor } from './seed';

// Pure world geometry: the account's real posts laid out as a city.
// Blocks sit on a road grid and fill chronologically from the centre block outward in rings, so
// walking outward walks forward through the account's history. Each post is a building on a lot.
// No randomness beyond the handle-seeded PRNG.

export type StructureKind = 'pillar' | 'spire' | 'monolith' | 'obelisk' | 'outbuilding' | 'lantern';
export type TerrainClass = 'lush' | 'dry' | 'sand';
export type SkyPhase = 'dawn' | 'noon' | 'evening' | 'night';

export type StructureRow = {
  id: string;
  postId: string;
  kind: StructureKind;
  conversationId: string | null;
  referencedId: string | null;
  text: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  impressions: number | null;
  postedAt: string; // ISO
  hidden: boolean;
  lanternsLit: number;
};

export type Placed = {
  id: string;
  postId: string;
  kind: StructureKind;
  x: number;
  z: number;
  /** base elevation (tower segments stack) */
  y: number;
  /** 0 = front faces +z, PI = front faces -z (always axis aligned, facing the street) */
  rot: number;
  height: number;
  /** footprint along x */
  width: number;
  /** footprint along z */
  depth: number;
  windows: number;
  glow: number; // 0..1
  /** roof palette index 0..3 */
  roof: number;
  text: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  impressions: number | null;
  postedAt: string;
  lanternsLit: number;
  /** chronological lot index */
  index: number;
  /** tower segment index (0 = root) */
  segment: number;
  isLandmark: boolean;
  metricsKnown: boolean;
};

export type Lot = { x: number; z: number; w: number; d: number; cls: TerrainClass; facing: 1 | -1 };
export type Block = { i: number; j: number; x: number; z: number; cls: TerrainClass; vacant: Lot[]; used: number };

export type CityGrid = {
  /** ring count: blocks span i,j in [-K, K] */
  K: number;
  pitchX: number;
  pitchZ: number;
  blockW: number;
  blockD: number;
  road: number;
  sidewalk: number;
};

export type WorldGeometry = {
  structures: Placed[];
  blocks: Block[];
  grid: CityGrid;
  /** terrain class of the countryside beyond the city (gap from the newest post to now) */
  outside: TerrainClass;
  boundaryRadius: number;
  contentRadius: number;
  skyPhase: SkyPhase;
  skyT: number; // 0..1 along dawn->night
  residents: number;
  cars: number;
  landmarkId: string | null;
};

// City dimensions (world units ≈ metres).
export const LOT_W = 7;
export const LOT_D = 11;
export const LOTS_PER_SIDE = 4;
export const BLOCK_W = LOT_W * LOTS_PER_SIDE; // 28
export const BLOCK_D = LOT_D * 2; // 22, two rows back to back
export const SIDEWALK = 2;
export const ROAD = 7;
export const PITCH_X = BLOCK_W + 2 * SIDEWALK + ROAD; // 39
export const PITCH_Z = BLOCK_D + 2 * SIDEWALK + ROAD; // 33
export const LOTS_PER_BLOCK = LOTS_PER_SIDE * 2;
/** Repost lamps stand at least this far to the side of the door they are in front of. */
const LAMP_DOOR_CLEAR = 1.8;

/** Block coordinates in fill order: ring by ring from the centre, each ring clockwise from the top. */
export function blockOrder(count: number): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  for (let k = 0; out.length < count; k++) {
    if (k === 0) {
      out.push({ i: 0, j: 0 });
      continue;
    }
    const ring: { i: number; j: number }[] = [];
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) if (Math.max(Math.abs(i), Math.abs(j)) === k) ring.push({ i, j });
    ring.sort((a, b) => Math.atan2(a.i, -a.j) - Math.atan2(b.i, -b.j));
    out.push(...ring);
  }
  return out.slice(0, count);
}

export function lotAt(block: { i: number; j: number }, l: number): Lot {
  const bx = block.i * PITCH_X, bz = block.j * PITCH_Z;
  const row: 1 | -1 = l < LOTS_PER_SIDE ? -1 : 1; // north row faces -z, south row faces +z
  const col = l % LOTS_PER_SIDE;
  return { x: bx - BLOCK_W / 2 + LOT_W / 2 + col * LOT_W, z: bz + (row * LOT_D) / 2, w: LOT_W, d: LOT_D, cls: 'lush', facing: row };
}

// Engagement -> geometry, log scaled so a 9M-view post is a landmark without crushing everything.
const MIN_HEIGHT: Record<StructureKind, number> = { pillar: 3.2, spire: 3.0, monolith: 4.0, obelisk: 4.2, outbuilding: 1.6, lantern: 3.2 };
const MIN_WIDTH: Record<StructureKind, number> = { pillar: 3.6, spire: 3.8, monolith: 4.4, obelisk: 4.2, outbuilding: 1.8, lantern: 0.3 };

export function scaleHeight(kind: StructureKind, likes: number | null) {
  const base = MIN_HEIGHT[kind];
  if (likes == null || kind === 'lantern') return base;
  return base + Math.log10(1 + likes) * 2.4; // 10 likes ~ +2.5 (one floor), 10k ~ +9.6, 1M ~ +14.4
}
export function scaleWidth(kind: StructureKind, reposts: number | null) {
  const base = MIN_WIDTH[kind];
  if (reposts == null || kind === 'lantern') return base;
  return Math.min(LOT_W - 1, base + Math.log10(1 + reposts) * 0.6);
}
export function scaleWindows(replies: number | null) {
  if (replies == null) return 0;
  return Math.min(40, Math.round(Math.log2(1 + replies) * 2.5));
}
export function scaleGlow(impressions: number | null) {
  if (impressions == null) return 0;
  return Math.min(1, Math.log10(1 + impressions) / 7); // 10M impressions -> 1.0
}

export function engagementScore(s: Pick<StructureRow, 'likes' | 'reposts' | 'replies' | 'impressions'>) {
  return (s.likes ?? 0) + 2 * (s.reposts ?? 0) + (s.replies ?? 0) + (s.impressions ?? 0) / 100;
}

export function terrainClassForGapDays(days: number): TerrainClass {
  if (days <= 7) return 'lush';
  if (days <= 30) return 'dry';
  return 'sand';
}

export function skyFromAccountAge(accountCreatedAt: Date, now = new Date()): { phase: SkyPhase; t: number } {
  const years = (now.getTime() - accountCreatedAt.getTime()) / (365.25 * 24 * 3600 * 1000);
  // 0y -> dawn, ~3y -> noon, ~8y -> evening, 14y+ -> night
  const t = Math.max(0, Math.min(1, years / 14));
  const phase: SkyPhase = t < 0.18 ? 'dawn' : t < 0.5 ? 'noon' : t < 0.85 ? 'evening' : 'night';
  return { phase, t };
}

export function boundaryRadiusFor(followersCount: number, contentRadius: number) {
  // followers set the boundary; the city, its ring of venues and the district names always fit inside it.
  const fromFollowers = 60 + Math.log10(1 + followersCount) * 30; // 0 -> 60, 1k -> 150, 1M -> 240
  return Math.max(contentRadius + 36, fromFollowers);
}

export function residentsFor(followersCount: number) {
  return Math.min(40, Math.round(Math.log10(1 + followersCount) * 5));
}
export function carsFor(followersCount: number) {
  return Math.min(64, 8 + Math.round(Math.log10(1 + followersCount) * 7));
}

export type BuildOptions = {
  handle: string;
  accountCreatedAt: Date;
  followersCount: number;
  landmarkPostId: string | null;
  showReplies: boolean;
  now?: Date;
};

export function buildWorld(rowsIn: StructureRow[], opts: BuildOptions): WorldGeometry {
  const now = opts.now ?? new Date();
  const rand = seededFor(opts.handle, 'city');
  const rows = rowsIn
    .filter((r) => !r.hidden)
    .filter((r) => opts.showReplies || r.kind !== 'outbuilding')
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.postId.localeCompare(b.postId));

  // Threads: owner posts sharing a conversation with a self-reply stack into one tower.
  const byConv = new Map<string, StructureRow[]>();
  for (const r of rows) if (r.conversationId) byConv.get(r.conversationId)?.push(r) ?? byConv.set(r.conversationId, [r]);
  const threadRoot = new Map<string, StructureRow>();
  for (const [conv, group] of byConv) if (group.length > 1 && group.some((g) => g.kind === 'spire')) threadRoot.set(conv, group[0]);

  // Landmark: pinned post, else the highest-engagement post of all time.
  let landmarkId: string | null = null;
  if (opts.landmarkPostId && rows.some((r) => r.postId === opts.landmarkPostId)) landmarkId = opts.landmarkPostId;
  else {
    let best = -1;
    for (const r of rows) {
      if (r.kind === 'lantern' || r.kind === 'outbuilding') continue;
      const s = engagementScore(r);
      if (s > best) {
        best = s;
        landmarkId = r.postId;
      }
    }
  }

  // Pass 1: assign lots. Lamps (reposts) and sheds (replies to others) attach to the previous building's
  // lot and do not consume one. Silences longer than a week leave vacant lots behind.
  type LotAssign = { cls: TerrainClass; occupied: boolean };
  const lots: LotAssign[] = [];
  const placed: Placed[] = [];
  const byPost = new Map<string, Placed>();
  let prevTime: number | null = null;
  let lastBuilding: Placed | null = null;

  let order: { i: number; j: number }[] = blockOrder(9);
  const lotFor = (idx: number): Lot => {
    const b = Math.floor(idx / LOTS_PER_BLOCK);
    if (b >= order.length) order = blockOrder(Math.max(b + 1, order.length * 2));
    return lotAt(order[b], idx % LOTS_PER_BLOCK);
  };

  for (const r of rows) {
    const t = Date.parse(r.postedAt);
    const gapDays = prevTime == null ? 0 : (t - prevTime) / 86400000;
    const gapCls = terrainClassForGapDays(gapDays);
    prevTime = t;
    const metricsKnown = r.likes != null;
    const base = {
      id: r.id,
      postId: r.postId,
      text: r.text,
      mediaUrl: r.mediaUrl,
      mediaKind: r.mediaKind,
      likes: r.likes,
      reposts: r.reposts,
      replies: r.replies,
      impressions: r.impressions,
      postedAt: r.postedAt,
      lanternsLit: r.lanternsLit,
      windows: scaleWindows(r.replies),
      glow: scaleGlow(r.impressions),
      isLandmark: r.postId === landmarkId,
      metricsKnown,
      roof: Math.floor(rand() * 4),
    };

    // Tower segment: stack on the thread root's building.
    const isSegment = r.conversationId && threadRoot.has(r.conversationId) && threadRoot.get(r.conversationId) !== r;
    if (isSegment) {
      const root = byPost.get(threadRoot.get(r.conversationId as string)!.postId);
      if (root) {
        const siblings = placed.filter((p) => p.x === root.x && p.z === root.z);
        const y = siblings.reduce((acc, p) => acc + p.height, 0);
        const p: Placed = {
          ...base,
          kind: 'spire',
          x: root.x,
          z: root.z,
          y,
          rot: root.rot,
          height: scaleHeight('spire', r.likes),
          width: Math.max(2.4, root.width * 0.9),
          depth: Math.max(2.4, root.depth * 0.9),
          index: root.index,
          segment: siblings.length,
        };
        placed.push(p);
        byPost.set(r.postId, p);
        continue;
      }
    }

    // Lamp (repost): on the curb side of the sidewalk in front of the previous building, never in its doorway.
    if (r.kind === 'lantern' && lastBuilding) {
      const side = lastBuilding.rot === 0 ? 1 : -1;
      let dx = (rand() - 0.5) * (LOT_W - 1.5);
      if (Math.abs(dx) < LAMP_DOOR_CLEAR) dx = (dx < 0 ? -1 : 1) * LAMP_DOOR_CLEAR;
      const p: Placed = {
        ...base,
        kind: 'lantern',
        x: lastBuilding.x + dx,
        z: lastBuilding.z + side * (lastBuilding.depth / 2 + 1.2 + SIDEWALK * 0.75),
        y: 0,
        rot: lastBuilding.rot,
        height: MIN_HEIGHT.lantern,
        width: MIN_WIDTH.lantern,
        depth: MIN_WIDTH.lantern,
        index: lastBuilding.index,
        segment: 0,
      };
      placed.push(p);
      byPost.set(r.postId, p);
      continue;
    }

    // Shed (reply to someone else): beside the nearest building posted within the same hour, else the previous one.
    if (r.kind === 'outbuilding' && lastBuilding) {
      const hourAgo = t - 3600 * 1000;
      const parent = [...placed].reverse().find((p) => p.kind !== 'outbuilding' && p.kind !== 'lantern' && Date.parse(p.postedAt) >= hourAgo) ?? lastBuilding;
      const w = scaleWidth('outbuilding', r.reposts);
      // beside the parent, on whichever side keeps it inside the block (an end lot has a sidewalk on one side)
      const bx = Math.round(parent.x / PITCH_X) * PITCH_X;
      const off = parent.width / 2 + w / 2 + 0.3;
      let sideX = rand() < 0.5 ? -1 : 1;
      if (Math.abs(parent.x + sideX * off - bx) + w / 2 > BLOCK_W / 2 - 0.2) sideX = -sideX;
      const p: Placed = {
        ...base,
        kind: 'outbuilding',
        x: parent.x + sideX * off,
        z: parent.z + (parent.rot === 0 ? -1 : 1) * (parent.depth / 2 + w * 0.45 + 0.3),
        y: 0,
        rot: parent.rot,
        height: scaleHeight('outbuilding', r.likes),
        width: w,
        depth: w * 0.9,
        index: parent.index,
        segment: 0,
      };
      placed.push(p);
      byPost.set(r.postId, p);
      continue;
    }

    // Vacant lots for the silence before this post.
    if (gapDays > 7) {
      const skip = Math.min(24, Math.floor((gapDays - 7) / 3));
      for (let k = 0; k < skip; k++) lots.push({ cls: gapCls, occupied: false });
    }

    const idx = lots.length;
    const lot = lotFor(idx);
    const kind: StructureKind = r.conversationId && threadRoot.get(r.conversationId) === r ? 'spire' : r.kind;
    const width = scaleWidth(kind, r.reposts);
    const depth = Math.min(LOT_D - 3, width * 1.2 + 1.5);
    const p: Placed = {
      ...base,
      kind,
      x: lot.x,
      // buildings sit toward the street side of their lot, leaving a back yard
      z: lot.z + lot.facing * (LOT_D / 2 - depth / 2 - 1.2),
      y: 0,
      rot: lot.facing === 1 ? 0 : Math.PI,
      height: scaleHeight(kind, r.likes),
      width,
      depth,
      index: idx,
      segment: 0,
    };
    lots.push({ cls: gapCls, occupied: true });
    placed.push(p);
    byPost.set(r.postId, p);
    lastBuilding = p;
  }

  // Blocks: terrain class by majority of their lots; vacant lots listed for rendering.
  const tailDays = prevTime == null ? 365 : (now.getTime() - prevTime) / 86400000;
  const outside = terrainClassForGapDays(tailDays);
  const nBlocks = Math.max(1, Math.ceil(lots.length / LOTS_PER_BLOCK));
  if (nBlocks > order.length) order = blockOrder(nBlocks);
  const blocks: Block[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const bl = order[b];
    const counts: Record<TerrainClass, number> = { lush: 0, dry: 0, sand: 0 };
    const vacant: Lot[] = [];
    let used = 0;
    for (let l = 0; l < LOTS_PER_BLOCK; l++) {
      const a = lots[b * LOTS_PER_BLOCK + l];
      const cls = a ? a.cls : outside;
      counts[cls]++;
      if (!a || !a.occupied) vacant.push({ ...lotAt(bl, l), cls });
      else used++;
    }
    const cls = (Object.keys(counts) as TerrainClass[]).sort((p, q) => counts[q] - counts[p])[0];
    blocks.push({ i: bl.i, j: bl.j, x: bl.i * PITCH_X, z: bl.j * PITCH_Z, cls, vacant, used });
  }
  const K = blocks.reduce((m, b) => Math.max(m, Math.abs(b.i), Math.abs(b.j)), 0);
  const grid: CityGrid = { K, pitchX: PITCH_X, pitchZ: PITCH_Z, blockW: BLOCK_W, blockD: BLOCK_D, road: ROAD, sidewalk: SIDEWALK };
  const contentRadius = Math.hypot((K + 0.5) * PITCH_X, (K + 0.5) * PITCH_Z);
  const boundaryRadius = boundaryRadiusFor(opts.followersCount, contentRadius);
  const sky = skyFromAccountAge(opts.accountCreatedAt, now);

  return {
    structures: placed,
    blocks,
    grid,
    outside,
    boundaryRadius,
    contentRadius,
    skyPhase: sky.phase,
    skyT: sky.t,
    residents: residentsFor(opts.followersCount),
    cars: carsFor(opts.followersCount),
    landmarkId,
  };
}

// Top surfaces of the ground layers City.tsx draws, so walkers stand on them instead of on y = 0.
export const ASPHALT_TOP = 0.04;
export const SIDEWALK_TOP = 0.2;
const BLOCK_TOP = 0.26;
const LOT_TOP = 0.28;
const COUNTRYSIDE_TOP = -0.05;

/** Height of the post grid's surface at (x, z): vacant lot, block, sidewalk, road, or countryside. Walkers use
 * surfaceY in lib/world/ground.ts, which adds everything outside the grid (venues, ring road, airport). */
export function groundHeightAt(blocks: Block[], grid: CityGrid, x: number, z: number): number {
  const { K, pitchX, pitchZ, blockW, blockD, road, sidewalk } = grid;
  if (blocks.length === 0) return COUNTRYSIDE_TOP;
  const cityW = (2 * K + 1) * pitchX + road, cityD = (2 * K + 1) * pitchZ + road;
  if (Math.abs(x) > cityW / 2 || Math.abs(z) > cityD / 2) return COUNTRYSIDE_TOP;
  const i = Math.round(x / pitchX), j = Math.round(z / pitchZ);
  const b = blocks.find((bl) => bl.i === i && bl.j === j);
  if (!b) return ASPHALT_TOP;
  const dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
  if (dx > blockW / 2 + sidewalk || dz > blockD / 2 + sidewalk) return ASPHALT_TOP;
  if (dx > blockW / 2 || dz > blockD / 2) return SIDEWALK_TOP;
  for (const v of b.vacant) if (Math.abs(x - v.x) < v.w / 2 - 0.3 && Math.abs(z - v.z) < v.d / 2 - 0.3) return LOT_TOP;
  return BLOCK_TOP;
}

