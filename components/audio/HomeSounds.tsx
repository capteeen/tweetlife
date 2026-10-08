'use client';
import { useEffect } from 'react';
import { useHome, type Acting } from '@/components/home/store';
import { placementFor } from '@/components/home/poses';
import { furnitureById, type HomeView, type PowerState } from '@/lib/life/home';
import { Loop, type LoopKind } from '@/lib/audio/loops';
import { sfx, type SfxName } from '@/lib/audio/sfx';
import { play as playMusic, stop as stopMusic, type Style } from '@/components/world/clubAudio';
import { whenUnlocked } from '@/lib/audio/engine';
import { useSoundSettings } from '@/lib/audio/settings';

// The house: the mains hum while NEPA has the light on, the hum cutting out when it goes, the generator
// chugging when it's fuelled, the fan, and whatever the avatar is doing with the furniture: sitting down,
// snoring in bed, the TV, the games console, the shower, a drink, food, music on the speaker, typing.

/** a loop that runs for the whole action */
const LOOP: Record<string, { kind: LoopKind; level: number; params?: Record<string, number> }> = {};
const loopFor = (ids: string[], kind: LoopKind, level: number, params?: Record<string, number>) => ids.forEach((id) => (LOOP[id] = { kind, level, params }));
loopFor(['sleep', 'nap', 'sleepmode'], 'snore', 0.55);
loopFor(['nollywood', 'movie', 'netflix', 'binge', 'premiere', 'youtube'], 'tv', 0.5);
loopFor(['match'], 'tv', 0.55, { match: 1 });
loopFor(['fifa', 'friend', 'rank', 'round', 'stream'], 'game', 0.6);
loopFor(['bath', 'hot', 'soak', 'spa', 'sink', 'water'], 'shower', 0.55);
loopFor(['breeze'], 'fan', 0.5);
loopFor(['work', 'plan', 'thread', 'trade', 'calls', 'scroll', 'tiktok', 'gist', 'charge'], 'typing', 0.6);

/** a one-shot a moment into the action */
const SHOT: Record<string, SfxName> = {};
const shotFor = (ids: string[], name: SfxName) => ids.forEach((id) => (SHOT[id] = name));
shotFor(['drink', 'malta', 'cool', 'champagne', 'cocktail', 'glass', 'smoothie', 'espresso', 'latte'], 'bottle');
shotFor(['eat', 'jollof', 'yam', 'wings', 'snacks', 'brunch', 'dinner', 'mealprep', 'tasting'], 'munch');
shotFor(['fuel'], 'pullCord');
shotFor(['selfie', 'shoot', 'pose'], 'shutter');
shotFor(['massage', 'yoga', 'breathe', 'stretch', 'relax', 'recline'], 'sigh');
shotFor(['read'], 'mapOpen');

/** music on the speaker, the hi-fi or for a party */
const MUSIC: Record<string, Style> = { afrobeats: 'club', party: 'club', host: 'club', dance: 'club', vinyl: 'lounge', playlist: 'lounge', listening: 'lounge', mood: 'lounge', vibe: 'lounge', lounge: 'lounge' };

export function HomeSounds() {
  useEffect(() => {
    const hum = new Loop('hum', { bus: 'ambience', fade: 0.3 });
    const gen = new Loop('generator', { bus: 'ambience', fade: 0.6 });
    const fan = new Loop('fan', { bus: 'ambience', fade: 0.6 });
    let act: Loop | null = null;
    let musicTimer: ReturnType<typeof setInterval> | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, f: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        f();
      }, ms);
      timers.add(t);
    };

    const power = (home: HomeView | null) => {
      const p = home?.power;
      hum.set(p?.grid ? 0.5 : 0);
      gen.set(p && !p.grid && p.generator ? 0.5 : 0);
      const hasFan = !!home?.placed.some((i) => !i.stored && ['fan', 'towerfan', 'ac', 'inverterac'].includes(furnitureById(i.itemId)?.model ?? ''));
      fan.set(hasFan && p && (p.grid || p.generator) ? 0.25 : 0);
    };
    const changed = (a: PowerState | undefined, b: PowerState | undefined) => !!a && !!b && (a.grid !== b.grid || a.generator !== b.generator);

    const acting = (a: Acting) => {
      act?.set(0);
      const old = act;
      if (old) later(1500, () => old.dispose());
      act = null;
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
        stopMusic();
      }
      if (!a) return;
      const id = a.action.id;
      const pose = placementFor(a.item, a.action).pose.base;
      // walking over takes a moment; sit or lie down when you get there
      if (pose === 'chair' || pose === 'floor') later(900, () => sfx('sit'));
      if (pose === 'lie') later(1000, () => sfx('liedown'));
      if (SHOT[id]) later(1300, () => sfx(SHOT[id]));
      const l = LOOP[id];
      if (l) {
        const loop = new Loop(l.kind, { bus: 'sfx', fade: 0.6 });
        act = loop;
        later(l.kind === 'snore' ? 2500 : 1200, () => act === loop && loop.set(l.level, l.params));
      }
      const style = MUSIC[id];
      if (style) musicTimer = setInterval(() => !useSoundSettings.getState().muted && playMusic(style, 0.7), 300);
    };

    const stopUnlock = whenUnlocked(() => {
      power(useHome.getState().home);
      acting(useHome.getState().acting);
    });
    const unsub = useHome.subscribe((s, prev) => {
      if (s.home !== prev.home) {
        if (changed(prev.home?.power, s.home?.power)) {
          const was = prev.home!.power, now = s.home!.power;
          if ((was.grid || was.generator) && !(now.grid || now.generator)) sfx('powerDown');
          else if (now.grid && !was.grid) sfx('powerUp');
        }
        power(s.home);
      }
      if (s.acting !== prev.acting) acting(s.acting);
    });
    const unsubMute = useSoundSettings.subscribe((s, prev) => {
      if (s.muted !== prev.muted && !s.muted) power(useHome.getState().home);
    });
    return () => {
      stopUnlock();
      unsub();
      unsubMute();
      timers.forEach(clearTimeout);
      if (musicTimer) clearInterval(musicTimer);
      stopMusic();
      [hum, gen, fan, act].forEach((l) => l?.dispose());
    };
  }, []);
  return null;
}
