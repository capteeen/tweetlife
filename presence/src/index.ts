import { Server, getServerByName, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import type * as Party from 'partykit/server';
import WorldRoom from '../../party/world';

// PartyKit's shared hosting stopped taking new projects, so the same room code (party/world.ts) runs here as a
// Cloudflare Durable Object through PartyServer, PartyKit's successor. This file only adapts the two APIs:
// the room logic, tickets, shards and interest radius all stay in party/world.ts, which `partykit dev` still
// runs locally. URLs are unchanged: wss://<host>/parties/world/<room>.

type Env = { World: DurableObjectNamespace<World>; PRESENCE_SECRET?: string };

export class World extends Server<Env> {
  #room: WorldRoom | null = null;

  /** party/world.ts, given the slice of PartyKit's Room it uses */
  get room(): WorldRoom {
    if (this.#room) return this.#room;
    const env = this.env;
    const self = this;
    const shim = {
      get id() {
        return self.name;
      },
      env,
      broadcast: (msg: string, without?: string[]) => self.broadcast(msg, without),
      getConnections: () => self.getConnections(),
      context: {
        parties: {
          world: {
            get: (name: string) => ({
              fetch: async (init?: RequestInit) => (await getServerByName(env.World, name)).fetch(new Request(`https://presence/parties/world/${encodeURIComponent(name)}`, init)),
            }),
          },
        },
      },
    };
    this.#room = new WorldRoom(shim as unknown as Party.Room);
    return this.#room;
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    this.room.onConnect(conn as unknown as Party.Connection, ctx as unknown as Party.ConnectionContext);
  }

  onMessage(conn: Connection, message: WSMessage) {
    if (typeof message === 'string') this.room.onMessage(message, conn as unknown as Party.Connection);
  }

  onClose(conn: Connection) {
    this.room.onClose(conn as unknown as Party.Connection);
  }

  onRequest(req: Request) {
    return this.room.onRequest(req as unknown as Party.Request);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    // the app encodes room ids (`country%3Asolana`); a room is named by its plain id, as PartyKit did
    const url = new URL(request.url);
    const decoded = url.pathname.split('/').map((p) => decodeURIComponent(p)).join('/');
    if (decoded !== url.pathname) {
      url.pathname = decoded;
      request = new Request(url, request);
    }
    const res = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) =>
        WorldRoom.onBeforeConnect(req as unknown as Party.Request, { id: lobby.name, env } as unknown as Party.Lobby) as Promise<Request | Response>,
    });
    return res ?? new Response('tweetlife presence', { status: 404 });
  },
};
