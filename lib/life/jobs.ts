import type { Stats } from './stats';
import type { WorkAct } from '@/components/world/figureMoves';

// Everyday jobs: apply at the Hustle Hub (or the Jobs app), then work shifts at a real place in the city.
// A shift is SHIFT_SECONDS at the workplace with TASKS quick tasks to tap; the server pays when the time is up.
// Pay climbs a level every SHIFTS_PER_LEVEL shifts in that job. Bags are in-world points, never money.

export type JobId = 'rider' | 'clerk' | 'bartender' | 'driver' | 'trainer' | 'crew' | 'dev' | 'doctor';

export type Job = {
  id: JobId;
  title: string;
  emoji: string;
  /** the venue (lib/life/venues.ts) where shifts happen */
  venueId: string;
  /** bags for a full shift at level 1 */
  pay: number;
  /** what it takes to get hired */
  minClout: number;
  /** shifts worked in any job before this one will have you */
  minShifts: number;
  /** a title for each level, 1..5 */
  levels: [string, string, string, string, string];
  blurb: string;
  /** the move your avatar plays at its station on shift (components/world/figureMoves.ts) */
  act: WorkAct | null;
  /** jobs on the road: the shift is a lap of the ring road on this ride instead of a station */
  ride?: 'bus' | 'scooter';
  /** shirt colour while on shift; a proper uniform can replace it later */
  uniform: string;
  /** the three quick tasks of a shift */
  tasks: [string, string, string];
  /** status line while working */
  line: string;
};

export const JOBS: Job[] = [
  {
    id: 'rider', title: 'Delivery rider', emoji: '🛵', venueId: 'suya', pay: 300, minClout: 0, minShifts: 0,
    levels: ['Rider', 'Fast rider', 'Top rider', 'Lead rider', 'Dispatch boss'],
    blurb: 'Run suya orders round the ring road on a scooter. Hot, fast, five stars.', act: null, ride: 'scooter', uniform: '#E63946',
    tasks: ['Bag the order', 'Check the address', 'Hand it over'], line: 'is out on deliveries',
  },
  {
    id: 'clerk', title: 'Shop clerk', emoji: '🧾', venueId: 'exchange', pay: 350, minClout: 0, minShifts: 0,
    levels: ['Clerk', 'Senior clerk', 'Shift lead', 'Assistant manager', 'Store manager'],
    blurb: 'Work the counter at the Coin Shop. Count coins, smile at degens.', act: 'type', uniform: '#06D6A0',
    tasks: ['Ring up a buyer', 'Restock the coin stacks', 'Count the till'], line: 'is working the counter',
  },
  {
    id: 'bartender', title: 'Bartender', emoji: '🍸', venueId: 'bar', pay: 400, minClout: 0, minShifts: 0,
    levels: ['Barback', 'Bartender', 'Head bartender', 'Mixologist', 'Bar manager'],
    blurb: 'Pour drinks at the Degen Lounge and listen to everyone’s rug story.', act: 'pour', uniform: '#F4F1DE',
    tasks: ['Pour a chapman', 'Shake a cocktail', 'Wipe the bar'], line: 'is behind the bar',
  },
  {
    id: 'driver', title: 'Bus driver', emoji: '🚌', venueId: 'hustle', pay: 450, minClout: 0, minShifts: 0,
    levels: ['Trainee driver', 'Bus driver', 'Senior driver', 'Route captain', 'Depot chief'],
    blurb: 'Drive the city loop from the job centre bus bay. Mind the gap.', act: null, ride: 'bus', uniform: '#1F4E79',
    tasks: ['Check the mirrors', 'Take fares', 'Call the next stop'], line: 'is driving the city bus',
  },
  {
    id: 'trainer', title: 'Gym trainer', emoji: '🏋️', venueId: 'gym', pay: 500, minClout: 40, minShifts: 0,
    levels: ['Floor trainer', 'Personal trainer', 'Head coach', 'Elite coach', 'Gym owner’s favourite'],
    blurb: 'Coach clients at Iron Trenches. Clout helps them listen.', act: 'coach', uniform: '#2D6A4F',
    tasks: ['Demo a squat', 'Count their reps', 'Rack the weights'], line: 'is coaching at the gym',
  },
  {
    id: 'crew', title: 'Airport ground crew', emoji: '✈️', venueId: 'airport', pay: 550, minClout: 40, minShifts: 2,
    levels: ['Ramp agent', 'Ground crew', 'Crew lead', 'Ramp supervisor', 'Station manager'],
    blurb: 'Marshal jets on the apron, load bags, wave them off.', act: 'marshal', uniform: '#F7C600',
    tasks: ['Wave the jet in', 'Load the luggage', 'Clear for take-off'], line: 'is on the apron at the airport',
  },
  {
    id: 'dev', title: 'Programmer', emoji: '💻', venueId: 'tech', pay: 700, minClout: 50, minShifts: 4,
    levels: ['Junior dev', 'Developer', 'Senior dev', 'Staff engineer', 'CTO'],
    blurb: 'Ship code at the tech office. Tests pass on the second try.', act: 'type', uniform: '#3A86FF',
    tasks: ['Fix a bug', 'Review a PR', 'Ship it'], line: 'is shipping code',
  },
  {
    id: 'doctor', title: 'Doctor', emoji: '🩺', venueId: 'clinic', pay: 900, minClout: 60, minShifts: 8,
    levels: ['Junior doctor', 'Resident', 'Doctor', 'Specialist', 'Consultant'],
    blurb: 'See patients at the clinic. Best pay in town, hardest to get.', act: 'examine', uniform: '#5FB3B3',
    tasks: ['See a patient', 'Write a prescription', 'Do your rounds'], line: 'is seeing patients',
  },
];

