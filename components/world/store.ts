'use client';
import { create } from 'zustand';
import type { WorldModel, MarkModel } from '@/lib/world/load';
import type { Placed } from '@/lib/world/geometry';
import type { PlacedVenue } from '@/lib/life/venues';
import type { Item } from '@/lib/life/market';
import type { Look } from '@/lib/life/look';
import type { HomeItem } from '@/lib/life/home';
import type { ActivityId } from '@/lib/life/activities';
import type { Citizenship } from '@/lib/life/citizen';
import type { Crowd, CrowdNotice } from '@/lib/life/crowd';
import { DEFAULT_COUNTRY, type CountryId } from '@/lib/world/countries';
import type { FigureAct } from './figureMoves';
import type { JobBoard, JobId } from '@/lib/life/jobs';
import type { CabinId } from '@/lib/life/flights';

/** An everyday activity in progress (dance, stretch...): the avatar plays it until `until` or until you move. */
export type Doing = { id: ActivityId; until: number } | null;

export type Peer = { id: string; handle: string; x: number; z: number; yaw: number; at: number; ride?: string | null; act?: FigureAct | null };
/** A job shift in progress (lib/life/jobs.ts): `startedAt` and `endsAt` are local ms; `act` plays while you stand at your station. */
export type Shift = { jobId: JobId; startedAt: number; endsAt: number; tasks: number; act: FigureAct | null; uniform: string; venueId: string; ride: string | null; face: number | null; cam: { yaw: number; pitch: number } | null };
/** A ride in progress: the player follows `path` for `duration` seconds from `startedAt` (ms). */
export type Trip = {
  mode: string; emoji: string; label: string; path: { x: number; z: number }[]; startedAt: number; duration: number; itemId?: string | null;
  /** a flight leg: 'up' rolls down the runway and climbs out, 'down' descends onto it; altitude follows progress */
  fly?: 'up' | 'down';
  /** paint for the aircraft's tail (the destination's colour) */
  tint?: string;
  /** the aircraft flies this country's livery */
  country?: CountryId;
  /** called once when the trip ends */
  onDone?: () => void;
};
/** A flight between countries in progress (components/life/flight.ts drives it). */
/** Your boarding pass, from a check-in desk (the token is the server's signed pass). */
export type BoardingPass = { token: string; from: CountryId; to: CountryId; cabin: CabinId; number: string };
/** Where you are in the airport and what you hold. `sheet` is the desk you are using. */
export type AirportState = { pass: BoardingPass | null; cleared: boolean; sheet: 'checkin' | 'gate' | 'jet' | null; zone: 'outside' | 'checkin' | 'gate' | 'arrivals' };
export type Flight = { phase: 'boarding' | 'takeoff' | 'cruise' | 'landing' | 'arriving' | 'arrived'; from: CountryId; to: CountryId; cabin: CabinId; number: string; at: number };
export type ChatLine = { id: string; from: string; text: string; at: number; x: number; z: number };
export type Toast = { id: string; text: string; kind: string; at: number };
export type ResidentMsg = { role: 'user' | 'assistant'; content: string };
export type PhoneApp = 'home' | 'trenches' | 'wallet' | 'solana' | 'hustle' | 'jobs' | 'market' | 'garage' | 'house' | 'rich' | 'gist' | 'map' | 'guestbook' | 'settings' | 'id' | 'love';
export type MarketKind = 'car' | 'boat' | 'plane' | 'home' | null;

export type LifeMe = {
  id: string; handle: string; name: string; avatarUrl: string | null; bags: number; status: string; statusUntil: string | null;
  vibes: number; clout: number; gas: number; mood: string; moodEmoji: string; look: Look | null; lookPending: boolean;
  citizen: Citizenship;
  /** the country you are in right now, and your home country */
  location?: CountryId; home?: CountryId;
};
export type WalletData = {
  address: string;
  cluster: 'devnet' | 'mainnet-beta';
  explorer: string;
  exportedAt: string | null;
  balances: { sol: number; lamports: number; solUsd: number | null; totalUsd: number | null; tokens: TokenBalance[] } | null;
  error: string | null;
  txs: { id: string; kind: string; sol: number; mint: string | null; signature: string | null; url: string | null; note: string; at: string }[];
};
export type TokenBalance = {
  mint: string; amount: number; decimals: number; symbol: string | null; name: string | null; priceUsd: number | null; valueUsd: number | null;
  change24h: number | null; icon: string | null; url: string | null;
};
export type LifeData = {
  me: LifeMe | null;
  assets?: (Item & { equipped: boolean; paid: number; acquiredAt: string })[];
  furniture?: HomeItem[];
  netWorth?: number;
  quests?: { day: string; quests: { id: string; title: string; emoji: string; target: number; reward: number; progress: number; done: boolean; claimed: boolean }[]; resetsAt: string };
  txs?: { id: string; kind: string; amount: number; note: string; at: string }[];
};
type Me = { id: string; handle: string; isOwner: boolean } | null;

