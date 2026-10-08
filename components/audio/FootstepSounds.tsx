'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerSound } from '@/lib/audio/state';
import { sfx, type Surface } from '@/lib/audio/sfx';
import { surfaceAt, type SurfaceMap } from '@/lib/audio/surfaces';

// Footsteps in time with the walk animation (Figure.tsx advances its gait by dt * (6 + 4 * speed), slower when
// tired, and a foot lands every half cycle), louder and quicker when sprinting, by what's underfoot.
// In the city the surface comes from the map; in the house it is the floor.

export function FootstepSounds({ map, floor }: { map?: SurfaceMap; floor?: Surface }) {
  const phase = useRef(0);
  useFrame((_, delta) => {
    const p = playerSound;
    const dt = Math.min(delta, 0.1);
    if (!p.onFoot || p.speed < 0.05) {
      // a foot already half way down lands right away when you start again
      phase.current = 0.6;
      return;
    }
    const s = p.speed;
    const rate = ((6 + 4 * s) * (1 - 0.35 * p.tired) * (p.sprint ? 1.35 : 1)) / Math.PI;
    phase.current += dt * rate;
    if (phase.current < 1) return;
    phase.current -= 1;
    const surface = p.surface ?? floor ?? (map ? surfaceAt(map, p.x, p.z) : 'concrete');
    sfx('footstep', { surface, v: (p.sprint ? 2 : 1 + 0.5 * s) * (1 - 0.25 * p.tired) });
  });
  return null;
}
