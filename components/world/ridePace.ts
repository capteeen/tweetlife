// How a ride moves along its route over the trip's fixed duration: it pulls away, cruises, and slows to a stop at the
// end instead of sliding at a constant speed. The bus also waits at the start with its doors open while you board,
// stops at a stop or two on the way ("stops at every stop"), and opens its doors when you arrive.
// The trip still takes exactly `duration` seconds; only the pace inside it changes. Walking and flights stay linear.

export type PaceAt = {
  /** 0..1 along the route */
  u: number;
  /** route fraction per second right now (multiply by the route length for metres per second) */
  rate: number;
  /** bus doors, 0 shut .. 1 open */
  doors: number;
};

const N = 240;

export function ridePace(mode: string, duration: number): (sec: number) => PaceAt {
  // walking, and flights (their climb and descent follow the trip's clock), keep a steady pace
  if (mode === 'walk' || mode === 'airliner' || mode === 'jet' || duration <= 0) return (sec) => ({ u: Math.min(1, Math.max(0, sec / Math.max(duration, 1e-3))), rate: 1 / Math.max(duration, 1e-3), doors: 0 });
  const ramp = Math.min(duration / 4, mode === 'bus' ? 1.6 : mode === 'bike' || mode === 'scooter' ? 0.8 : 1.2);
  // windows [from, to] where the ride stands still
  const stops: [number, number][] = [];
  if (mode === 'bus') {
    const dwell = Math.min(2.2, duration * 0.12);
    stops.push([0, dwell * 0.8]);
    const mids = duration > 16 ? 2 : duration > 9 ? 1 : 0;
    for (let k = 1; k <= mids; k++) {
      const c = (duration * k) / (mids + 1);
      stops.push([c - dwell / 2, c + dwell / 2]);
    }
    stops.push([duration - dwell * 0.7, duration]);
  }
  const speed = (t: number) => {
    let v = Math.min(1, t / ramp, (duration - t) / ramp);
    for (const [a, b] of stops) {
      if (t >= a && t <= b) return 0;
      v = Math.min(v, (t < a ? a - t : t - b) / ramp);
    }
    return Math.max(0, v);
  };
  // smooth the ramps (ease in and out rather than a straight line)
  const sp = (t: number) => {
    const v = speed(t);
    return v * v * (3 - 2 * v);
  };
  const cum = new Float32Array(N + 1);
  const dt = duration / N;
  for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + ((sp((i - 1) * dt) + sp(i * dt)) / 2) * dt;
  const total = cum[N] || 1;
  return (sec) => {
    const t = Math.min(duration, Math.max(0, sec));
    const f = t / dt, i = Math.min(N - 1, Math.floor(f));
    const u = (cum[i] + (cum[i + 1] - cum[i]) * (f - i)) / total;
    let doors = 0;
    stops.forEach(([a, b], k) => {
      if (t < a || t > b) return;
      const opening = k === 0 ? 1 : Math.min(1, (t - a) / 0.5);
      const closing = k === stops.length - 1 ? 1 : Math.min(1, (b - t) / 0.5);
      doors = Math.max(doors, Math.min(opening, closing));
    });
    return { u: Math.min(1, u), rate: sp(t) / total, doors };
  };
}