export type WorldState = {
  model: WorldModel | null;
  /** the country whose capital is drawn around you (lib/world/countries.ts); Solana until set */
  country: CountryId;
  skyline: boolean; // true = outside view (no walking)
  me: Me;
  selected: Placed | null;
  lit: Set<string>;
  peers: Record<string, Peer>;
  chat: ChatLine[];
  playerPos: { x: number; z: number; yaw: number };
  spawnAt: { x: number; z: number; rot: number; depth: number } | null;
  guestbookOpen: boolean;
  chatOpen: boolean;
  // life layer
  life: LifeData | null;
  wallet: WalletData | null;
  phone: { open: boolean; app: PhoneApp; marketKind: MarketKind; to: string | null };
  selectedPeer: Peer | null;
  selectedVenue: PlacedVenue | null;
  nearVenue: string | null;
  riding: Item | null;
  teleport: { x: number; z: number } | null;
  trip: Trip | null;
  mapOpen: boolean;
  toasts: Toast[];
  doing: Doing;
  /** the job board and your jobs (null until loaded or signed out) */
  jobs: JobBoard | null;
  shift: Shift | null;
  /** swing the camera round to this yaw and pitch (then forget it): to look at you working at your station */
  camAim: { yaw: number; pitch: number } | null;
  /** turn your avatar to face this way (then forget it) */
  faceAim: number | null;
  /** the named resident you are talking to (lib/life/residents.ts) */
  selectedResident: string | null;
  /** speech bubbles over residents' heads */
  residentSays: Record<string, { text: string; at: number }>;
  /** your conversation with each resident this visit */
  residentChats: Record<string, ResidentMsg[]>;
  /** follower crowds around you and the people near you (times already in local clock) */
  crowds: Crowd[];
  /** someone you follow just posted and their crowd is gathering */
  crowdNotices: CrowdNotice[];

  setModel: (m: WorldModel, skyline: boolean, me: Me) => void;
  setCountry: (c: CountryId) => void;
  select: (p: Placed | null) => void;
  setLit: (ids: string[]) => void;
  toggleLit: (id: string, lit: boolean, count: number) => void;
  upsertPeer: (p: Peer) => void;
  dropPeer: (id: string) => void;
  pushChat: (c: ChatLine) => void;
  setPlayerPos: (p: { x: number; z: number; yaw: number }) => void;
  setSpawn: (p: { x: number; z: number; rot: number; depth: number } | null) => void;
  addMark: (m: MarkModel) => void;
  clearMarks: (id?: string) => void;
  setGuestbookOpen: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  setLife: (l: LifeData | null) => void;
  setWallet: (w: WalletData | null) => void;
  patchMe: (p: Partial<LifeMe>) => void;
  openPhone: (app?: PhoneApp, marketKind?: MarketKind, to?: string | null) => void;
  closePhone: () => void;
  selectPeer: (p: Peer | null) => void;
  selectVenue: (v: PlacedVenue | null) => void;
  setNearVenue: (id: string | null) => void;
  setRiding: (i: Item | null) => void;
  setTeleport: (t: { x: number; z: number } | null) => void;
  setTrip: (t: Trip | null) => void;
  setMapOpen: (v: boolean) => void;
  pushToast: (text: string, kind?: string) => void;
  dropToast: (id: string) => void;
  setDoing: (d: Doing) => void;
  setJobs: (j: JobBoard | null) => void;
  setShift: (s: Shift | null) => void;
  setCamAim: (a: { yaw: number; pitch: number } | null) => void;
  setFaceAim: (y: number | null) => void;
  selectResident: (id: string | null) => void;
  residentSay: (id: string, text: string) => void;
  pushResidentChat: (id: string, m: ResidentMsg) => void;
  setCrowds: (c: Crowd[]) => void;
  pushCrowdNotices: (n: CrowdNotice[]) => void;
  dropCrowdNotice: (id: string) => void;
  flight: Flight | null;
  setFlight: (f: Flight | null) => void;
  airport: AirportState;
  patchAirport: (p: Partial<AirportState>) => void;
};

