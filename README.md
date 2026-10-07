# TweetLife — your X account, as a world

Every X account has one persistent, low-poly 3D world generated from its **real** posting history. Posts become
structures, engagement becomes scale and light, posting cadence becomes terrain, followers become residents. Only the
account's followers can enter. You post the link; your followers walk around inside what your posting has built.

**Build mode: live only.** There is no mock data, no demo world, no seed script. The first world on a deployment is the
operator's own. If data cannot be fetched the world shows an honest empty or error state.

Unofficial fan project — not affiliated with, endorsed by or sponsored by X Corp.

---

## Architecture

```
app/                 Next.js 14 app router (UI chrome in Tailwind, world in Three.js)
  w/[handle]         the world (boundary view while access resolves, then walk in)
  w/[handle]/post/[id]   deep link that spawns at a structure — the URL you post to X
  my-world           owner dashboard
  explore, how, status
  api/               auth, world payloads, guestbook, lanterns, dashboard, status
lib/x/               THE ONLY PLACE X IS TOUCHED
  client.ts          one fetch path: budget check → token bucket → request → ledger row → 429 backoff
  limiter.ts         Redis token buckets (global + per user token), x-rate-limit-reset pause
  budget.ts          monthly call budget (ApiCall table is the ledger of record)
  oauth.ts           OAuth 2.0 PKCE, refresh, revoke; tokens AES-256-GCM encrypted at rest
  api.ts             typed wrappers: users/me, users/:id/tweets, tweets?ids, users/:id/following
  ingest.ts          first build (page-by-page), incremental (since_id), nightly metrics refresh
  relationship.ts    "does visitor follow owner?" with Redis cache (24h positive / 1h negative), fails closed
lib/world/           pure geometry: classify, city-grid layout (blocks fill chronologically from the centre), log scaling,
                     block terrain by posting gaps, vacant lots for silences, sky phase (seeded by handle)
lib/queue/           BullMQ queues (ingest, timelapse) with retries and a visible dead-letter list
worker/index.ts      ingestion worker + scheduler (incremental every 6h, metrics nightly 03:00 UTC)
worker/timelapse.ts  Playwright + ffmpeg: 20s MP4 of the world assembling from account creation to today
party/world.ts       PartyKit presence room: positions at 10Hz, proximity chat, 50 per room then mirrors
prisma/schema.prisma World, Structure, Mark, Lantern, VisitorSession, IngestRun, ApiCall, TimelapseJob, Incident
```

Everything the renderer draws is read from Postgres. When X is down, worlds keep serving with a "data may be stale —
last synced …" banner.

## Setup

Requirements: Node 18.17+, Postgres, Redis, ffmpeg (timelapse only), an X developer project.

1. **X developer portal** → create a project + app, enable **OAuth 2.0** with type *Web App*, callback
   `https://<your-domain>/api/auth/x/callback`, website `https://<your-domain>`. Scopes used:
   `tweet.read users.read follows.read offline.access`. Copy the client id (and secret if confidential).
2. `cp .env.example .env` and fill it in. Generate secrets:
   `openssl rand -base64 48` (SESSION_SECRET), `openssl rand -base64 32` (TOKEN_ENCRYPTION_KEY, PRESENCE_SECRET).
3. `npm install && npx prisma migrate deploy`
4. Run three processes:
   - `npm run build && npm start` — the web app
   - `npm run worker` — ingestion worker + scheduler (required: without it no world is ever built)
   - `npm run worker:timelapse` — optional, timelapse renders (needs Chromium via Playwright + ffmpeg)
5. Presence (optional): `npx partykit env add PRESENCE_SECRET` with the same value as in `.env`, then
   `npm run party:deploy` and set `NEXT_PUBLIC_PARTYKIT_HOST` to the deployed host. Without it worlds work, just
   without live visitors and chat (the bottom bar shows `—` for visitors online, never a fake number).
