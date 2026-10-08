// World check: builds a range of worlds (tiny to huge, different handles and follower counts) and fails if anything
// the scene scatters stands where it shouldn't (a tree on a road, a lamp in a doorway, a palm on the runway, a
// resident inside a wall) or if anyone would stand below the floor they're on (the club's dance floor, venue
// floors, plazas). Run: npm run check:world
import { buildWorld, type StructureRow, type StructureKind } from '../lib/world/geometry';
import { terrainOf, groundAt, venueFloorAt, toVenueFrame, taxiLinks, HANGAR_FLOOR } from '../lib/world/ground';
import { airportSpots, arrivalStand, footprint, privateStand, PLANE_SIZE } from '../lib/world/aircraft';
import { placementSite, placementConflict, zoneAt, type Site } from '../lib/world/placement';
import { cityTrees, palmSpots, streetFurniture, PROP_R, TREE_R } from '../lib/world/scatter';
import { DANCE_FLOOR, FLOOR_Y, WALK_IN } from '../lib/world/interiors';
import { TERMINAL_FLOOR } from '../lib/world/terminal';
import { RING_ROAD_W, billboardSpots, inRect } from '../lib/world/layout';
import { RESIDENTS } from '../lib/life/residents';
import { COUNTRIES, COUNTRY_IDS } from '../lib/world/countries';
import { themeOf } from '../lib/world/cityThemes';
import { buildRoutes } from '../components/world/residentPaths';
import { aroundRect, sidewalkLoop } from '../lib/world/sidewalks';

const KINDS: StructureKind[] = ['pillar', 'pillar', 'pillar', 'spire', 'monolith', 'outbuilding', 'lantern', 'obelisk'];

function rows(n: number, gapEvery: number): StructureRow[] {
  const now = Date.parse('2026-10-08T00:00:00Z');
  let t = now - n * 2 * 86400e3;
  return Array.from({ length: n }, (_, i) => {
    t += (gapEvery && i % gapEvery === 0 ? 20 : 1.5) * 86400e3; // a long silence now and then leaves vacant lots
    return {
      id: `s${i}`, postId: `p${String(i).padStart(6, '0')}`, kind: KINDS[(i * 5) % KINDS.length],
      conversationId: i % 11 === 3 ? `c${Math.floor(i / 11)}` : null, referencedId: null,
      text: 'post', mediaUrl: null, mediaKind: null,
      likes: (i * 37) % 9000, reposts: (i * 7) % 400, replies: (i * 3) % 90, impressions: (i * 911) % 400000,
      postedAt: new Date(t).toISOString(), hidden: false, lanternsLit: 0,
    };
  });
}

type Case = { handle: string; posts: number; gapEvery: number; followers: number };
const CASES: Case[] = [
  { handle: 'empty', posts: 0, gapEvery: 0, followers: 10 },
  { handle: 'tiny', posts: 3, gapEvery: 0, followers: 50 },
  { handle: 'playtester', posts: 60, gapEvery: 9, followers: 1234 },
  { handle: 'degenqueen', posts: 90, gapEvery: 0, followers: 45000 },
  { handle: 'cryptcaapo', posts: 400, gapEvery: 23, followers: 9000 },
  { handle: 'whale', posts: 2500, gapEvery: 40, followers: 2_000_000 },
];

const problems: string[] = [];
const fail = (world: string, what: string) => problems.push(`${world}: ${what}`);
const fmt = (x: number, z: number) => `(${x.toFixed(1)}, ${z.toFixed(1)})`;

