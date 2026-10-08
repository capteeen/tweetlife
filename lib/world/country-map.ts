import { BLOCK_D, PITCH_X, PITCH_Z, SIDEWALK } from './geometry';
import type { CountryId } from './countries';

// Each country is one shared map in one coordinate frame. The capital (venue ring, ring road, airport,
// landmarks) wraps a grid of plots. A plot is PLOT_BLOCKS x PLOT_BLOCKS city blocks; plot 0, the centre,
// is Capital Square, and every player's posts city is one plot in their home country.
// Plots are handed out in rings around the square in join order and never move once given (Plot table).
// Pure: the server, the 3D scene, the map and the presence server all agree on these numbers.

/** City blocks per plot side. Odd, so a plot is centred on one block. */
export const PLOT_BLOCKS = 3;
/** Lots a player's block holds: 8 lots per city block. */
export const PLOT_LOTS = PLOT_BLOCKS * PLOT_BLOCKS * 8;
export const CAPITAL_SLOT = 0;

export type PlotCell = { pi: number; pj: number };

const cellCache: PlotCell[] = [];
let ringsCached = 0;
/** Plot cells in allocation order: the centre, then ring by ring, each ring clockwise from the top. */
export function plotCell(slot: number): PlotCell {
  while (cellCache.length <= slot) {
    const k = ringsCached++;
    if (k === 0) {
      cellCache.push({ pi: 0, pj: 0 });
      continue;
    }
    const ring: PlotCell[] = [];
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) if (Math.max(Math.abs(i), Math.abs(j)) === k) ring.push({ pi: i, pj: j });
    ring.sort((a, b) => Math.atan2(a.pi, -a.pj) - Math.atan2(b.pi, -b.pj));
    cellCache.push(...ring);
  }
  return cellCache[slot];
}

/** City blocks of a plot, centre block first then its ring: the order a player's posts fill them. */
export function plotBlocks(slot: number): { i: number; j: number }[] {
  const { pi, pj } = plotCell(slot);
  const c = { i: pi * PLOT_BLOCKS, j: pj * PLOT_BLOCKS };
  const h = (PLOT_BLOCKS - 1) / 2;
  const out = [c];
  const ring: { i: number; j: number }[] = [];
  for (let di = -h; di <= h; di++) for (let dj = -h; dj <= h; dj++) if (di || dj) ring.push({ i: c.i + di, j: c.j + dj });
  ring.sort((a, b) => Math.atan2(a.i - c.i, -(a.j - c.j)) - Math.atan2(b.i - c.i, -(b.j - c.j)));
  return [...out, ...ring];
}

export type PlotRect = { x: number; z: number; w: number; d: number };
/** The plot's footprint in the country frame, roads included. */
export function plotRect(slot: number): PlotRect {
  const { pi, pj } = plotCell(slot);
  return { x: pi * PLOT_BLOCKS * PITCH_X, z: pj * PLOT_BLOCKS * PITCH_Z, w: PLOT_BLOCKS * PITCH_X, d: PLOT_BLOCKS * PITCH_Z };
}

/** Where a visitor arrives at a plot: on the south sidewalk of its centre block, facing it. Shaped like a
 * Player spawn (a "structure" to stand in front of). */
export function plotEntrance(slot: number) {
  const r = plotRect(slot);
  return { x: r.x, z: r.z + BLOCK_D / 2 - 1, rot: 0, depth: 0, front: { x: r.x, z: r.z + BLOCK_D / 2 + SIDEWALK / 2 } };
}

/** Which plot slot covers (x, z), or null outside the grid of plots that exist (`count` slots). */
export function plotAt(x: number, z: number, count: number): number | null {
  const pi = Math.round(x / (PLOT_BLOCKS * PITCH_X)), pj = Math.round(z / (PLOT_BLOCKS * PITCH_Z));
  for (let s = 0; s < count; s++) {
    const c = plotCell(s);
    if (c.pi === pi && c.pj === pj) return s;
  }
  return null;
}

// ---- presence rooms

/** Presence room for a country. Shard 1 is the base room; more shards open when it gets crowded. */
export const roomFor = (country: CountryId, shard = 1) => (shard <= 1 ? `country:${country}` : `country:${country}:${shard}`);
/** Newcomers go to the next shard once a room has this many people... */
export const ROOM_SOFT_CAP = 80;
/** ...but someone joining a friend may still squeeze in up to this many. */
export const ROOM_HARD_CAP = 100;
/** Live positions are only forwarded to people within this distance (metres). */
export const INTEREST_RADIUS = 120;
/** People further than this are not drawn (they still show on the map and in the directory). */
export const DRAW_RADIUS = 160;
/** How often everyone gets the light roster of everyone in their shard (ms). */
export const ROSTER_MS = 3000;
