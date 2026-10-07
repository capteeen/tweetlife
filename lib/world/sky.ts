import { Color } from 'three';
import { SKY } from './biomes';

// Sky by account age. Pure, usable on the server (OG image) and in the canvas.
// t=0 dawn -> 0.33 noon -> 0.66 evening -> 1 night.

const STOPS = [new Color(SKY.dawn), new Color(SKY.noon), new Color(SKY.evening), new Color(SKY.night)];

export function skyColors(t: number) {
  const seg = Math.min(2, Math.floor(t * 3));
  const f = t * 3 - seg;
  const horizon = STOPS[seg].clone().lerp(STOPS[seg + 1], f);
  const zenith = horizon.clone().lerp(new Color('#5B7FB3'), t > 0.85 ? 0.15 : 0.55);
  if (t > 0.85) zenith.lerp(new Color('#0F1522'), 0.8);
  return { horizon, zenith };
}

export function sunFor(t: number) {
  // low warm sun at dawn/evening, high at noon, dim moon at night
  const elevation = t < 0.5 ? 0.25 + t * 1.3 : 0.9 - (t - 0.5) * 1.4;
  const intensity = t > 0.85 ? 0.35 : 1.6 - Math.abs(t - 0.4) * 1.2;
  const color = t > 0.85 ? '#9FB4D9' : t > 0.5 ? '#FFD2A3' : t < 0.18 ? '#FFC9A8' : '#FFF6E8';
  return { elevation: Math.max(0.15, elevation), intensity: Math.max(0.3, intensity), color };
}