export const jobById = (id: string | null | undefined) => JOBS.find((j) => j.id === id) ?? null;
export const jobsAt = (venueId: string) => JOBS.filter((j) => j.venueId === venueId);

export const SHIFT_SECONDS = 60;
export const TASKS = 3;
export const SHIFTS_PER_DAY = 4;
export const SHIFTS_PER_LEVEL = 5;
export const MAX_LEVEL = 5;
/** each level pays this much more than level 1 */
export const LEVEL_RAISE = 0.2;
/** each task you skip takes this share of the pay */
export const MISSED_TASK_CUT = 0.2;
/** what a shift does to you */
export const SHIFT_COST: Partial<Stats> = { gas: -12, vibes: -3, clout: +1 };
/** a started shift nobody finished is forgotten after this long */
export const SHIFT_STALE_SECONDS = 30 * 60;

export const levelOf = (shifts: number) => Math.min(MAX_LEVEL, 1 + Math.floor(shifts / SHIFTS_PER_LEVEL));
/** shifts still to go at this job before the next level (0 at the top) */
export const toNextLevel = (shifts: number) => (levelOf(shifts) >= MAX_LEVEL ? 0 : SHIFTS_PER_LEVEL - (shifts % SHIFTS_PER_LEVEL));
export const wageFor = (job: Job, level: number, bonus = 0) => Math.round(job.pay * (1 + LEVEL_RAISE * (level - 1)) * (1 + bonus));
/** pay for a finished shift with `done` of the TASKS tasks done */
export const payFor = (job: Job, level: number, done: number, bonus = 0) => Math.round(wageFor(job, level, bonus) * (1 - MISSED_TASK_CUT * Math.max(0, TASKS - done)));
/** seconds into a shift when task `i` (0-based) comes up: spread across the shift, the last well before the end */
export const taskDueAt = (i: number) => Math.round((SHIFT_SECONDS * (i + 1)) / (TASKS + 1));

/** Why you can't be hired yet, or null when you can. */
export function hireBlocker(job: Job, p: { clout: number }, totalShifts: number): string | null {
  if (p.clout < job.minClout) return `Needs ${job.minClout} clout (you have ${p.clout}).`;
  if (totalShifts < job.minShifts) return `Needs ${job.minShifts} shifts worked anywhere (you have ${totalShifts}).`;
  return null;
}

/** The one question on the application form, and the answers you can give. Flavour only. */
export const APPLY_QUESTION = 'Why should we hire you?';
export const APPLY_ANSWERS = ['I never miss a shift.', 'I learn fast and I bring the vibes.', 'I need the bags, honestly.'];

export type JobRecordView = { jobId: JobId; shifts: number; level: number; active: boolean };
export type ShiftView = { jobId: JobId; startedAt: string; tasks: number; endsAt: string };
export type JobBoard = {
  jobs: (Job & { open: boolean; blocker: string | null })[];
  current: JobId | null;
  records: JobRecordView[];
  totalShifts: number;
  shiftsToday: number;
  shift: ShiftView | null;
  resetsAt: string;
};
