import type * as Party from 'partykit/server';

// Presence rooms. A country is one shared place: `country:<id>` holds everyone in that country (and
// `country:<id>:2`, `:3`... once it gets crowded). Legacy `world:<handle>` rooms still work for old clients.
// Visitors send their position at 10Hz; the room fans out positions, join/leave, and proximity chat.
// Admission is decided by the Next.js app: the client connects with a short-lived signed ticket.
//
// Country rooms:
//  - Interest radius: a position is only forwarded to people within INTEREST_RADIUS of the mover. Everyone
//    gets a light roster of the whole shard every ROSTER_MS, so the map, directory and counts stay true.
//  - Shards: newcomers go to the next shard once a room has ROOM_SOFT_CAP people; someone joining a friend
//    (the client asks `GET /parties/world/country:<id>?where=<handles>`) may still come in up to ROOM_HARD_CAP.
//    Each shard reports its handles to the base room, which answers where to go.
// Numbers mirror lib/world/country-map.ts (this file is deployed on its own with `npm run party:deploy`).

const LEGACY_MAX = 50;
const ROOM_SOFT_CAP = 80;
const ROOM_HARD_CAP = 100;
const INTEREST_RADIUS = 120;
const ROSTER_MS = 3000;
const CHAT_RANGE = 14;
const SHARD_STALE_MS = 60_000;

type Visitor = { id: string; handle: string; x: number; z: number; yaw: number; at: number; ride: string | null; act: string | null };
type ShardInfo = { count: number; handles: string[]; at: number };

const isCountryRoom = (id: string) => id.startsWith('country:');
const baseOf = (id: string) => id.replace(/:\d+$/, '');
const shardNo = (id: string) => {
  const m = id.match(/^country:[a-z0-9_-]+:(\d+)$/);
  return m ? Number(m[1]) : 1;
};
const shardId = (base: string, n: number) => (n <= 1 ? base : `${base}:${n}`);

export default class WorldRoom implements Party.Server {
  visitors = new Map<string, Visitor>();
  /** base room only: what each shard last reported */
  shards = new Map<string, ShardInfo>();
  roster: ReturnType<typeof setInterval> | null = null;
  lastReport = 0;
  constructor(readonly room: Party.Room) {}

  get country() {
    return isCountryRoom(this.room.id);
  }

