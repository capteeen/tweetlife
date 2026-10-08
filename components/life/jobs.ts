'use client';
import { useWorld, type Shift } from '@/components/world/store';
import { SHIFT_SECONDS, jobById, type Job, type JobBoard, type JobId } from '@/lib/life/jobs';
import { placeVenues, type PlacedVenue } from '@/lib/life/venues';
import { WALK_IN } from '@/lib/world/interiors';
import { airportLayout, inRect, pathLength, ringRoadRadius, type Pt } from '@/lib/world/layout';
import { tripSeconds } from '@/lib/life/transport';
import { HERE, venueDoor } from './VenueCard';
import { refreshLife } from './useLife';

// Client side of jobs: load the board, apply and quit, and run a shift. At a station job your avatar walks to its
// spot (behind the bar, at a desk, by a patient's bed) and works there; road jobs (bus, deliveries) are a lap of
// the ring road. The server times the shift and pays on finish; this only shows it.

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function refreshJobs() {
  const s = useWorld.getState();
  try {
    const b = await j<JobBoard>('/api/life/jobs');
    s.setJobs(b);
    // a shift that was running when the page reloaded carries on (without walking you back to the station)
    if (b.shift && !s.shift) {
      const job = jobById(b.shift.jobId);
      const started = Date.parse(b.shift.startedAt);
      if (job) s.setShift(shiftOf(job, Math.min(Date.now(), started), b.shift.tasks));
    }
    return b;
  } catch {
    s.setJobs(null);
    return null;
  }
}

const shiftOf = (job: Job, startedAt: number, tasks: number): Shift => ({
  jobId: job.id, startedAt, endsAt: startedAt + SHIFT_SECONDS * 1000, tasks, act: job.act, uniform: job.uniform, venueId: job.venueId, ride: job.ride ?? null, face: null, cam: null,
});

/** The workplace of a job, placed in this world. */
export function workplaceOf(job: Job): PlacedVenue | null {
  const g = useWorld.getState().model?.geometry;
  if (!g) return null;
  return placeVenues(g.contentRadius, g.boundaryRadius, useWorld.getState().country).find((v) => v.id === job.venueId) ?? null;
}

/** Are you at this venue (close enough to use it)? Same rule as the venue sheet. */
export function atVenue(v: PlacedVenue, p: { x: number; z: number }) {
  const g = useWorld.getState().model?.geometry;
  if (v.id === 'airport' && g) return inRect(airportLayout(g.contentRadius, g.boundaryRadius).island, p.x, p.z);
  return Math.hypot(Math.max(0, Math.abs(p.x - v.x) - v.w / 2), Math.max(0, Math.abs(p.z - v.z) - v.d / 2)) < HERE;
}

// Where you stand on shift, in the venue's own frame (x across, z towards the door), which way you face, and
// where the camera sits to watch (an angle in the same frame: 0 is towards the door). `via` points walk you
// round counters so you never pass through them.
type Station = { x: number; z: number; face: number; cam: number; via?: [number, number][] };
const STATIONS: Record<string, Station> = {
  bar: { x: -1.2, z: -3.85, face: 0, cam: -0.5, via: [[-3.0, -1.0], [-4.1, -1.0], [-4.1, -3.85]] },
  exchange: { x: -1.2, z: -3.65, face: 0, cam: 0.5, via: [[-5.0, 0], [-5.0, -3.65]] },
  gym: { x: 3.0, z: -0.2, face: -Math.PI / 2, cam: -0.8 },
  clinic: { x: 2.3, z: -3.6, face: -Math.PI / 2, cam: -0.45, via: [[2.3, 1.5]] },
  tech: { x: -3.2, z: -2.65, face: Math.PI, cam: 0.45, via: [[-3.2, 0.5]] },
};

const toWorld = (v: PlacedVenue, x: number, z: number): Pt => {
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.x + x * c + z * s, z: v.z - x * s + z * c };
};