6. Sign in with X as the operator. Your world is queued and built from your timeline. In `/my-world` set access to
   **public** and put your handle in `OPERATOR_HANDLE` — it is then embedded on `/`, labelled as the real account it is.

### Deploying

Any host that runs a Node server + a long-lived worker process works (Railway, Fly, Render, a VPS). Vercel can host
the Next.js app but **not** the BullMQ worker; run `npm run worker` elsewhere against the same Postgres and Redis.
The app must be served over HTTPS: the session cookie is `SameSite=None; Secure` so sign-in survives inside a tweet
card iframe.

## X API tier, per-world call cost and the monthly budget

Set `X_API_TIER` and `X_MONTHLY_CALL_BUDGET` to match what you pay for. Every outbound request is one row in
`ApiCall`; `/status` shows the live count, and the limiter refuses new world builds at 100% (existing worlds keep
serving). At 80% `/status` shows an admin alert.

Because every read happens on the signed-in user's own token, we live inside **user-context** rate limits. These are
per user, so one popular world does not starve another — but the project-wide monthly *post read cap* on the Basic
and Pro tiers is shared, and that is what the budget protects.

### What one world costs

| Event | Calls | Notes |
|---|---|---|
| Sign-in | 2 | token exchange + `users/me` |
| First build | 1 + ⌈posts / 100⌉ | `users/me` + one `users/:id/tweets` page per 100 posts, capped at the API's 3,200-post window → **≤ 33 calls** |
| Incremental sync (every 6 h) | 1 + ⌈new posts / 100⌉ | usually **2 calls/run → 8/day** |
| Nightly metrics refresh | 1 + ⌈posts in last 30 days / 100⌉ | usually **2 calls/night** |
| Token refresh | 1 per 2 h of activity | only when a call is actually made |
| Visitor entry check (followers-only) | ⌈following count / 1000⌉ per uncached visitor | cached 24 h (follow) / 1 h (no follow); cap 5 pages; **0** for public worlds |
| Guestbook stone | ≤ 1 | owner-follows-back check, cached like the entry check |

**Steady state per world ≈ 10 calls/day ≈ 300/month**, plus entry checks.

### Post-read caps by tier (as published on developer.x.com; verify against your portal)

| Tier | Posts readable / month | `users/:id/tweets` user limit | `users/:id/following` user limit |
|---|---|---|---|
| Free | 100 | 1 req / 15 min | — (write-only tier; not usable for this product) |
| Basic | 10,000 (per app) | 5 req / 15 min | 15 req / 15 min |
| Pro | 1,000,000 | 900 req / 15 min | 15 req / 15 min |

The post-read cap counts *posts returned*, not calls. One first build of a 3,200-post account consumes 3,200 of
Basic's 10,000. The budget math below is in calls, which is what we meter; keep both in mind.

### Budget math (Basic)

```
first builds:      N_new worlds × ~33 calls   (3,200 posts each, worst case)
steady state:      N_live worlds × ~300 calls / month
entry checks:      N_unique visitors/month × ~1 call  (followers-only worlds only)
```

Example, Basic tier, `X_MONTHLY_CALL_BUDGET=10000`:
- 10 new worlds (330) + 25 live worlds (7,500) + 1,500 unique visitor checks (1,500) ≈ **9,330 calls**.
- But post reads: 10 × 3,200 = 32,000 posts — **over Basic's 10,000-post cap after 3 full builds**. On Basic,
  set `X_FIRST_BUILD_MAX_POSTS=800` (≈ 8 calls, 800 posts) or move to Pro before inviting more than a handful of accounts.

Example, Pro tier, `X_MONTHLY_CALL_BUDGET=150000`:
- 200 new worlds (6,600) + 500 live worlds (150,000)… → set incremental sync to 12 h or raise the budget;
  steady state is the dominant term, and it scales linearly with live worlds.

