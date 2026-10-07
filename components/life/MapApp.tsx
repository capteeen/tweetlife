'use client';
import { useEffect, useRef } from 'react';
import { useWorld } from '@/components/world/store';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { placeVenues } from '@/lib/life/venues';

// Top-down map of the city: blocks, buildings, venues, you, everyone else. Tap to walk there.
const ROOF = ['#C0392B', '#E67E22', '#6B7280', '#8A96A8'];

export function MapApp() {
  const model = useWorld((s) => s.model);
  const playerPos = useWorld((s) => s.playerPos);
  const peers = useWorld((s) => s.peers);
  const setTeleport = useWorld((s) => s.setTeleport);
  const closePhone = useWorld((s) => s.closePhone);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || !model) return;
    const g = model.geometry;
    const pal = PALETTES[(model.biome as Biome) in PALETTES ? (model.biome as Biome) : 'meadow'];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const R = g.boundaryRadius;
    const s = Math.min(W, H) / (2 * R + 10);
    const sx = (x: number) => W / 2 + x * s, sz = (z: number) => H / 2 + z * s;
    ctx.fillStyle = pal.water;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g.outside === 'lush' ? pal.lush : g.outside === 'dry' ? pal.dry : pal.sand;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R * s, 0, Math.PI * 2);
    ctx.fill();
    const { K, pitchX, pitchZ, blockW, blockD, sidewalk } = g.grid;
    if (g.blocks.length) {
      ctx.fillStyle = '#3E434C';
      ctx.fillRect(sx(-(K + 0.5) * pitchX), sz(-(K + 0.5) * pitchZ), (2 * K + 1) * pitchX * s, (2 * K + 1) * pitchZ * s);
    }
    for (const b of g.blocks) {
      ctx.fillStyle = '#B9BCC2';
      ctx.fillRect(sx(b.x - blockW / 2 - sidewalk), sz(b.z - blockD / 2 - sidewalk), (blockW + 2 * sidewalk) * s, (blockD + 2 * sidewalk) * s);
      ctx.fillStyle = b.cls === 'lush' ? pal.lush : b.cls === 'dry' ? pal.dry : pal.sand;
      ctx.fillRect(sx(b.x - blockW / 2), sz(b.z - blockD / 2), blockW * s, blockD * s);
    }
    for (const st of g.structures) {
      if (st.kind === 'lantern' || st.segment > 0) continue;
      ctx.fillStyle = st.isLandmark ? '#FFD089' : ROOF[st.roof % ROOF.length];
      ctx.fillRect(sx(st.x - st.width / 2), sz(st.z - st.depth / 2), Math.max(1.5, st.width * s), Math.max(1.5, st.depth * s));
    }
    ctx.font = `${Math.max(10, 14)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    for (const v of placeVenues(g.contentRadius)) {
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(sx(v.x), sz(v.z), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(v.emoji, sx(v.x), sz(v.z) + 5);
    }
    for (const p of Object.values(peers)) {
      ctx.fillStyle = '#8FC57A';
      ctx.beginPath();
      ctx.arc(sx(p.x), sz(p.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1D9BF0';
    ctx.beginPath();
    ctx.arc(sx(playerPos.x), sz(playerPos.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [model, playerPos, peers]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c || !model) return;
    const r = c.getBoundingClientRect();
    const W = r.width, H = r.height;
    const R = model.geometry.boundaryRadius;
    const s = Math.min(W, H) / (2 * R + 10);
    const x = (e.clientX - r.left - W / 2) / s, z = (e.clientY - r.top - H / 2) / s;
    if (Math.hypot(x, z) > R - 2) return;
    setTeleport({ x, z });
    closePhone();
  };

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs text-white/60">Oldest posts at the centre, newest at the edge. Coloured dots are venues. Tap anywhere to walk there.</p>
      <canvas ref={ref} onClick={onClick} className="w-full flex-1 cursor-crosshair rounded-xl" style={{ minHeight: 320 }} />
    </div>
  );
}