function check(c: Case) {
  const g = buildWorld(rows(c.posts, c.gapEvery), {
    handle: c.handle, accountCreatedAt: new Date('2019-03-14'), followersCount: c.followers, landmarkPostId: null, showReplies: true, now: new Date('2026-10-08'),
  });
  const R = g.boundaryRadius;
  const site: Site = placementSite({ blocks: g.blocks, grid: g.grid, boundaryRadius: R, structures: g.structures });
  const t = terrainOf(g.blocks, g.grid, R);
  const w = `@${c.handle} (${c.posts} posts)`;
  let placed = 0;

  // 1. trees and palms, exactly as the scene places them
  // every countryside class, at every country's woodedness (Robinhood City's Sherwood Forest is the densest)
  const wooded = [...new Set(Object.values(COUNTRIES).map((k) => themeOf(k.id).trees))];
  for (const [outside, wood] of (['lush', 'dry', 'sand'] as const).flatMap((o) => wooded.map((w) => [o, w] as const))) {
    for (const tr of cityTrees(site, { blocks: g.blocks, grid: g.grid, outside, boundaryRadius: R, handle: c.handle, wooded: wood })) {
      placed++;
      const z = zoneAt(site, tr.x, tr.z);
      const kind = z === 'sidewalk' ? 'streetTree' : 'tree';
      const why = placementConflict(site, kind, tr.x, tr.z, kind === 'streetTree' ? TREE_R.street : TREE_R.lot);
      if (why) fail(w, `${kind} at ${fmt(tr.x, tr.z)} is on ${why}`);
    }
  }
  // street furniture and street lights, on sidewalks and clear of crossings, doors and lanes
  {
    const trees = cityTrees(site, { blocks: g.blocks, grid: g.grid, outside: 'lush', boundaryRadius: R, handle: c.handle });
    const f = streetFurniture(site, { blocks: g.blocks, grid: g.grid, trees, handle: c.handle });
    for (const p of f.props) {
      if (p.kind === 'pit') continue; // the grate round a street tree, checked with the tree
      placed++;
      const why = placementConflict(site, 'bench', p.x, p.z, PROP_R[p.kind]);
      if (why) fail(w, `${p.kind} at ${fmt(p.x, p.z)} is on ${why}`);
    }
    for (const l of f.lights) {
      placed++;
      const why = placementConflict(site, 'lamp', l.x, l.z, 0.3);
      if (why) fail(w, `street light at ${fmt(l.x, l.z)} is on ${why}`);
    }
  }
  if (g.structures.length > 0) {
    for (const p of palmSpots(site, { contentRadius: g.contentRadius, boundaryRadius: R, handle: c.handle })) {
      placed++;
      const why = placementConflict(site, 'palm', p.x, p.z, TREE_R.palm);
      if (why) fail(w, `palm at ${fmt(p.x, p.z)} is on ${why}`);
    }
    // 2. billboards
    for (const b of billboardSpots(g.contentRadius, R)) {
      placed++;
      const why = placementConflict(site, 'billboard', b.x, b.z, 2.6);
      if (why) fail(w, `billboard at ${fmt(b.x, b.z)} is on ${why}`);
    }
  }

  // 3. repost lamps on the sidewalk, clear of doors and lanes; buildings and sheds inside their block, not overlapping
  const others = g.structures.filter((s) => s.segment === 0);
  for (const s of others) {
    placed++;
    if (s.kind === 'lantern') {
      const z = zoneAt(site, s.x, s.z);
      if (z !== 'sidewalk' && z !== 'corner') fail(w, `repost lamp at ${fmt(s.x, s.z)} is on ${z}`);
      for (const b of others) {
        if (b.kind === 'lantern') continue;
        const face = b.rot === 0 ? 1 : -1;
        const front = (s.z - b.z) * face;
        if (Math.abs(s.x - b.x) < 1.2 && front > b.depth / 2 && front < b.depth / 2 + 4) fail(w, `repost lamp at ${fmt(s.x, s.z)} blocks the door of ${b.postId}`);
      }
      continue;
    }
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const x = s.x + (cx * s.width) / 2, z = s.z + (cz * s.depth) / 2;
      const zone = zoneAt(site, x, z);
      if (zone !== 'block' && zone !== 'lot') fail(w, `${s.kind} ${s.postId} reaches onto ${zone} at ${fmt(x, z)}`);
    }
    for (const o of others) {
      if (o === s || o.kind === 'lantern' || o.postId > s.postId) continue;
      if (Math.abs(o.x - s.x) < (o.width + s.width) / 2 - 0.05 && Math.abs(o.z - s.z) < (o.depth + s.depth) / 2 - 0.05) fail(w, `${s.kind} ${s.postId} overlaps ${o.kind} ${o.postId}`);
    }
  }

  // 4. venues: on open ground, off the ring road and spurs, doors facing open ground
  for (const v of t.venues) {
    if (v.custom) continue;
    placed++;
    const k = WALK_IN[v.id];
    const plaza = k ? { w: k.w + 3, d0: -k.d / 2 - 1.5, d1: k.d / 2 + 4.5 } : { w: v.w + 6, d0: -(v.d + 6) / 2, d1: (v.d + 6) / 2 };
    for (let lx = -plaza.w / 2; lx <= plaza.w / 2 + 1e-6; lx += plaza.w / 6) {
      for (let lz = plaza.d0; lz <= plaza.d1 + 1e-6; lz += (plaza.d1 - plaza.d0) / 6) {
        const c0 = Math.cos(v.rot), s0 = Math.sin(v.rot);
        const x = v.x + lx * c0 + lz * s0, z = v.z - lx * s0 + lz * c0;
        const r = Math.hypot(x, z);
        if (Math.abs(r - t.ringRoad) <= RING_ROAD_W / 2) fail(w, `${v.name} plaza is on the ring road at ${fmt(x, z)}`);
        if (t.spurs.some((sp) => inRect(sp, x, z))) fail(w, `${v.name} plaza is on a spur road at ${fmt(x, z)}`);
        if (r > R - 0.5) fail(w, `${v.name} plaza hangs over the water at ${fmt(x, z)}`);
      }
    }
    for (const o of t.venues) {
      if (o === v || o.custom || o.id > v.id) continue;
      if (Math.hypot(o.x - v.x, o.z - v.z) < (Math.max(o.w, o.d) + Math.max(v.w, v.d)) / 2 + 2) fail(w, `${v.name} overlaps ${o.name}`);
    }
  }

  // 5. ground: venue floors and the dance floor are where feet go, and there are no holes or cliffs on routes
  for (const v of t.venues) {
    const k = WALK_IN[v.id];
    if (!k || v.custom) continue;
    for (let lx = -k.w / 2 + 0.6; lx < k.w / 2 - 0.6; lx += 0.5) {
      for (let lz = -k.d / 2 + 0.6; lz < k.d / 2 - 0.6; lz += 0.5) {
        const c0 = Math.cos(v.rot), s0 = Math.sin(v.rot);
        const x = v.x + lx * c0 + lz * s0, z = v.z - lx * s0 + lz * c0;
        const onDance = v.id === 'club' && Math.abs(lx - DANCE_FLOOR.x) < DANCE_FLOOR.size / 2 && Math.abs(lz - DANCE_FLOOR.z) < DANCE_FLOOR.size / 2;
        const want = onDance ? DANCE_FLOOR.top : FLOOR_Y;
        const got = groundAt(t, x, z);
        if (Math.abs(got - want) > 1e-6) fail(w, `${v.name} floor at local ${fmt(lx, lz)} gives ${got.toFixed(3)}, floor is ${want.toFixed(3)}`);
      }
    }
  }
  const routes = buildRoutes(RESIDENTS, t.venues, g.contentRadius);
  routes.forEach((route, i) => {
    if (!route) return;
    for (const leg of route.legs) {
      if (leg.kind === 'stay') {
        placed++;
        const why = placementConflict(site, 'resident', leg.x, leg.z, 0.25);
        if (why) fail(w, `${RESIDENTS[i].name} stands on ${why} at ${fmt(leg.x, leg.z)}`);
        const floor = venueFloorAt(t.venues, leg.x, leg.z);
        const y = leg.y ?? groundAt(t, leg.x, leg.z);
        if (floor !== null && y < floor - 1e-6) fail(w, `${RESIDENTS[i].name} sinks into the floor at ${fmt(leg.x, leg.z)}`);
        continue;
      }
      let prev: number | null = null;
      for (let k = 1; k < leg.pts.length; k++) {
        const a = leg.pts[k - 1], b = leg.pts[k];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
        for (let j = 0; j <= n; j++) {
          const x = a.x + ((b.x - a.x) * j) / n, z = a.z + ((b.z - a.z) * j) / n;
          const y = groundAt(t, x, z);
          if (prev !== null && Math.abs(y - prev) > 0.3) fail(w, `${RESIDENTS[i].name}'s walk steps ${(y - prev).toFixed(2)} m at ${fmt(x, z)}`);
          prev = y;
        }
      }
    }
  });

  // 6. ambient residents walk the sidewalk round their block
  if (g.blocks.length) {
    for (const b of g.blocks) for (let k = 0; k < 64; k++) {
      const p = aroundRect(sidewalkLoop(b, g.grid), k / 64);
      placed++;
      const zone = zoneAt(site, p.x, p.z);
      if (zone !== 'sidewalk' && zone !== 'corner') fail(w, `ambient resident path crosses ${zone} at ${fmt(p.x, p.z)}`);
    }
  }

  // 7. the club's dance floor in particular: a dancer on a tile stands on the tile
  const club = t.venues.find((v) => v.id === 'club');
  if (club) {
    const c0 = Math.cos(club.rot), s0 = Math.sin(club.rot);
    const x = club.x + DANCE_FLOOR.x * c0 + DANCE_FLOOR.z * s0, z = club.z - DANCE_FLOOR.x * s0 + DANCE_FLOOR.z * c0;
    const { lx, lz } = toVenueFrame(club, x, z);
    if (Math.abs(lx - DANCE_FLOOR.x) > 1e-6 || Math.abs(lz - DANCE_FLOOR.z) > 1e-6) fail(w, 'venue frame round trip is off');
    if (groundAt(t, x, z) !== DANCE_FLOOR.top) fail(w, `dance floor centre gives ${groundAt(t, x, z)}, tiles are at ${DANCE_FLOOR.top}`);
  }
  // 8. the airport terminal hall: travellers stand on its floor
  if (t.hasCity) {
    const tr = t.airport.terminal;
    const y = groundAt(t, tr.x, tr.z);
    if (y !== TERMINAL_FLOOR) fail(w, `terminal floor gives ${y}, the hall floor is at ${TERMINAL_FLOOR}`);
  }
  // 9. parked planes: on the apron (or the hangar floor), clear of each other, the flights stands, the taxiway,
  // the runway and the terminal, in every country's line-up
  if (t.hasCity) {
    const ap = t.airport;
    const apron = groundAt(t, ap.apron.x, ap.apron.z);
    const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
    // the painted boxes round the two flights stands (AirportStand.tsx), with room for the plane that parks there
    const stands = [privateStand(ap), arrivalStand(ap)].map((p) => ({ x: p.x, z: p.z, w: 16, d: Math.max(14, PLANE_SIZE.airliner.span) }));
    for (const home of COUNTRY_IDS) {
      const spots = airportSpots(ap, home);
      const planes = [...spots.gates, ...spots.others];
      const boxes = planes.map(footprint);
      boxes.push({ x: spots.heliPad.x, z: spots.heliPad.z, w: PLANE_SIZE.heli.span, d: PLANE_SIZE.heli.span });
      boxes.forEach((b, i) => {
        const at = `${home}: parked plane ${i} at ${fmt(b.x, b.z)}`;
        placed++;
        for (const [dx, dz] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const y = groundAt(t, b.x + (dx * (b.w - 1)) / 2, b.z + (dz * (b.d - 1)) / 2);
          if (y !== apron && y !== HANGAR_FLOOR) fail(w, `${at} has a corner off the apron (ground ${y})`);
        }
        for (let j = i + 1; j < boxes.length; j++) if (overlaps(b, boxes[j])) fail(w, `${at} overlaps parked plane ${j}`);
        stands.forEach((s, k) => overlaps(b, s) && fail(w, `${at} is on the ${k ? 'arrival' : 'private'} stand`));
        for (const r of [ap.taxiway, ap.runway, ap.terminal, ...taxiLinks(ap)]) if (overlaps(b, r)) fail(w, `${at} overlaps the taxiway, runway or terminal`);
      });
    }
  }
  return placed;
}

let total = 0;
for (const c of CASES) {
  const before = problems.length;
  const n = check(c);
  total += n;
  console.log(`${problems.length === before ? 'ok  ' : 'FAIL'} @${c.handle}: ${n} placed things checked${problems.length > before ? `, ${problems.length - before} problems` : ''}`);
}
if (problems.length) {
  console.log(`\n${problems.length} problems:`);
  for (const p of problems.slice(0, Number(process.env.SHOW ?? 80))) console.log('  ' + p);
  if (problems.length > 80) console.log(`  … and ${problems.length - 80} more`);
  process.exit(1);
}
console.log(`\nworld check passed: ${total} placements across ${CASES.length} worlds`);