export const useWorld = create<WorldState>((set) => ({
  model: null,
  country: DEFAULT_COUNTRY,
  setCountry: (country) => set({ country }),
  skyline: true,
  me: null,
  selected: null,
  lit: new Set(),
  peers: {},
  chat: [],
  playerPos: { x: 0, z: 0, yaw: 0 },
  spawnAt: null,
  guestbookOpen: false,
  chatOpen: false,
  life: null,
  wallet: null,
  phone: { open: false, app: 'home', marketKind: null, to: null },
  selectedPeer: null,
  selectedVenue: null,
  nearVenue: null,
  riding: null,
  teleport: null,
  trip: null,
  mapOpen: false,
  toasts: [],
  doing: null,
  jobs: null,
  shift: null,
  camAim: null,
  faceAim: null,
  selectedResident: null,
  residentSays: {},
  residentChats: {},
  crowds: [],
  crowdNotices: [],
  flight: null,
  airport: { pass: null, cleared: false, sheet: null, zone: 'outside' },
  setModel: (model, skyline, me) => set({ model, skyline, me }),
  select: (selected) => set({ selected, ...(selected ? { selectedPeer: null, selectedVenue: null, selectedResident: null } : {}) }),
  setLit: (ids) => set({ lit: new Set(ids) }),
  toggleLit: (id, lit, count) =>
    set((s) => {
      const next = new Set(s.lit);
      if (lit) next.add(id);
      else next.delete(id);
      const model = s.model
        ? { ...s.model, geometry: { ...s.model.geometry, structures: s.model.geometry.structures.map((p) => (p.id === id ? { ...p, lanternsLit: count } : p)) } }
        : s.model;
      const selected = s.selected && s.selected.id === id ? { ...s.selected, lanternsLit: count } : s.selected;
      return { lit: next, model, selected };
    }),
  upsertPeer: (p) => set((s) => ({ peers: { ...s.peers, [p.id]: { ...s.peers[p.id], ...p } } })),
  dropPeer: (id) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[id];
      return { peers, selectedPeer: s.selectedPeer?.id === id ? null : s.selectedPeer };
    }),
  pushChat: (c) => set((s) => ({ chat: [...s.chat.slice(-60), c] })),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setSpawn: (spawnAt) => set({ spawnAt }),
  addMark: (m) => set((s) => (s.model ? { model: { ...s.model, marks: [m, ...s.model.marks.filter((x) => x.byHandle !== m.byHandle)] } } : {})),
  clearMarks: (id) => set((s) => (s.model ? { model: { ...s.model, marks: id ? s.model.marks.filter((m) => m.id !== id) : [] } } : {})),
  setGuestbookOpen: (guestbookOpen) => set({ guestbookOpen }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setLife: (life) => set({ life }),
  setWallet: (wallet) => set({ wallet }),
  patchMe: (p) => set((s) => (s.life?.me ? { life: { ...s.life, me: { ...s.life.me, ...p } } } : {})),
  openPhone: (app = 'home', marketKind = null, to = null) => set({ phone: { open: true, app, marketKind, to }, selected: null, selectedPeer: null, selectedVenue: null, selectedResident: null, guestbookOpen: false }),
  closePhone: () => set((s) => ({ phone: { ...s.phone, open: false } })),
  selectPeer: (selectedPeer) => set({ selectedPeer, ...(selectedPeer ? { selected: null, selectedVenue: null, selectedResident: null } : {}) }),
  selectVenue: (selectedVenue) => set({ selectedVenue, ...(selectedVenue ? { selected: null, selectedPeer: null, selectedResident: null } : {}) }),
  setNearVenue: (nearVenue) => set({ nearVenue }),
  setRiding: (riding) => set({ riding }),
  setTeleport: (teleport) => set({ teleport }),
  setTrip: (trip) => set({ trip }),
  setMapOpen: (mapOpen) => set({ mapOpen, ...(mapOpen ? { selected: null, selectedPeer: null, selectedVenue: null, selectedResident: null } : {}) }),
  pushToast: (text, kind = 'info') => set((s) => ({ toasts: [...s.toasts.slice(-4), { id: Math.random().toString(36).slice(2), text, kind, at: Date.now() }] })),
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDoing: (doing) => set({ doing }),
  setJobs: (jobs) => set({ jobs }),
  setShift: (shift) => set({ shift }),
  setCamAim: (camAim) => set({ camAim }),
  setFaceAim: (faceAim) => set({ faceAim }),
  selectResident: (selectedResident) =>
    set({ selectedResident, ...(selectedResident ? { selected: null, selectedPeer: null, selectedVenue: null } : {}) }),
  residentSay: (id, text) => set((s) => ({ residentSays: { ...s.residentSays, [id]: { text, at: Date.now() } } })),
  setCrowds: (crowds) => set({ crowds }),
  pushCrowdNotices: (n) => set((s) => ({ crowdNotices: [...s.crowdNotices.filter((x) => !n.some((y) => y.id === x.id)), ...n].slice(-3) })),
  dropCrowdNotice: (id) => set((s) => ({ crowdNotices: s.crowdNotices.filter((x) => x.id !== id) })),
  pushResidentChat: (id, m) => set((s) => ({ residentChats: { ...s.residentChats, [id]: [...(s.residentChats[id] ?? []).slice(-29), m] } })),
  setFlight: (flight) => set({ flight }),
  patchAirport: (p) => set((s) => ({ airport: { ...s.airport, ...p } })),
}));