  static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby) {
    const url = new URL(req.url);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) return new Response('ticket required', { status: 401 });
    const secret = lobby.env.PRESENCE_SECRET as string | undefined;
    if (!secret) return new Response('presence not configured', { status: 503 });
    const ok = await verifyTicket(ticket, secret, lobby.id);
    if (!ok) return new Response('bad ticket', { status: 403 });
    req.headers.set('x-visitor', JSON.stringify(ok));
    req.headers.set('x-with', url.searchParams.get('with') ?? '');
    return req;
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const n = this.visitors.size;
    if (this.country) {
      // a friend's shard takes you up to the hard cap; otherwise the base room's answer already sent you to a shard with room
      if (n >= ROOM_HARD_CAP) {
        conn.send(JSON.stringify({ t: 'full', next: shardId(baseOf(this.room.id), shardNo(this.room.id) + 1) }));
        conn.close(4001, 'room full');
        return;
      }
    } else if (n >= LEGACY_MAX) {
      conn.send(JSON.stringify({ t: 'full', next: nextMirror(this.room.id) }));
      conn.close(4001, 'room full');
      return;
    }
    const v = JSON.parse(ctx.request.headers.get('x-visitor') ?? '{}') as { id: string; handle: string };
    const visitor: Visitor = { id: v.id, handle: v.handle, x: 0, z: 0, yaw: 0, at: Date.now(), ride: null, act: null };
    // the same person on a second tab replaces the first
    for (const [cid, other] of this.visitors) if (other.id === visitor.id && !visitor.id.startsWith('anon-')) this.visitors.delete(cid);
    this.visitors.set(conn.id, visitor);
    conn.send(JSON.stringify({ t: 'hello', me: conn.id, you: visitor.id, room: this.room.id, peers: [...this.visitors.values()] }));
    this.room.broadcast(JSON.stringify({ t: 'join', peer: visitor }), [conn.id]);
    if (this.country) {
      this.startRoster();
      this.report(true);
    }
  }

  onMessage(raw: string, sender: Party.Connection) {
    const me = this.visitors.get(sender.id);
    if (!me) return;
    let msg: { t: string; x?: number; z?: number; yaw?: number; text?: string; ride?: string | null; act?: string | null; to?: string; kind?: string; delta?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === 'pos' && typeof msg.x === 'number' && typeof msg.z === 'number') {
      me.x = msg.x;
      me.z = msg.z;
      me.yaw = msg.yaw ?? 0;
      me.ride = typeof msg.ride === 'string' ? msg.ride : null;
      // an everyday activity being played (dance, stretch...), so others see it too
      me.act = typeof msg.act === 'string' ? msg.act.slice(0, 16) : null;
      me.at = Date.now();
      const line = JSON.stringify({ t: 'pos', id: me.id, x: me.x, z: me.z, yaw: me.yaw, ride: me.ride, act: me.act });
      if (!this.country) {
        this.room.broadcast(line, [sender.id]);
        return;
      }
      // interest radius: only the people near you get your every step
      for (const c of this.room.getConnections()) {
        if (c.id === sender.id) continue;
        const v = this.visitors.get(c.id);
        if (v && Math.hypot(v.x - me.x, v.z - me.z) <= INTEREST_RADIUS) c.send(line);
      }
    } else if (msg.t === 'social' && typeof msg.text === 'string') {
      // a social action or venue effect: deliver to the named visitor, or to everyone within earshot
      const line = { t: 'social', id: crypto.randomUUID(), from: me.handle, kind: msg.kind ?? 'social', text: msg.text.slice(0, 200), delta: msg.delta ?? null, at: Date.now() };
      for (const c of this.room.getConnections()) {
        const v = this.visitors.get(c.id);
        if (!v || c.id === sender.id) continue;
        const targeted = typeof msg.to === 'string' ? v.handle.toLowerCase() === msg.to.toLowerCase() : Math.hypot(v.x - me.x, v.z - me.z) <= CHAT_RANGE;
        if (targeted) c.send(JSON.stringify(line));
      }
    } else if (msg.t === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.slice(0, 200);
      const line = { t: 'chat', id: crypto.randomUUID(), from: me.handle, text, at: Date.now(), x: me.x, z: me.z };
      // proximity: only visitors within CHAT_RANGE hear it
      for (const c of this.room.getConnections()) {
        const v = this.visitors.get(c.id);
        if (!v) continue;
        if (Math.hypot(v.x - me.x, v.z - me.z) <= CHAT_RANGE) c.send(JSON.stringify(line));
      }
    }
  }

  onClose(conn: Party.Connection) {
    const v = this.visitors.get(conn.id);
    this.visitors.delete(conn.id);
    if (v && ![...this.visitors.values()].some((o) => o.id === v.id)) this.room.broadcast(JSON.stringify({ t: 'leave', id: v.id }));
    if (this.country) {
      this.report(true);
      if (this.visitors.size === 0 && this.roster) {
        clearInterval(this.roster);
        this.roster = null;
      }
    }
  }

  /** Everyone in the shard, every few seconds: id, handle and a rounded position. Cheap, and keeps the map honest. */
  startRoster() {
    if (this.roster) return;
    this.roster = setInterval(() => {
      if (this.visitors.size === 0) return;
      const peers = [...this.visitors.values()].map((v) => [v.id, v.handle, Math.round(v.x), Math.round(v.z)]);
      this.room.broadcast(JSON.stringify({ t: 'roster', room: this.room.id, peers }));
      this.report(false);
    }, ROSTER_MS);
  }

  /** Tell the base room who is here, so it can send friends to the same shard. */
  report(now: boolean) {
    if (!now && Date.now() - this.lastReport < 20_000) return;
    this.lastReport = Date.now();
    const info: ShardInfo = { count: this.visitors.size, handles: [...new Set([...this.visitors.values()].map((v) => v.handle.toLowerCase()))], at: Date.now() };
    const base = baseOf(this.room.id);
    if (base === this.room.id) {
      this.shards.set(this.room.id, info);
      return;
    }
    this.room.context.parties.world
      .get(base)
      .fetch({ method: 'POST', body: JSON.stringify({ shard: this.room.id, ...info }) })
      .catch(() => {});
  }

  /**
   * GET  /parties/world/:room              -> { online } (the bottom bar; a country's base room counts every shard)
   * GET  /parties/world/country:<id>?where=a,b -> { room, online }: the shard to join (a friend's, else one with room)
   * POST /parties/world/country:<id>       <- a shard's report
   */
  async onRequest(req: Party.Request) {
    const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    if (!this.country || baseOf(this.room.id) !== this.room.id) return json({ online: this.visitors.size });
    if (req.method === 'POST') {
      const r = (await req.json().catch(() => null)) as ({ shard: string } & ShardInfo) | null;
      if (r && typeof r.shard === 'string' && baseOf(r.shard) === this.room.id) this.shards.set(r.shard, { count: r.count, handles: r.handles ?? [], at: Date.now() });
      return json({ ok: true });
    }
    this.shards.set(this.room.id, { count: this.visitors.size, handles: [...new Set([...this.visitors.values()].map((v) => v.handle.toLowerCase()))], at: Date.now() });
    for (const [id, s] of this.shards) if (id !== this.room.id && Date.now() - s.at > SHARD_STALE_MS) this.shards.delete(id);
    const online = [...this.shards.values()].reduce((a, s) => a + s.count, 0);
    const want = (new URL(req.url).searchParams.get('where') ?? '').toLowerCase().split(',').filter(Boolean);
    const ordered = [...this.shards.entries()].sort((a, b) => shardNo(a[0]) - shardNo(b[0]));
    for (const h of want) {
      const hit = ordered.find(([, s]) => s.handles.includes(h) && s.count < ROOM_HARD_CAP);
      if (hit) return json({ room: hit[0], online, friend: h });
    }
    for (let n = 1; n <= ordered.length + 1; n++) {
      const id = shardId(this.room.id, n);
      const s = this.shards.get(id);
      if (!s || s.count < ROOM_SOFT_CAP) return json({ room: id, online });
    }
    return json({ room: shardId(this.room.id, ordered.length + 1), online });
  }
}

function nextMirror(roomId: string) {
  const m = roomId.match(/^(.*):(\d+)$/);
  return m ? `${m[1]}:${Number(m[2]) + 1}` : `${roomId}:2`;
}

// Ticket: base64url(json).base64url(hmac-sha256(json)). json = { id, handle, room, exp }. A ticket for a
// base room also opens its shards (`country:bnb` opens `country:bnb:2`).
async function verifyTicket(ticket: string, secret: string, roomId: string) {
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, b64(sig), new TextEncoder().encode(payload));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(b64(payload))) as { id: string; handle: string; room: string; exp: number };
  if (data.exp < Date.now() / 1000) return null;
  if (data.room !== roomId.replace(/:\d+$/, '')) return null;
  return { id: data.id, handle: data.handle };
}

function b64(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
