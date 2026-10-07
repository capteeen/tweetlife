import { ImageResponse } from 'next/og';
import { loadWorldModelCached } from '@/lib/world/load';
import { STONE, LANTERN, PALETTES, type Biome } from '@/lib/world/biomes';
import { skyColors } from '@/lib/world/sky';

export const runtime = 'nodejs';
export const alt = 'A world built from an X account';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// OG image: the real skyline of this world — every bar is a real structure at its real position and height —
// with handle, structure count and the landmark. Posting a world link looks like posting a photograph.

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
  const { horizon, zenith } = skyColors(g.skyT);
  const pal = PALETTES[(model.biome as Biome) in PALETTES ? (model.biome as Biome) : 'meadow'];
  const W = size.width, H = size.height, horizonY = 420;
  // Orthographic side view: screen x from world x, depth from z (back-to-front), bar height from structure height.
  const R = Math.max(10, g.boundaryRadius);
  const sorted = [...g.structures].filter((s) => s.kind !== 'lantern').sort((a, b) => a.z - b.z);
  const scaleX = (W * 0.9) / (2 * R);
  const bars = sorted.slice(0, 700).map((s) => {
    const depth = (s.z + R) / (2 * R); // 0 back, 1 front
    const x = W / 2 + s.x * scaleX;
    const h = Math.max(6, (s.y + s.height) * 9 * (0.75 + depth * 0.45));
    const w = Math.max(4, s.width * 9 * (0.75 + depth * 0.45));
    const y = horizonY - 40 + depth * 80 - h;
    const base = s.isLandmark ? LANTERN : STONE[Math.min(2, Math.floor((1 - depth) * 3))];
    return { x: x - w / 2, y, w, h, color: base, glow: s.glow, landmark: s.isLandmark };
  });
  const lm = g.structures.find((s) => s.isLandmark);
  const subtitle = `${model.structureCount} posts as structures · ${model.ingestState === 'building' ? 'still building' : 'built from the real timeline'}`;
  const quote = lm?.text ? `“${lm.text.slice(0, 110)}${lm.text.length > 110 ? '…' : ''}”` : null;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: `linear-gradient(180deg, ${rgb(zenith)} 0%, ${rgb(horizon)} 68%, ${pal.sand} 68.2%, ${pal.lush} 100%)`, fontFamily: 'Inter, sans-serif' }}>
        {bars.map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, background: b.color, opacity: 0.92, borderRadius: 1, display: 'flex',
              ...(b.landmark ? { boxShadow: `0 0 40px 12px ${LANTERN}` } : b.glow > 0.6 ? { boxShadow: `0 0 ${Math.round(b.glow * 18)}px ${LANTERN}66` } : {}),
            }}
          />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: horizonY - 60, height: H - horizonY + 60, display: 'flex', background: 'linear-gradient(180deg, rgba(11,14,20,0) 0%, rgba(11,14,20,0.55) 35%, rgba(11,14,20,0.92) 100%)' }} />
        <div style={{ position: 'absolute', left: 56, bottom: 44, display: 'flex', flexDirection: 'column', color: '#fff' }}>
          <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, letterSpacing: -1 }}>{`@${model.handle}'s world`}</div>
          <div style={{ display: 'flex', fontSize: 26, opacity: 0.85, marginTop: 6 }}>{subtitle}</div>
          {quote ? <div style={{ display: 'flex', fontSize: 22, opacity: 0.7, marginTop: 10, maxWidth: 900 }}>{quote}</div> : null}
        </div>
        <div style={{ position: 'absolute', right: 56, bottom: 48, display: 'flex', color: '#fff', opacity: 0.8, fontSize: 22 }}>tweetlife · unofficial</div>
      </div>
    ),
    size,
  );
}

function rgb(c: { r: number; g: number; b: number }) {
  return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

