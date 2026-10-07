import type * as Party from 'partykit/server';

// Presence room: one per world. Visitors send their position at 10Hz; the room fans out
// positions, join/leave, and proximity chat. Admission is decided by the Next.js app:
// the client connects with a short-lived signed ticket from /api/world/[handle]/ticket.
// Rooms hold 50 visitors; beyond that a visitor is routed to a mirror room (world:handle:2 ...).

const MAX_PER_ROOM = 50;
const CHAT_RANGE = 14;

type Visitor = { id: string; handle: string; x: number; z: number; yaw: number; at: number; ride: string | null; act: string | null };

export default class WorldRoom implements Party.Server {
  visitors = new Map<string, Visitor>();
  constructor(readonly room: Party.Room) {}

  static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby) {
    const url = new URL(req.url);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) return new Response('ticket required', { status: 401 });
    const secret = lobby.env.PRESENCE_SECRET as string | undefined;
    if (!secret) return new Response('presence not configured', { status: 503 });
    const ok = await verifyTicket(ticket, secret, lobby.id);
    if (!ok) return new Response('bad ticket', { status: 403 });
    req.headers.set('x-visitor', JSON.stringify(ok));
    return req;
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.visitors.size >= MAX_PER_ROOM) {
      conn.send(JSON.stringify({ t: 'full', next: nextMirror(this.room.id) }));
      conn.close(4001, 'room full');
      return;
    }
    const v = JSON.parse(ctx.request.headers.get('x-visitor') ?? '{}') as { id: string; handle: string };
    const visitor: Visitor = { id: v.id, handle: v.handle, x: 0, z: 0, yaw: 0, at: Date.now(), ride: null, act: null };
    this.visitors.set(conn.id, visitor);
    conn.send(JSON.stringify({ t: 'hello', me: conn.id, peers: [...this.visitors.values()] }));
    this.room.broadcast(JSON.stringify({ t: 'join', peer: visitor }), [conn.id]);
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
      this.room.broadcast(JSON.stringify({ t: 'pos', id: me.id, x: me.x, z: me.z, yaw: me.yaw, ride: me.ride, act: me.act }), [sender.id]);
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
    if (v) this.room.broadcast(JSON.stringify({ t: 'leave', id: v.id }));
  }

  /** GET /parties/world/:room -> live count (used by the bottom bar). */
  onRequest() {
    return new Response(JSON.stringify({ online: this.visitors.size }), { headers: { 'content-type': 'application/json' } });
  }
}

function nextMirror(roomId: string) {
  const m = roomId.match(/^(.*):(\d+)$/);
  return m ? `${m[1]}:${Number(m[2]) + 1}` : `${roomId}:2`;
}

// Ticket: base64url(json).base64url(hmac-sha256(json)). json = { id, handle, room, exp }
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
