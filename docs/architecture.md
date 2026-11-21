# Architecture

Status: POC (server on port 8790). All type names below are exports of
`@spa/contract` (`packages/contract/src/index.ts`), which is the authority on every shape.

## Components

| Component | Tech | Role |
| --- | --- | --- |
| `packages/contract` | zod v4 | Wire schemas and types, `postId`, `sourceSortKey`, course block schemas, embed URL helpers. Imported by server, app and producers. |
| `apps/server` | Node 22, Hono 4, `@hono/node-server`, `ws` 8, better-sqlite3, tsx | One process: REST read API, bearer ingest API, WebSocket hub, media store, course catalog, static web build. |
| `apps/mobile` | Expo SDK 57, expo-router, React 19.2, RN 0.86 | iOS/Android/web client. Native tabs (Signale / Kurse / Concierge), Liquid Glass with fallbacks, offline cache, live socket. |
| `tools/` | Node and Python | Producers that use only the ingest API: the fictional demo seed (`seed_demo.mjs`) and the live demo. |
| Producer (later) | Any signal source (a Telegram relay, a desk tool) | Pushes a live feed through the same ingest API. |

```
producer ──PUT/DELETE /v1/ingest/*──► app.ts ──► store.ts (one SQLite transaction)
                                         │            │
                                         │            └─► returns post + related posts
                                         └──► live.broadcast(LiveEvent) ──► every WS client
client ──GET /v1/*──► app.ts ──► store.ts / courses.ts
```

Each ingest write and its broadcast happen in the same tick. SQLite access is synchronous
on purpose, so ordering is preserved.

## Data model (SQLite, `apps/server/data/spa.sqlite`)

| Table | Key columns | Notes |
| --- | --- | --- |
| `channels` | `id` (slug), `title`, `subtitle`, `kind`, `access`, `accent`, `demo`, `ord` | Upserted by `PUT /v1/ingest/channels/:id`. No delete API. |
| `posts` | `id` = `postId(channel, source_id)`, `channel`, `source_id`, `text`, `signal_json`, `media_json` (ordered media ids), `reply_to_source_id`, `created_at`, `edited_at`, `updated_seq`, `sort_key` | `created_at` is always canonical UTC `…Z` with milliseconds, so text order matches time order. Index `(channel, created_at DESC, sort_key DESC, id DESC)`. |
| `media` | `id` (first 32 hex of sha256), `file`, `kind`, `width`, `height`, `sha256` (unique), `bytes` | Files in `data/media/<id>.<ext>`, written atomically (tmp + rename). |
| `meta` | `post_seq` | Monotonic counter that survives deletes. |

Migrations are an append-only list keyed by `PRAGMA user_version` (`db.ts`). The DB is
currently at v2. Pragmas: WAL, `synchronous=NORMAL`, foreign keys on, `busy_timeout=5000`.

Derived at read time, never stored: `replyTo` and `replyPreview` (the parent must exist in
the **same** channel; the preview is cut to 160 code points), `replyCount`, and channel
`postCount`/`lastPostAt`.

## API reference

Base: `http://<host>:8790`. Errors are always `ApiError` `{error, details?}`.

### Read API (public, CORS `*`, GET/HEAD/OPTIONS)

| Endpoint | Response | Notes |
| --- | --- | --- |
| `GET /v1/health` | `HealthResponse` `{ok, version, serverTime, posts}` | |
| `GET /v1/channels` | `ChannelsResponse` `{channels: ChannelSummary[]}` | Ordered by `order`, `title`, `id`. |
| `GET /v1/channels/:id/posts?before=&limit=` | `PostsPage` `{posts: Post[], nextBefore}` | Newest first. `limit` 1..100 (default 30), else 400. `before` = previous `nextBefore` (opaque base64url cursor); a bad cursor → 400. Unknown channel → 404. |
| `GET /v1/posts/:id` | `PostThread` `{post, parent, replies}` | `id` = `"<channel>:<sourceId>"`, URL-encoded (`gold-desk%3A2682`). Replies oldest first (capped at 1000). A malformed id → 400, a missing post → 404. |
| `GET /v1/courses` | `CoursesResponse` `{courses: CourseSummary[]}` | Lesson list without blocks, plus `lessonCount` and `totalMin`. |
| `GET /v1/courses/:slug` | `CourseResponse` `{course: Course}` | Clients parse with `LenientCourseResponse`. |
| `GET /media/<sha32>.<jpg\|png\|webp>` | image | `Cache-Control: public, max-age=31536000, immutable`, ETag, Range. Any other name → 404. |
| `GET /content/courses/<slug>/<file>` | asset | Only files a lesson block references (never `course.json`). `no-cache` plus ETag, Range (needed for iOS video). |
| `GET /*` (anything else) | web build | Files from `apps/mobile/dist`, with SPA fallback to `index.html` for route-shaped paths. A missing file with a known extension → 404. `/_expo/static/*` is immutable, HTML is `no-cache`. |

