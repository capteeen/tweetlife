import { ImageResponse } from 'next/og';
import { loadWorldModelCached } from '@/lib/world/load';
import { LANTERN, PALETTES, type Biome } from '@/lib/world/biomes';

export const runtime = 'nodejs';
export const alt = 'A city built from an X account';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// OG image: a top-down map of this world — the real road grid, blocks coloured by posting cadence,
// every building at its real position and footprint with its roof colour — plus handle, post count and
// the landmark. Posting a world link looks like posting a map.

const ASPHALT = '#3E434C';
const CURB = '#B9BCC2';
const ROOF = ['#C0392B', '#E67E22', '#6B7280', '#8A96A8'];

export default async function Image({ params }: { params: { handle: string } }) {
  const model = await loadWorldModelCached(params.handle);
  if (!model) {
    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0E14', color: '#fff', fontSize: 40 }}>
        No world for @{params.handle}
      </div>,
      size,
    );
  }
  const g = model.geometry;
  const pal = PALETTES[(model.biome as Biome) in PALETTES ? (model.biome as Biome) : 'meadow'];
  const W = size.width, H = size.height;
  const { K, pitchX, pitchZ, blockW, blockD, sidewalk } = g.grid;
  const cityW = (2 * K + 1) * pitchX, cityD = (2 * K + 1) * pitchZ;
  // fit the city (plus a margin of countryside) into the frame; the map is centred, north up
  const scale = Math.min(W / (cityW + 40), H / (cityD + 40));
  const sx = (x: number) => W / 2 + x * scale;
  const sz = (z: number) => H / 2 + z * scale;
  const cls = (c: 'lush' | 'dry' | 'sand') => (c === 'lush' ? pal.lush : c === 'dry' ? pal.dry : pal.sand);
  const buildings = g.structures.filter((s) => s.kind !== 'lantern' && s.segment === 0).slice(0, 700);
  const lm = g.structures.find((s) => s.isLandmark);
  const subtitle = `${model.structureCount} posts · ${g.blocks.length} blocks · ${model.ingestState === 'building' ? 'still building' : 'built from the real timeline'}`;
  const quote = lm?.text ? `“${lm.text.slice(0, 100)}${lm.text.length > 100 ? '…' : ''}”` : null;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: cls(g.outside), fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', display: 'flex', left: sx(-cityW / 2 - 3), top: sz(-cityD / 2 - 3), width: (cityW + 6) * scale, height: (cityD + 6) * scale, background: ASPHALT }} />
        {g.blocks.map((b, i) => (
          <div key={`s${i}`} style={{ position: 'absolute', display: 'flex', left: sx(b.x - blockW / 2 - sidewalk), top: sz(b.z - blockD / 2 - sidewalk), width: (blockW + 2 * sidewalk) * scale, height: (blockD + 2 * sidewalk) * scale, background: CURB }} />
        ))}
        {g.blocks.map((b, i) => (
          <div key={`b${i}`} style={{ position: 'absolute', display: 'flex', left: sx(b.x - blockW / 2), top: sz(b.z - blockD / 2), width: blockW * scale, height: blockD * scale, background: cls(b.cls) }} />
        ))}
        {buildings.map((s, i) => (
          <div
            key={`h${i}`}
            style={{
              position: 'absolute', display: 'flex', left: sx(s.x - s.width / 2), top: sz(s.z - s.depth / 2), width: Math.max(2, s.width * scale), height: Math.max(2, s.depth * scale),
              background: s.isLandmark ? LANTERN : ROOF[s.roof % ROOF.length],
              ...(s.isLandmark ? { boxShadow: `0 0 24px 8px ${LANTERN}` } : {}),
            }}
          />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 210, display: 'flex', background: 'linear-gradient(180deg, rgba(11,14,20,0) 0%, rgba(11,14,20,0.78) 55%, rgba(11,14,20,0.95) 100%)' }} />
        <div style={{ position: 'absolute', left: 56, bottom: 40, display: 'flex', flexDirection: 'column', color: '#fff' }}>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>{`@${model.handle}'s world`}</div>
          <div style={{ display: 'flex', fontSize: 25, opacity: 0.85, marginTop: 4 }}>{subtitle}</div>
          {quote ? <div style={{ display: 'flex', fontSize: 21, opacity: 0.7, marginTop: 8, maxWidth: 900 }}>{quote}</div> : null}
        </div>
        <div style={{ position: 'absolute', right: 56, bottom: 44, display: 'flex', color: '#fff', opacity: 0.8, fontSize: 22 }}>tweetlife · unofficial</div>
      </div>
    ),
    size,
  );
}
