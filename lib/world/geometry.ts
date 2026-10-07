import { seededFor } from './seed';

// Pure world geometry. Input is the structure rows as stored (real post fields only);
// output is what the renderer draws. No randomness beyond the handle-seeded PRNG.

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
  /** base elevation (thread segments stack) */
  y: number;
  rot: number;
  height: number;
  width: number;
  windows: number;
  glow: number; // 0..1
  text: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  impressions: number | null;
  postedAt: string;
  lanternsLit: number;
  /** index in chronological order — the spiral position */
  index: number;
  /** thread segment index (0 = root) */
  segment: number;
  isLandmark: boolean;
  metricsKnown: boolean;
};

export type TerrainBand = { rIn: number; rOut: number; cls: TerrainClass };

export type WorldGeometry = {
  structures: Placed[];
  bands: TerrainBand[];
  boundaryRadius: number;
  contentRadius: number;
  skyPhase: SkyPhase;
  skyT: number; // 0..1 along dawn->night
  residents: number;
  landmarkId: string | null;
};

// Spiral: Fermat r = SPACING * sqrt(i), golden angle. Slot i for chronological index i.
export const SPACING = 4.4;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function spiralSlot(i: number): { x: number; z: number; r: number; theta: number } {
  const r = SPACING * Math.sqrt(i + 1);
  const theta = i * GOLDEN;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r, r, theta };
}

/** Inverse of spiralSlot's radius: which chronological index sits at radius r. */
export function indexAtRadius(r: number): number {
  return Math.max(0, (r / SPACING) ** 2 - 1);
}

// Engagement -> geometry, log scaled so a 9M-view post is a landmark without crushing everything.
const MIN_HEIGHT: Record<StructureKind, number> = { pillar: 1.6, spire: 1.4, monolith: 2.2, obelisk: 2.4, outbuilding: 0.9, lantern: 0.6 };
const MIN_WIDTH: Record<StructureKind, number> = { pillar: 0.7, spire: 0.8, monolith: 1.3, obelisk: 1.0, outbuilding: 0.6, lantern: 0.3 };

export function scaleHeight(kind: StructureKind, likes: number | null) {
  const base = MIN_HEIGHT[kind];
  if (likes == null) return base;
  return base + Math.log10(1 + likes) * 1.35; // 10 likes ~ +1.4, 10k ~ +5.4, 1M ~ +8.1
}
export function scaleWidth(kind: StructureKind, reposts: number | null) {
  const base = MIN_WIDTH[kind];
  if (reposts == null) return base;
  return base + Math.log10(1 + reposts) * 0.45;
}
export function scaleWindows(replies: number | null) {
  if (replies == null) return 0;
  return Math.min(24, Math.round(Math.log2(1 + replies) * 1.5));
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
  // followers set the boundary; the world always fits inside it with a walkable margin.
  const fromFollowers = 36 + Math.log10(1 + followersCount) * 22; // 0 -> 36, 1k -> 102, 1M -> 168
  return Math.max(contentRadius + 18, fromFollowers);
}