Every other `/v1/*` path returns 404 JSON. `/media*` and `/content*` never fall through to the
app shell.

### Ingest API (`Authorization: Bearer <INGEST_TOKEN>`, no CORS)

`INGEST_TOKEN` unset → every ingest route returns **503** `ingest disabled`. A wrong or missing
token → **401** with `WWW-Authenticate: Bearer`. The token comparison is constant-time
(sha256 of both sides). JSON bodies are limited to 512 KiB (413 above that).

| Endpoint | Body | Response |
| --- | --- | --- |
| `PUT /v1/ingest/channels/:id` | `IngestChannel` (= `Channel` without `id`) | `{channel: ChannelSummary}`; 201 new / 200 updated |
| `POST /v1/ingest/media` | raw image bytes, ≤10 MiB | `IngestMediaResponse` `{media: Media}`; 201 new / 200 known hash. The type is sniffed from magic bytes (jpeg/png/webp), never taken from `Content-Type` → 415 otherwise; 413 if too big; 400 if empty. |
| `PUT /v1/ingest/posts/:channel/:sourceId` | `IngestPost` `{text, signal?, mediaIds[≤10], replyToSourceId?, createdAt?, editedAt?}` | `IngestPostResponse` `{post, isNew}`; 201 new / 200 update |
| `DELETE /v1/ingest/posts/:channel/:sourceId` | none | `{deleted: true\|false, id}`; 200 even if already gone |

