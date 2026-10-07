'use client';
import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { placeVenues } from '@/lib/life/venues';
import { play, stop, type Style } from '@/components/world/clubAudio';

// Music you hear as you get near the club or the lounge: louder at the door, full inside. Off until the page
// has had a tap or a key press (browsers block sound before that), and mutable.

const SOURCES: Record<string, Style> = { club: 'club', bar: 'lounge' };
const RANGE = 26;
const MUTE_KEY = 'tl-music-muted';

export function VenueMusic() {
  const model = useWorld((s) => s.model);
  const g = model?.geometry;
  const venues = useMemo(() => (g ? placeVenues(g.contentRadius, g.boundaryRadius).filter((v) => SOURCES[v.id]) : []), [g]);
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [at, setAt] = useState<{ name: string; emoji: string } | null>(null);

  useEffect(() => {
    const on = () => setUnlocked(true);
    window.addEventListener('pointerdown', on, { once: true });
    window.addEventListener('keydown', on, { once: true });
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, []);

  useEffect(() => {
    if (!venues.length) return;
    const t = setInterval(() => {
      const p = useWorld.getState().playerPos;
      let best: (typeof venues)[number] | null = null, bd = Infinity;
      for (const v of venues) {
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d < bd) (bd = d), (best = v);
      }
      const inside = best ? Math.max(best.w, best.d) / 2 : 0;
      const vol = best && bd < RANGE ? Math.min(1, 1 - (bd - inside) / (RANGE - inside)) : 0;
      setAt(vol > 0 && best ? { name: best.name, emoji: best.emoji } : null);
      if (vol > 0 && best && unlocked && !muted) play(SOURCES[best.id], vol);
      else stop();
    }, 250);
    return () => {
      clearInterval(t);
      stop();
    };
  }, [venues, unlocked, muted]);

  if (!at) return null;
  const toggle = () => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1');
      } catch {}
      return !m;
    });
  };
  return (
    <button
      className="pointer-events-auto absolute bottom-44 right-3 z-20 flex items-center gap-2 rounded-full chrome px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
      onClick={toggle}
    >
      <span className={muted ? '' : 'animate-pulse'}>{muted ? '🔇' : '🎵'}</span>
      {muted ? `Music off at ${at.name}` : unlocked ? `Playing at ${at.name}` : `Tap anywhere for music at ${at.name}`}
    </button>
  );
}