/** The walk from where you are to your station, ending with a half-step the way you should face; and the camera yaw to watch from. */
function stationPath(v: PlacedVenue, from: Pt): { path: Pt[]; cam: { yaw: number; pitch: number } | null } {
  const g = useWorld.getState().model!.geometry;
  if (v.id === 'airport') {
    // on the apron beside the jet at the last gate, between it and the next one, facing its wing and engine
    const a = airportLayout(g.contentRadius, g.boundaryRadius);
    const gate = a.gates[a.gates.length - 1];
    const prev = a.gates[a.gates.length - 2] ?? { x: gate.x, z: gate.z - 18 };
    const spot = { x: gate.x, z: (gate.z + prev.z) / 2 };
    const lane = a.apron.x - a.apron.w / 2 + 1;
    return { path: [from, { x: lane, z: from.z }, { x: lane, z: spot.z }, spot, { x: spot.x, z: spot.z + 0.05 }], cam: { yaw: Math.PI, pitch: 0.45 } };
  }
  const st = STATIONS[v.id];
  const k = WALK_IN[v.id];
  if (!st || !k) return { path: [from], cam: null };
  const local = (x: number, z: number) => toWorld(v, x, z);
  // in through the door unless you are already inside
  const c = Math.cos(v.rot), sn = Math.sin(v.rot);
  const dx = from.x - v.x, dz = from.z - v.z;
  const inside = Math.abs(dx * c - dz * sn) < k.w / 2 && Math.abs(dx * sn + dz * c) < k.d / 2;
  const pts: Pt[] = [from];
  if (!inside) pts.push(local(0, k.d / 2 + 2), local(0, k.d / 2 - 1.5));
  for (const [x, z] of st.via ?? []) pts.push(local(x, z));
  pts.push(local(st.x, st.z), local(st.x + Math.sin(st.face) * 0.05, st.z + Math.cos(st.face) * 0.05));
  // an angle in the venue's frame turns by the venue's rotation in the world
  return { path: pts, cam: { yaw: st.cam + v.rot, pitch: 0.6 } };
}

/** A lap of the ring road from the workplace door and back again, for road jobs. */
function lapPath(v: PlacedVenue): Pt[] {
  const g = useWorld.getState().model!.geometry;
  const door = venueDoor(v, g.contentRadius, g.boundaryRadius);
  const r = ringRoadRadius(g.contentRadius);
  const a0 = Math.atan2(door.z, door.x);
  const n = 48;
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
  return [door, ...ring, door];
}

export const jobActions = {
  async apply(jobId: JobId, answer: number) {
    const r = await j<{ ok: true; board: JobBoard }>('/api/life/jobs', { method: 'POST', body: JSON.stringify({ op: 'apply', jobId, answer }) });
    useWorld.getState().setJobs(r.board);
    return r;
  },
  async quit() {
    const r = await j<{ ok: true; board: JobBoard }>('/api/life/jobs', { method: 'POST', body: JSON.stringify({ op: 'quit' }) });
    useWorld.getState().setJobs(r.board);
    return r;
  },
  /** Clock in: the server starts the clock; you walk to your station, or set off on your route. */
  async start(job: Job) {
    const s = useWorld.getState();
    const v = workplaceOf(job);
    if (!v) throw new Error('No workplace here');
    const r = await j<{ ok: true; startedAt: string; tasks: number; board: JobBoard }>('/api/life/jobs', { method: 'POST', body: JSON.stringify({ op: 'start' }) });
    s.setJobs(r.board);
    s.setDoing(null);
    s.selectVenue(null);
    s.closePhone();
    const now = performance.now();
    let face: number | null = null;
    let cam: { yaw: number; pitch: number } | null = null;
    if (job.ride) {
      s.setTrip({ mode: job.ride, emoji: job.emoji, label: v.name, path: lapPath(v), startedAt: now, duration: SHIFT_SECONDS - 1.5 });
    } else {
      const { path, cam: c } = stationPath(v, s.playerPos);
      cam = c;
      if (path.length > 1) {
        s.setTrip({ mode: 'walk', emoji: '🚶', label: v.name, path, startedAt: now, duration: tripSeconds(pathLength(path), 1) });
        const [a, b] = path.slice(-2);
        face = Math.atan2(b.x - a.x, b.z - a.z);
      }
    }
    // a shift already running (clocked in from another tab) keeps its own clock
    s.setShift({ ...shiftOf(job, Math.min(Date.now(), Date.parse(r.startedAt)), r.tasks), face, cam });
    s.patchMe({ status: job.line, statusUntil: new Date(Date.now() + SHIFT_SECONDS * 1000).toISOString() });
  },
  async task() {
    const r = await j<{ ok: true; tasks: number }>('/api/life/jobs', { method: 'POST', body: JSON.stringify({ op: 'task' }) });
    const s = useWorld.getState();
    if (s.shift) s.setShift({ ...s.shift, tasks: r.tasks });
    return r;
  },
  async finish() {
    const r = await j<{ ok: true; pay: number; tasks: number; shifts: number; level: number; leveledUp: boolean; board: JobBoard }>('/api/life/jobs', {
      method: 'POST',
      body: JSON.stringify({ op: 'finish' }),
    });
    const s = useWorld.getState();
    s.setShift(null);
    s.setJobs(r.board);
    await refreshLife();
    return r;
  },
  async cancel() {
    const s = useWorld.getState();
    s.setShift(null);
    if (s.trip) s.setTrip(null);
    const r = await j<{ ok: true; board: JobBoard }>('/api/life/jobs', { method: 'POST', body: JSON.stringify({ op: 'cancel' }) }).catch(() => null);
    if (r) s.setJobs(r.board);
    s.patchMe({ statusUntil: null });
  },
};