export function residentsFor(followersCount: number) {
  return Math.min(40, Math.round(Math.log10(1 + followersCount) * 5));
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
  const rand = seededFor(opts.handle, 'rot');
  const rows = rowsIn
    .filter((r) => !r.hidden)
    .filter((r) => opts.showReplies || r.kind !== 'outbuilding')
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.postId.localeCompare(b.postId));

  // Threads: group spire segments and pillars that share a conversation with other owner posts.
  const byConv = new Map<string, StructureRow[]>();
  for (const r of rows) if (r.conversationId) byConv.get(r.conversationId)?.push(r) ?? byConv.set(r.conversationId, [r]);
  const threadRoot = new Map<string, StructureRow>(); // conversationId -> root row
  for (const [conv, group] of byConv) {
    const hasSpire = group.some((g) => g.kind === 'spire');
    if (group.length > 1 && hasSpire) threadRoot.set(conv, group[0]);
  }

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

  const placed: Placed[] = [];
  const slotOf = new Map<string, Placed>(); // postId -> placed (for thread stacking / outbuilding attach)
  let slot = 0;
  const bands: TerrainBand[] = [];
  let prevTime: number | null = null;

  const pushBand = (rIn: number, rOut: number, cls: TerrainClass) => {
    const last = bands[bands.length - 1];
    if (last && last.cls === cls) last.rOut = rOut;
    else bands.push({ rIn, rOut, cls });
  };

  for (const r of rows) {
    const t = Date.parse(r.postedAt);
    const kindIsThreadSegment = r.conversationId && threadRoot.has(r.conversationId) && threadRoot.get(r.conversationId) !== r;
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
    };

    if (kindIsThreadSegment) {
      // Stack on the root's column.
      const root = slotOf.get(threadRoot.get(r.conversationId as string)!.postId);
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
          width: Math.max(0.6, root.width * 0.92),
          index: root.index,
          segment: siblings.length,
        };
        placed.push(p);
        slotOf.set(r.postId, p);
        continue;
      }
    }

    if (r.kind === 'outbuilding') {
      // Attach to the nearest structure posted within the same hour; otherwise it takes a small slot of its own.
      const hourAgo = t - 3600 * 1000;
      const parent = [...placed].reverse().find((p) => p.kind !== 'outbuilding' && p.kind !== 'lantern' && Date.parse(p.postedAt) >= hourAgo);
      if (parent) {
        const a = rand() * Math.PI * 2;
        const d = parent.width + 0.9;
        const p: Placed = {
          ...base,
          kind: 'outbuilding',
          x: parent.x + Math.cos(a) * d,
          z: parent.z + Math.sin(a) * d,
          y: 0,
          rot: rand() * Math.PI * 2,
          height: scaleHeight('outbuilding', r.likes),
          width: scaleWidth('outbuilding', r.reposts),
          index: parent.index,
          segment: 0,
        };
        placed.push(p);
        slotOf.set(r.postId, p);
        continue;
      }
    }

    // A silence longer than a week skips spiral slots, so quiet periods are visibly barren ground
    // you walk across rather than a line between two posts. Capped so a years-long gap stays walkable.
    const gapDays = prevTime == null ? 0 : (t - prevTime) / 86400000;
    const rPrev = slot === 0 ? 0 : spiralSlot(slot - 1).r;
    if (gapDays > 7) slot += Math.min(60, Math.floor((gapDays - 7) / 4));

    const { x, z, r: radius } = spiralSlot(slot);
    const kind: StructureKind = r.conversationId && threadRoot.get(r.conversationId) === r ? 'spire' : r.kind;
    const p: Placed = {
      ...base,
      kind,
      x,
      z,
      y: 0,
      rot: rand() * Math.PI * 2,
      height: scaleHeight(kind, r.likes),
      width: scaleWidth(kind, r.reposts),
      index: slot,
      segment: 0,
    };
    placed.push(p);
    slotOf.set(r.postId, p);

    // Terrain band from the previous post's radius to this one = the gap since the previous post.
    pushBand(rPrev, radius, terrainClassForGapDays(gapDays));
    prevTime = t;
    slot++;
  }

  const contentRadius = slot === 0 ? 0 : spiralSlot(slot - 1).r;
  const boundaryRadius = boundaryRadiusFor(opts.followersCount, contentRadius);
  // Outside the newest post: the gap from the last post to now.
  const tailDays = prevTime == null ? 365 : (now.getTime() - prevTime) / 86400000;
  pushBand(contentRadius, boundaryRadius + 10, terrainClassForGapDays(tailDays));

  const sky = skyFromAccountAge(opts.accountCreatedAt, now);
  return {
    structures: placed,
    bands,
    boundaryRadius,
    contentRadius,
    skyPhase: sky.phase,
    skyT: sky.t,
    residents: residentsFor(opts.followersCount),
    landmarkId,
  };
}
