'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { PALETTES, type Biome } from '@/lib/world/biomes';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import {
  DISTRICTS, RING_ROAD_W, RING_SLOTS, airportLayout, along, billboardSpots, onLand, ringRoadRadius, slotAngle, type Rect,
} from '@/lib/world/layout';
import { COUNTRIES } from '@/lib/world/countries';
import { districtName, landmarkSpot, themeOf, themedPalette } from '@/lib/world/cityThemes';
import { TravelPicker } from './TravelPicker';
import { etaLabel } from './travel';

// The city map: districts, roads, the lagoon and the airport, venue pins, neighbours and you.
// Drag to pan, scroll or pinch to zoom. Tap a pin for its sheet, or tap anywhere on land to ride there.

const ROOF = ['#C0392B', '#E67E22', '#6B7280', '#8A96A8'];
const ASPHALT = '#3E434C';
type Filters = { venues: boolean; neighbours: boolean; billboards: boolean };
type View = { cx: number; cz: number; s: number };

export function CityMap() {
  const open = useWorld((s) => s.mapOpen);
  const model = useWorld((s) => s.model);
  const country = useWorld((s) => s.country);
  const logo = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const i = new Image();
    i.src = COUNTRIES[country].logo;
    return i;
  }, [country]);
  const logoRef = useRef(logo);
  logoRef.current = logo;
  const setMapOpen = useWorld((s) => s.setMapOpen);
  const selectVenue = useWorld((s) => s.selectVenue);
  const selectPeer = useWorld((s) => s.selectPeer);
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const [filters, setFilters] = useState<Filters>({ venues: true, neighbours: true, billboards: true });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [pin, setPin] = useState<{ x: number; z: number } | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const g = model?.geometry ?? null;
  const layout = useMemo(() => {
    if (!g) return null;
    const ap = airportLayout(g.contentRadius, g.boundaryRadius);
    return { ap, venues: placeVenues(g.contentRadius, g.boundaryRadius, country), boards: billboardSpots(g.contentRadius, g.boundaryRadius), rr: ringRoadRadius(g.contentRadius) };
  }, [g, country]);

  const fit = () => {
    const c = ref.current;
    if (!c || !g || !layout) return;
    const R = g.boundaryRadius;
    // the whole city, airport island included, so a first look shows everywhere you can go
    const x0 = -R - 4, x1 = layout.ap.island.x + layout.ap.island.w / 2 + 4, z0 = -R - 4, z1 = R + 4;
    const s = Math.min(c.clientWidth / (x1 - x0), c.clientHeight / (z1 - z0));
    view.current = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, s };
  };

  useEffect(() => {
    if (!open) {
      setPin(null);
      return;
    }
    fit();
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layout]);

  const draw = () => {
    const c = ref.current;
    const v = view.current;
    if (!c || !g || !layout || !v || !model) return;
    const st = useWorld.getState();
    const f = filtersRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = themedPalette(PALETTES[(model.biome as Biome) in PALETTES ? (model.biome as Biome) : 'meadow'], st.country);
    const theme = themeOf(st.country);
    const s = v.s;
    const sx = (x: number) => W / 2 + (x - v.cx) * s, sz = (z: number) => H / 2 + (z - v.cz) * s;
    const rect = (r: Rect, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(sx(r.x - r.w / 2), sz(r.z - r.d / 2), r.w * s, r.d * s);
    };
    const R = g.boundaryRadius;
    const { ap, rr } = layout;

    // water, with a few soft wave lines
    ctx.fillStyle = pal.water;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      ctx.arc(sx(0), sz(0), (R + k * 14) * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // the country's landmark on its islet in the lagoon
    const lm = landmarkSpot(R);
    ctx.fillStyle = pal.sand;
    ctx.beginPath();
    ctx.arc(sx(lm.x), sz(lm.z), lm.r * s, 0, Math.PI * 2);
    ctx.fill();
    // the coin's real logo stands on it
    const li = logoRef.current;
    const ls = lm.r * 1.3 * s;
    ctx.fillStyle = COUNTRIES[theme.country].theme.ink;
    ctx.beginPath();
    ctx.arc(sx(lm.x), sz(lm.z), lm.r * 0.85 * s, 0, Math.PI * 2);
    ctx.fill();
    if (li?.complete && li.naturalWidth) ctx.drawImage(li, sx(lm.x) - ls / 2, sz(lm.z) - ls / 2, ls, ls);
    // airport island and bridge
    rect({ ...ap.island, w: ap.island.w + 2, d: ap.island.d + 2 }, pal.sand);
    rect(ap.island, pal.lush);
    rect(ap.bridge, '#9AA0A8');
    rect({ ...ap.bridge, d: ap.bridge.d - 2 }, ASPHALT);
    // mainland with a beach rim
    ctx.fillStyle = pal.sand;
    ctx.beginPath();
    ctx.arc(sx(0), sz(0), (R + 1.5) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.outside === 'lush' ? pal.lush : g.outside === 'dry' ? pal.dry : pal.sand;
    ctx.beginPath();
    ctx.arc(sx(0), sz(0), R * s, 0, Math.PI * 2);
    ctx.fill();
    const hasCity = g.structures.length > 0;
    // district wedges
    if (hasCity) {
      const half = Math.PI / RING_SLOTS;
      for (const d of DISTRICTS) {
        const a0 = slotAngle(d.slots[0]) - half, a1 = slotAngle(d.slots[d.slots.length - 1]) + half;
        ctx.fillStyle = d.color + '2A';
        ctx.beginPath();
        ctx.arc(sx(0), sz(0), (R - 0.5) * s, a0, a1);
        ctx.arc(sx(0), sz(0), (rr + RING_ROAD_W / 2) * s, a1, a0, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    // the post grid
    const { K, pitchX, pitchZ, blockW, blockD, sidewalk, road } = g.grid;
    if (hasCity) {
      ctx.fillStyle = ASPHALT;
      ctx.fillRect(sx(-(K + 0.5) * pitchX - road / 2), sz(-(K + 0.5) * pitchZ - road / 2), ((2 * K + 1) * pitchX + road) * s, ((2 * K + 1) * pitchZ + road) * s);
    }
    for (const b of g.blocks) {
      ctx.fillStyle = '#B9BCC2';
      ctx.fillRect(sx(b.x - blockW / 2 - sidewalk), sz(b.z - blockD / 2 - sidewalk), (blockW + 2 * sidewalk) * s, (blockD + 2 * sidewalk) * s);
      ctx.fillStyle = b.cls === 'lush' ? pal.lush : b.cls === 'dry' ? pal.dry : pal.sand;
      ctx.fillRect(sx(b.x - blockW / 2), sz(b.z - blockD / 2), blockW * s, blockD * s);
    }
    for (const p of g.structures) {
      if (p.kind === 'lantern' || p.segment > 0) continue;
      ctx.fillStyle = p.isLandmark ? '#FFD089' : ROOF[p.roof % ROOF.length];
      ctx.fillRect(sx(p.x - p.width / 2), sz(p.z - p.depth / 2), Math.max(1.5, p.width * s), Math.max(1.5, p.depth * s));
    }
    if (hasCity) {
      // ring road, spurs, airport road
      ctx.strokeStyle = '#B9BCC2';
      ctx.lineWidth = (RING_ROAD_W + 1.2) * s;
      ctx.beginPath();
      ctx.arc(sx(0), sz(0), rr * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = ASPHALT;
      ctx.lineWidth = RING_ROAD_W * s;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(233,237,242,0.7)';
      ctx.lineWidth = Math.max(0.6, 0.25 * s);
      ctx.setLineDash([2.2 * s, 2.8 * s]);
      ctx.stroke();
      ctx.setLineDash([]);
      const halfW = ((2 * K + 1) * pitchX + road) / 2, halfD = ((2 * K + 1) * pitchZ + road) / 2;
      const inner = rr - RING_ROAD_W / 2 + 0.5;
      ctx.fillStyle = ASPHALT;
      if (inner > halfD) {
        rect({ x: 0.5 * pitchX, z: -(halfD + inner) / 2, w: road, d: inner - halfD }, ASPHALT);
        rect({ x: -0.5 * pitchX, z: (halfD + inner) / 2, w: road, d: inner - halfD }, ASPHALT);
      }
      if (inner > halfW) {
        rect({ x: -(halfW + inner) / 2, z: -0.5 * pitchZ, w: inner - halfW, d: road }, ASPHALT);
        rect({ x: (halfW + inner) / 2, z: 0.5 * pitchZ, w: inner - halfW, d: road }, ASPHALT);
      }
      rect(ap.road, ASPHALT);
      // the airport
      rect(ap.islandRoad, ASPHALT);
      rect(ap.apron, '#C9CCD1');
      rect(ap.taxiway, '#555B63');
      for (const e of [-1, 1]) rect({ x: (ap.taxiway.x + ap.runway.x) / 2, z: e * (ap.runway.d / 2 - 8), w: ap.runway.x - ap.taxiway.x, d: 5 }, '#555B63');
      rect(ap.runway, '#2F3338');
      ctx.fillStyle = '#F2F4F7';
      for (let z = -ap.runway.d / 2 + 16; z < ap.runway.d / 2 - 16; z += 7) ctx.fillRect(sx(ap.runway.x - 0.2), sz(z), Math.max(1, 0.4 * s), 3.5 * s);
      for (const e of [-1, 1]) for (let k = -3; k <= 3; k++) if (k) ctx.fillRect(sx(ap.runway.x + k * 1.2 - 0.3), sz(e * (ap.runway.d / 2 - 3.5) - 2.25), Math.max(1, 0.6 * s), 4.5 * s);
      rect(ap.carPark, '#4A4F57');
      rect(ap.terminal, '#8FB8D8');
      rect({ ...ap.terminal, w: ap.terminal.w + 2, d: 1.2, z: ap.terminal.z - ap.terminal.d / 2 }, '#F4F6F8');
      rect(ap.hangar, '#B7BEC7');
      ctx.fillStyle = '#E8E4DC';
      ctx.beginPath();
      ctx.arc(sx(ap.tower.x), sz(ap.tower.z), Math.max(3, ap.tower.r * 1.8 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.max(12, 6 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const gt of ap.gates) {
        ctx.save();
        ctx.translate(sx(gt.x), sz(gt.z));
        ctx.rotate(-Math.PI / 4 - Math.PI / 2);
        ctx.fillText('✈️', 0, 0);
        ctx.restore();
      }
      // billboards
      if (f.billboards) {
        for (const b of layout.boards) {
          ctx.save();
          ctx.translate(sx(b.x), sz(b.z));
          ctx.rotate(-b.rot);
          ctx.fillStyle = '#1B1E24';
          ctx.fillRect(-5.3 * s, -0.6 * s, 10.6 * s, Math.max(2, 1.2 * s));
          ctx.fillStyle = '#FFD166';
          ctx.fillRect(-5 * s, -0.3 * s, 10 * s, Math.max(1, 0.6 * s));
          ctx.restore();
        }
      }
      // venue plazas
      for (const vn of layout.venues) {
        if (vn.custom) continue;
        ctx.save();
        ctx.translate(sx(vn.x), sz(vn.z));
        ctx.rotate(-vn.rot);
        ctx.fillStyle = '#B9BCC2';
        ctx.fillRect(((-vn.w - 6) / 2) * s, ((-vn.d - 6) / 2) * s, (vn.w + 6) * s, (vn.d + 6) * s);
        ctx.fillStyle = '#E8DCC8';
        ctx.fillRect((-vn.w / 2) * s, (-vn.d / 2) * s, vn.w * s, vn.d * s);
        ctx.fillStyle = vn.color;
        ctx.fillRect((-vn.w / 2) * s, (-vn.d / 2) * s, vn.w * s, 1.2 * s);
        ctx.restore();
      }
    }
    // labels
    const label = (text: string, x: number, z: number, size: number, rot = 0, alpha = 0.92, align: CanvasTextAlign = 'center') => {
      ctx.save();
      ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(size * 0.22)}px`;
      let px = sx(x);
      if (!rot) {
        // keep flat labels on screen on narrow phones
        const w = ctx.measureText(text).width;
        const left = align === 'right' ? px - w : align === 'center' ? px - w / 2 : px;
        px = Math.max(8, Math.min(W - w - 8, left));
        // pushed far from its place (off the edge of a phone screen): leave it out until panned into view
        if (Math.abs(px - left) > 30) {
          ctx.restore();
          return;
        }
        align = 'left';
      }
      ctx.translate(px, sz(z));
      ctx.rotate(rot);
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      if (!rot) {
        // a soft pill behind flat labels keeps them legible over pins and roads
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(11,14,20,0.35)';
        ctx.beginPath();
        ctx.roundRect(-6, -size * 0.8, w + 8, size * 1.6, size * 0.8);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    const fs = Math.max(10, Math.min(18, 2.6 * s));
    if (hasCity) {
      // on the water just off each district's coast, aligned away from the land
      for (const d of DISTRICTS) {
        const a = slotAngle(d.slots[Math.floor(d.slots.length / 2)] - (d.slots.length % 2 ? 0 : 0.5));
        const c = Math.cos(a), sn = Math.sin(a);
        const align: CanvasTextAlign = c < -0.3 ? 'right' : c > 0.3 ? 'left' : 'center';
        const r = R + (align === 'center' ? 4 + 12 / s : 3);
        label(districtName(d.id, d.name, st.country).toUpperCase(), c * r, sn * r, fs, 0, 0.92, align);
      }
      label('DOWNTOWN', 0, -((2 * K + 1) * pitchZ + road) / 2 + 8 / s + 2, fs, 0, 0.75);
      label('AIRPORT', ap.island.x + 4, -ap.island.d / 2 + 6, fs);
      label(theme.landmark.name.toUpperCase(), lm.x - lm.r - 2, lm.z, fs * 0.8, -Math.PI / 2, 0.85);
    }
    label('THE LAGOON', R + 14, -ap.island.d / 4, fs, Math.PI / 2, 0.7);
    // trip route
    if (st.trip) {
      const t = (performance.now() - st.trip.startedAt) / 1000 / st.trip.duration;
      ctx.strokeStyle = '#1D9BF0';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      const here = along(st.trip.path, t);
      ctx.moveTo(sx(here.x), sz(here.z));
      let acc = 0;
      const total = st.trip.path.reduce((sum, q, i, arr) => (i ? sum + Math.hypot(q.x - arr[i - 1].x, q.z - arr[i - 1].z) : 0), 0);
      for (let i = 1; i < st.trip.path.length; i++) {
        const a = st.trip.path[i - 1], b = st.trip.path[i];
        acc += Math.hypot(b.x - a.x, b.z - a.z);
        if (acc / total > t) ctx.lineTo(sx(b.x), sz(b.z));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // venue pins
    if (f.venues && hasCity) {
      // pins first, then a name under each on a pill. Names never cover a pin or another name; zoomed out,
      // the ones that would wait until you zoom in.
      const pins = layout.venues.map((vn) => ({ vn, px: sx(vn.x), pz: sz(vn.z) }));
      const taken = pins.map(({ px, pz }) => ({ x0: px - 14, y0: pz - 14, x1: px + 14, y1: pz + 14 }));
      for (const { vn, px, pz } of pins) {
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, pz, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = vn.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.font = '15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(vn.emoji, px, pz + 1);
      }
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { vn, px, pz } of pins) {
        const tw = ctx.measureText(vn.name).width;
        const box = { x0: px - tw / 2 - 5, y0: pz + 16, x1: px + tw / 2 + 5, y1: pz + 31 };
        if (taken.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
        taken.push(box);
        ctx.fillStyle = 'rgba(11,14,20,0.72)';
        ctx.beginPath();
        ctx.roundRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 7);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(vn.name, px, pz + 24);
      }
    }
    // neighbours
    if (f.neighbours) {
      for (const p of Object.values(st.peers)) {
        ctx.fillStyle = '#8FC57A';
        ctx.beginPath();
        ctx.arc(sx(p.x), sz(p.z), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(`@${p.handle}`, sx(p.x), sz(p.z) - 10);
      }
    }
    // dropped pin
    const dp = pinRef.current;
    if (dp) {
      ctx.font = '26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('📍', sx(dp.x), sz(dp.z) + 3);
    }
    // you
    const me = st.playerPos;
    const pulse = 9 + Math.sin(performance.now() / 300) * 3;
    ctx.fillStyle = 'rgba(29,155,240,0.25)';
    ctx.beginPath();
    ctx.arc(sx(me.x), sz(me.z), pulse + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1D9BF0';
    ctx.beginPath();
    ctx.arc(sx(me.x), sz(me.z), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText('You', sx(me.x), sz(me.z) + 18);
    ctx.shadowBlur = 0;
  };

  // ---- input: drag to pan, wheel / pinch to zoom, tap to pick
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef<number | null>(null);
  const zoomAt = (factor: number, px: number, py: number) => {
    const c = ref.current, v = view.current;
    if (!c || !v) return;
    const W = c.clientWidth, H = c.clientHeight;
    const wx = v.cx + (px - W / 2) / v.s, wz = v.cz + (py - H / 2) / v.s;
    const s = Math.max(0.8, Math.min(14, v.s * factor));
    view.current = { s, cx: wx - (px - W / 2) / s, cz: wz - (py - H / 2) / s };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = ref.current!.getBoundingClientRect();
      zoomAt(d / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = d;
      moved.current += 10;
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    view.current = { ...view.current, cx: view.current.cx - dx / view.current.s, cz: view.current.cz - dy / view.current.s };
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (moved.current > 6 || !g || !layout || !view.current) return;
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const v = view.current;
    const W = c.clientWidth, H = c.clientHeight;
    const toScreen = (x: number, z: number) => ({ x: W / 2 + (x - v.cx) * v.s, y: H / 2 + (z - v.cz) * v.s });
    if (filters.venues && g.structures.length) {
      const hit = layout.venues.find((vn) => {
        const p = toScreen(vn.x, vn.z);
        return Math.hypot(p.x - px, p.y - py) < 18;
      });
      if (hit) return openVenue(hit);
    }
    if (filters.neighbours) {
      const peer = Object.values(useWorld.getState().peers).find((p) => {
        const q = toScreen(p.x, p.z);
        return Math.hypot(q.x - px, q.y - py) < 12;
      });
      if (peer) {
        setMapOpen(false);
        selectPeer(peer);
        return;
      }
    }
    const wx = v.cx + (px - W / 2) / v.s, wz = v.cz + (py - H / 2) / v.s;
    if (onLand(wx, wz, g.contentRadius, g.boundaryRadius, layout.ap)) setPin({ x: wx, z: wz });
    else setPin(null);
  };
  const openVenue = (vn: PlacedVenue) => {
    setMapOpen(false);
    selectVenue(vn);
  };

  if (!open || !model) return null;
  const chip = (key: keyof Filters, label: string) => (
    <button
      key={key}
      onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm ${filters[key] ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
    >
      {label}
    </button>
  );
  const jump = (x: number, z: number, s = 4) => {
    view.current = { cx: x, cz: z, s };
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex flex-col bg-black/40 backdrop-blur-sm">
      <div className="flex items-start gap-2 px-3 pt-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 rounded-3xl chrome p-1.5 sm:flex-nowrap sm:overflow-x-auto sm:rounded-full">
          <span className="hidden shrink-0 items-center whitespace-nowrap px-2 text-sm font-semibold sm:flex">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COUNTRIES[country].logo} alt="" className="mr-1.5 h-4 w-4" />
            {COUNTRIES[country].capital}</span>
          {chip('venues', '🏙️ Venues')}
          {chip('neighbours', '🧍 Neighbours')}
          {chip('billboards', '🪧 Billboards')}
          <button className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm text-white/80 hover:bg-white/20" onClick={() => layout && jump(layout.ap.island.x, 0, 4)}>
            ✈️ Airport
          </button>
          <button className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm text-white/80 hover:bg-white/20" onClick={() => jump(useWorld.getState().playerPos.x, useWorld.getState().playerPos.z, 5)}>
            📍 Me
          </button>
          <button className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm text-white/80 hover:bg-white/20" onClick={fit}>
            ⤢ All
          </button>
        </div>
        <button className="rounded-full chrome px-3 py-2 text-sm hover:bg-white/10" onClick={() => setMapOpen(false)} aria-label="Close map">
          ✕
        </button>
      </div>
      <div className="relative m-3 flex-1 overflow-hidden rounded-3xl">
        <canvas
          ref={ref}
          className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => {
            const r = ref.current!.getBoundingClientRect();
            zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
          }}
        />
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          {[
            ['+', 1.35],
            ['−', 1 / 1.35],
          ].map(([l, k]) => (
            <button
              key={l as string}
              className="h-9 w-9 rounded-full chrome text-lg font-bold hover:bg-white/10"
              onClick={() => ref.current && zoomAt(k as number, ref.current.clientWidth / 2, ref.current.clientHeight / 2)}
            >
              {l}
            </button>
          ))}
        </div>
        {!pin && <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full chrome px-3 py-1 text-xs text-white/70">Tap a pin to visit · tap anywhere to ride there</p>}
        {pin && (
          <div className="absolute bottom-3 left-1/2 w-[min(94vw,580px)] -translate-x-1/2 rounded-3xl chrome p-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">📍 Dropped pin</div>
              <button className="rounded-full px-2 py-0.5 hover:bg-white/10" onClick={() => setPin(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <TravelPicker to={pin} label="a dropped pin" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown while you ride: what, where, and how long is left. */
export function TripBanner() {
  const trip = useWorld((s) => s.trip);
  // on a job shift the shift panel says where you are going
  const onShift = useWorld((s) => !!s.shift);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!trip) return;
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [trip]);
  if (!trip || onShift) return null;
  const done = Math.min(1, (performance.now() - trip.startedAt) / 1000 / trip.duration);
  const left = Math.max(0, trip.duration * (1 - done));
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(90vw,360px)] -translate-x-1/2 rounded-2xl chrome px-4 py-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {trip.emoji} On the way to {trip.label}
        </span>
        <span className="num text-white/60">{etaLabel(left)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-x" style={{ width: `${done * 100}%` }} />
      </div>
    </div>
  );
}