`PUT /v1/ingest/posts` returns these 400s: validation failed (zod issues in `details`),
`a post cannot reply to itself`, `empty post (needs text, signal or media)` (the same rule as
a producer's contentless guard), `unknown media` (`details.missing`), and `invalid timestamp`
(outside 2000–2100). An unknown channel → 404.

Upsert semantics (`store.upsertPost`):
- On a new post, `createdAt` defaults to the time the server received it.
- On an update, `editedAt` is set to now if the content changed and the producer didn't send it.
- A byte-identical re-PUT returns `changed: false`, and nothing is broadcast.
- Duplicate `mediaIds` collapse to their first occurrence.

## Live push (`WS /v1/live`)

- **Direction:** server → client only. Client frames are ignored (`maxPayload` 4096).
  An upgrade to any other path → 404. A query string is allowed and ignored.
- **Frames** (`LiveEvent`):
  - `hello {serverTime}` on connect.
  - `ping {serverTime}` every 25 s.
  - `post.upsert {post, isNew}`.
  - `post.delete {id, channel}`.
- **Related fan-out:** one ingest write can change how other posts render, so the server also
  broadcasts `post.upsert` with `isNew: false` for each affected post:
  - a reply bumps its parent's `replyCount`;
  - a new parent re-links waiting replies;
  - an edited parent changes its replies' `replyPreview`;
  - a deleted parent leaves its replies without `replyTo`.

  This is capped at 200 replies per write.
- **Keep-alive:** a protocol ping on the same 25 s tick, and a socket that missed the previous
  pong is terminated. The JSON `ping` exists because browsers and RN can't see protocol pings.
  The app treats about 45 s of silence as dead.
- **No replay, no catch-up.** The server keeps no event log. The client (`api/live.ts`) emits
  `resync` on **every** open, the first included, and screens refetch their head page. That
  refetch is idempotent (`reconcileHead`). Live events that arrive during a head fetch are
  buffered and replayed onto the result.
- **Client lifecycle:**
  - Reconnects with exponential backoff (1 s up to 30 s, ±20 % jitter).
  - The socket is closed only on AppState `background`; iOS `inactive` keeps it.
  - An upsert for a post the client doesn't hold is placed only inside the loaded window,
    otherwise it is left to paging. It counts toward the "N neue" pill only when it lands at the top.
- **Gaps:**
  - There is no `channel.*` event, so channel counts are refreshed by refetching the channel
    list after a post event (at most once per 500 ms).
  - There is no "changes since" endpoint.

## Caching

| Layer | Policy | Why |
| --- | --- | --- |
| `/media/*` | immutable, 1 year | The file name is the content hash, so a new image means a new URL. |
| `/_expo/static/*` | immutable | Expo's hashed bundles. |
| HTML, course assets, other web files | `no-cache` plus ETag | Edited in place, so they are revalidated. |
| App offline cache | Per channel: the last head page. Also the channel list and the courses. Stored in expo-sqlite `kv-store` (native, synchronous reads, so there is no loading flash) or `localStorage` (web). | The app opens with content when offline. Cached JSON is re-validated with the contract on read, and a mismatch is dropped, never a crash. Key prefix `spa.cache.v1.` |

## Why SQLite and a WebSocket for the POC

- **One process, one file.** There is nothing else to run on a box that is already a
  production host. better-sqlite3 is synchronous, so each upsert and its broadcast are
  ordered and atomic with no async coordination.
- **The load is tiny.** Hundreds of posts a day and rows of a few KB. SQLite in WAL mode handles
  a few thousand readers through the API easily. The hosting memo
  ([hosting.md](hosting.md)) sizes a single node for "a few thousand users".
- **A WebSocket rather than SSE or polling:** one long-lived socket per app gives instant
  delivery, and RN has `WebSocket` built in.
- **A hand-rolled WebSocket hub rather than a broker:** a single node means fan-out is a loop
  over sockets.

## Migration path (when it outgrows the POC)

| Need | Step | Seam that keeps it cheap |
| --- | --- | --- |
| More than one server node, or managed backups | Postgres. Port `db.ts`/`store.ts`, which are the only SQL in the codebase. | The `Store` interface. Its routes and the contract don't change. |
| Media off the box | S3-compatible object storage (Hetzner Object Storage) or a CDN. Store `url` as absolute, or keep `/media/` as a redirect. | `Media.url` is a string. The contract requires the `/media/` prefix today, so going absolute needs a small, explicit contract change. |
| Several nodes, live fan-out | Redis pub/sub (or Postgres `LISTEN/NOTIFY`) between nodes. Each node broadcasts to its own sockets. | `publish` is injected into `createApp`. |
| Catch-up after reconnect | `GET /v1/channels/:id/changes?since=<seq>` using the existing `updated_seq` (monotonic, survives deletes), plus a delete log. | `updated_seq` and `meta.post_seq` exist already. |
| Push notifications (app closed) | Expo Push Service (one API in front of APNs and FCM) or direct APNs/FCM. Register device tokens with a new endpoint, and send from the ingest path for `isNew` posts in opted-in channels. | The ingest handler already knows `isNew`. |
| Login and tiers | Auth (e.g. email magic link or OIDC), then gate `access: 'member'` channels and courses in the read API and WS. Course assets are already only servable when referenced. | `Access` enum on `Channel` and `Course`. |
| Per-producer tokens | A token table that scopes each token to channels. | `requireToken` middleware. |
| Media cleanup | A periodic sweep of `media` rows that no post references. | `media_json` holds the ids. |

## Course content source — open decision

Today courses are hand-written `course.json` files read at boot. Real club material
(videos, PDFs, regular updates by the club's editors) needs an editing surface. There are two paths:

| | **A. Directus** (self-hosted headless CMS next to the API) | **B. Keep courses in our server** (JSON → DB) |
| --- | --- | --- |
| Editors edit | Web admin out of the box: drafts, uploads, roles. | We build an admin UI (or keep editing JSON, i.e. a developer in the loop). |
| Schema changes | In the Directus UI, no code. A new block type is a new collection or field. | A migration plus admin UI work each time. |
| Running cost | One more container (Directus plus its own DB) on the same Hetzner VM. | None extra. |
| Coupling | Our server pulls from Directus' REST API and maps records → `Course`/`LessonBlock[]`, so **the app still talks only to our API.** | None. |
| Licence | Check the current Directus licence terms (BSL with a revenue threshold, per directus.io) before committing. *Not verified here.* | n/a |

**Why either path is safe: the forward-compatible `LessonBlock` design (already in the contract)**

- The server schema is **strict for known block types**: heading, paragraph, bullets,
  callout, image, video, embed, file, link. An **unknown `type` passes through** untouched,
  so a new content source can ship a new block before every app understands it.
- Clients parse with **`LenientLessonBlock`**. An unknown or malformed block becomes
  `{type: 'unsupported', originalType, url?}`. The app renders a neutral card ("Inhalt in
  dieser App-Version nicht darstellbar") with "Öffnen" when there is a URL. One odd block
  never takes down a course on an older build.
- Assets: relative paths are rewritten to `/content/courses/<slug>/…`, and absolute URLs
  pass through. A Directus asset URL fits as is.
- So a Directus adapter is a server-side mapping (`Directus item → Course`), cached and
  revalidated. The wire and the app stay unchanged.

**Video hosting trade-off**

- **Unlisted YouTube** (or Vimeo without privacy settings) is free and plays in the provider's
  own player (`embed` block, as the YouTube/Vimeo terms require), but there is **no access
  control**: anyone with the link can watch. That is fine for public teasers and wrong for
  member-only courses.
- **Bunny Stream or Vimeo (paid tiers)** offer signed or expiring URLs and domain restrictions,
  so a member gate can mean something. These cost money; pricing is not researched here.
- Self-hosted MP4 (`video` block, served with `Range`) works for small files but puts the
  bandwidth on our node.

**Recommendation: Directus.** The club's editors get a real editing surface without us building
an admin UI. Schema changes need no deploys. The contract's forward-compat design means the
switch is a server-side adapter, invisible to the app. Pair it with Bunny Stream or Vimeo signed
URLs for member-only video once login exists, and keep YouTube embeds for public material.
