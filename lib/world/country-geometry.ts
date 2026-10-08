import { BLOCK_D, BLOCK_W, LOTS_PER_BLOCK, PITCH_X, PITCH_Z, ROAD, SIDEWALK, boundaryRadiusFor, buildWorld, type Block, type CityGrid, type Placed, type StructureRow, type TerrainClass, type WorldGeometry } from './geometry';
import { CAPITAL_SLOT, PLOT_BLOCKS, plotBlocks, plotCell } from './country-map';
import { isFiller } from './filler';

// A country's map as one WorldGeometry (pure, so scripts/check-world.ts can check it): every player's plot
// (their posts laid out in their own 3 x 3 city blocks), Capital Square as a park, and the plots nobody has
// yet as bare lots, filling the square of rings the plots reach. The capital's roads, traffic, residents,
// venues, airport and map all work on it unchanged.

export type PlotInput = { slot: number; handle: string; rows: StructureRow[]; accountCreatedAt: Date; followersCount: number; landmarkPostId: string | null };

const ringOf = (slot: number) => {
  const c = plotCell(slot);
  return Math.max(Math.abs(c.pi), Math.abs(c.pj));
};

export function composeCountryGeometry(plots: PlotInput[], now?: Date): { geometry: WorldGeometry; shown: Map<number, number> } {
  const structures: Placed[] = [];
  const blocks: Block[] = [];
  const taken = new Set<string>();
  const shown = new Map<number, number>();
  let followers = 0;
  for (const p of plots) {
    const g = buildWorld(p.rows, {
      handle: p.handle,
      accountCreatedAt: p.accountCreatedAt,
      followersCount: p.followersCount,
      landmarkPostId: p.landmarkPostId,
      showReplies: true,
      blockOrder: plotBlocks(p.slot),
      noGaps: true,
      now,
    });
    for (const s of g.structures) structures.push({ ...s, owner: p.handle });
    for (const b of g.blocks) {
      blocks.push(b);
      taken.add(`${b.i},${b.j}`);
    }
    shown.set(p.slot, g.structures.filter((s) => !isFiller(s.postId)).length);
    followers += p.followersCount;
  }

  // Every other city block inside the square of rings: Capital Square is a park, free plots are bare lots.
  const rings = Math.max(1, ...plots.map((p) => ringOf(p.slot)));
  const K = rings * PLOT_BLOCKS + (PLOT_BLOCKS - 1) / 2;
  const capital = new Set(plotBlocks(CAPITAL_SLOT).map((b) => `${b.i},${b.j}`));
  const half = LOTS_PER_BLOCK / 2;
  for (let i = -K; i <= K; i++)
    for (let j = -K; j <= K; j++) {
      const key = `${i},${j}`;
      if (taken.has(key)) continue;
      const cls: TerrainClass = capital.has(key) ? 'lush' : 'sand';
      const x = i * PITCH_X, z = j * PITCH_Z;
      const lw = BLOCK_W / half, ld = BLOCK_D / 2;
      const vacant = Array.from({ length: LOTS_PER_BLOCK }, (_, l) => {
        const row: 1 | -1 = l < half ? -1 : 1;
        return { x: x - BLOCK_W / 2 + lw / 2 + (l % half) * lw, z: z + (row * ld) / 2, w: lw, d: ld, cls, facing: row };
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
    // past the plots, the venue ring and the nightlife row behind it (boundaryRadiusFor keeps the clubs on land)
    boundaryRadius: Math.max(contentRadius + 45, boundaryRadiusFor(0, contentRadius)),
    contentRadius,
    // a country keeps its own clock: early afternoon
    skyPhase: 'noon',
    skyT: 0.36,
    residents: Math.min(40, 8 + Math.round(Math.log10(1 + followers) * 4)),
    cars: Math.min(64, 12 + plots.length * 4),
    landmarkId: null,
  };
  return { geometry, shown };
}