The scheduler intervals live in `worker/index.ts` (incremental every 6 h, metrics nightly). Lowering them is the
first lever when the budget is tight; the second is `X_FIRST_BUILD_MAX_POSTS`.

### Rate limiting

- Two Redis token buckets gate every call: global (`X_GLOBAL_RATE_PER_SEC`/`X_GLOBAL_BURST`) and per user token
  (`X_USER_RATE_PER_SEC`/`X_USER_BURST`). Callers queue; nothing bursts past the bucket.
- A 429 pauses *all* X traffic until the `x-rate-limit-reset` header's time, then retries with exponential backoff
  (1s, 2s, 4s… capped at 60s, ≤ 3 retries). 5xx retries the same way.
- Request handlers wait at most 20 s in the queue and then fail honestly ("try again shortly"); the worker waits
  up to 10 minutes.
- Failed ingestions retry 4× (30s exponential) and then land in the dead-letter list on `/status` and `/my-world`
  with a Retry button. Budget exhaustion and revoked tokens are terminal (no retry).

## Access control

- `followers` (default): the visitor signs in; we page the **visitor's** `following` list on the **visitor's** token
  until we find the owner. Result cached in Redis: 24 h for a follow, 1 h for a non-follow.
- Any failure (rate limit, network, budget, expired token, following list longer than 5 pages) → `unknown` → the
  visitor stays outside with the real reason. We never fake an admit.
- `public`: no relationship calls at all. `invite`: nobody but the owner enters (invite links are a follow-up).
- The outside view shows the real skyline (positions/heights only; no text, no media) and the landmark text,
  with "Follow @handle to enter".

## Data flow of a build

1. OAuth callback: `users/me` → upsert `User` (tokens encrypted) → create `World{ingestState: queued}` → enqueue
   `first_build` (refused at 100% budget, world marked failed with the reason).
2. Worker: `syncProfile` (followers → boundary radius), then `users/:id/tweets` pages of 100 with
   `tweet.fields=public_metrics,created_at,referenced_tweets,attachments,conversation_id,...` and
   `expansions=attachments.media_keys`. Each page is written with `createMany` before the next is fetched, and a
   progress key in Redis feeds the live "building your world — N posts placed" counter.
3. `ingestState: live`, `nextSyncAt = +6 h`. The scheduler enqueues `incremental` (`since_id = newestPostId`) when
   due, and `metrics_refresh` nightly (re-reads `public_metrics` for posts from the last 30 days, 100 ids per call).
4. Geometry is computed at read time from the stored rows (`lib/world/geometry.ts`), so metric refreshes re-scale
   structures on the next load and the layout is identical everywhere.

## Timelapse

`/my-world → Render timelapse` queues a job. `worker/timelapse.ts` opens
`/w/[handle]/timelapse?key=<hmac>` in headless Chromium, steps `t` from account creation to today across 600 frames,
screenshots each and encodes a 20 s 1280×720 MP4 with ffmpeg into `RENDER_DIR`. The owner downloads it from the
dashboard.

## Scripts

```
npm run dev              # next dev
npm run build            # prisma generate + next build
npm start
npm run worker           # ingestion worker + scheduler
npm run worker:timelapse
npm run db:migrate       # prisma migrate deploy
npm run party:dev / party:deploy
npm run typecheck / lint
```

## Must-haves checklist

- [x] No mock data anywhere; no seed scripts; first world is the operator's own
- [x] Progressive loading: structures are written per page; the client reloads as pages land
- [x] Worlds serve from Postgres when X is down, with a stale banner and the last sync time
- [x] Deep links (`/w/[handle]/post/[id]`) resolve from a cold start and spawn at the structure
- [x] OG image per world drawn from the real structures: handle, structure count, landmark text
- [x] Works in an iframe at tweet-card size (`?embed=1`, `frame-ancestors` for x.com) and full-screen
- [x] Footer: unofficial fan project, not affiliated with or endorsed by X Corp
