'use client';
import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { placeVenues } from '@/lib/life/venues';
import { play, stop, type Style } from '@/components/world/clubAudio';
import { useSoundSettings } from '@/lib/audio/settings';
import { isAudioUnlocked, whenUnlocked } from '@/lib/audio/engine';
import { insideVenue, venueLocal } from '@/lib/audio/surfaces';
import { playerSound } from '@/lib/audio/state';
import { WALK_IN } from '@/lib/world/interiors';

// Music you hear as you get near the club or the lounge: muffled through the walls, clearer in front of the
// door, full inside. Off until the page has had a tap or a key press (browsers block sound before that), and
// it follows the game's sound settings (mute, master and music volume).

const SOURCES: Record<string, Style> = { club: 'club', bar: 'lounge' };
const RANGE = 34;

export function VenueMusic() {
  const model = useWorld((s) => s.model);
  const g = model?.geometry;
  const all = useMemo(() => (g ? placeVenues(g.contentRadius, g.boundaryRadius) : []), [g]);
  const venues = useMemo(() => all.filter((v) => SOURCES[v.id]), [all]);
  const [unlocked, setUnlocked] = useState(isAudioUnlocked);
  const muted = useSoundSettings((s) => s.muted);
  const toggleMuted = useSoundSettings((s) => s.toggleMuted);
  const [at, setAt] = useState<{ name: string; emoji: string } | null>(null);

  useEffect(() => whenUnlocked(() => setUnlocked(true)), []);

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
      if (vol > 0 && best && unlocked && !muted) {
        // inside: clear. Outside: the walls muffle it, less so standing in front of the open door.
        const sx = playerSound.x, sz = playerSound.z;
        const inV = insideVenue(all, sx, sz)?.id === best.id;
        const k = WALK_IN[best.id];
        const { lx, lz } = venueLocal(best, sx, sz);
        const facingDoor = k && lz > 0 && Math.abs(lx) < k.door / 2 + lz * 0.6 ? Math.max(0, 1 - (lz - k.d / 2) / 14) : 0;
        play(SOURCES[best.id], inV ? vol : vol * 0.8, inV ? 0 : 1 - facingDoor * 0.65);
      } else stop();
    }, 200);
    return () => {
      clearInterval(t);
      stop();
    };
  }, [venues, all, unlocked, muted]);

  if (!at) return null;
  return (
    <button
      className="pointer-events-auto absolute bottom-44 right-3 z-20 flex items-center gap-2 rounded-full chrome px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
      onClick={toggleMuted}
    >
      <span className={muted ? '' : 'animate-pulse'}>{muted ? '🔇' : '🎵'}</span>
      {muted ? `Sound off at ${at.name}` : unlocked ? `Playing at ${at.name}` : `Tap anywhere for music at ${at.name}`}
    </button>
  );
}
