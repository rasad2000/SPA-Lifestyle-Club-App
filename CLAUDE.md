# CLAUDE.md

SPA Garden Club: a portfolio project. A German, light-only Expo app (a fictional private
members' club with a trading desk, courses and a newsletter) with a small feed/course server.
Producers push posts through a bearer-token ingest API, and clients read REST and get live
updates over a WebSocket. Every name, post, signal and course in it is fictional.
Overview: `README.md`. Design (identity, layout, the trade cockpit): `docs/design.md`.
Server design: `docs/architecture.md`.

## Routing table — where things live

| Concern | Location |
| --- | --- |
| **Wire contract**: every REST response, `LiveEvent`, ingest body, `postId`, the ordering key `sourceSortKey`, course/`LessonBlock` schemas (strict on the server, `Lenient*` on the client), embed helpers `youtubeId`/`vimeoRef`/`embedPlayerUrl` | `packages/contract/src/index.ts` |
| Server entry: one startup line, graceful SIGTERM/SIGINT (WS close 1001, WAL checkpoint, 5 s force-exit) | `apps/server/src/main.ts` |
| Config: env plus optional `apps/server/.env` (real env wins). `PORT`, `HOST`, `DATA_DIR`, `INGEST_TOKEN` (unset = ingest **503**), `WEB_DIR`, `CONTENT_DIR`. Paths are anchored to `apps/server/` | `apps/server/src/config.ts`, `.env.example` |
| Wiring config → db → store → courses → app → HTTP → WS (also used by the e2e test) | `apps/server/src/server.ts` |
| HTTP routes: read API (CORS `*`, GET only), ingest (bearer, no CORS), `/media`, `/content/courses`, SPA fallback | `apps/server/src/app.ts` |
| SQLite schema plus append-only migrations (`PRAGMA user_version`; v2 = `sort_key`) | `apps/server/src/db.ts` |
| Repository: upsert/delete semantics, read-time reply resolution, `replyPreview`, cursor paging, `related` fan-out, `producerTimestamp` | `apps/server/src/store.ts` |
| WebSocket hub `/v1/live`: hello, 25 s protocol ping plus JSON `ping`, broadcast | `apps/server/src/live.ts` |
| Media ingest: type from magic bytes (jpeg/png/webp, ≤10 MiB), dimensions from the header, sha256 dedup, content-addressed file name | `apps/server/src/media.ts` |
| Course loader: validated at boot (**refuses to start** on a bad file), relative asset rewrite, only referenced assets are servable | `apps/server/src/courses.ts` |
| Path-traversal-safe static files, ETag, `Range` | `apps/server/src/static.ts` |
| Course material | `apps/server/content/courses/<slug>/course.json` (+ assets) |
| App routes: Home `(home)/` at `/`, Mitglieder `mitglieder/` (areas, `[slug]`, `[slug]/[lesson]`), Signale `signale/` (feed, `post/[id]`) | `apps/mobile/src/app/` |
| Home + members-area placeholder content (news posts, videos, webinar, sessions, events, tools, links) | `apps/mobile/src/content/home.ts`, `content/members.ts` |
| Audience (demo state, NOT auth: guest / club / Orangerie): viewer store + pure access rule; presenter "Ansicht" switch only with `demoControls` | `apps/mobile/src/api/viewer.ts`, `src/lib/access.ts` |
| Design system: the SPA day palette (ivory, crimson, gold), Bodoni Moda, the monogram + tree-of-life marks, the hall as picture frame | `docs/design.md` |
| The hall as PICTURE FRAME: background at the root (`app/_layout.tsx`), pillar inset `useFrame().pad` (every screen pads to it), in-frame tab titles, carousels (peek + page dots) that dissolve into the pillars | `apps/mobile/src/ui/frame.ts`, `ui/ScreenTitle.tsx`, `components/Carousel.tsx`, `components/EdgeFade.tsx` (+ `.web.tsx`) |
| Card → full-screen page with an app-open transition, swipe-down-to-close (shrinks back into the card): `Expander` + `ExpandSource`; pages: news (pulsing swipe arrows, text slides in as the image darkens) and the video article | `apps/mobile/src/components/Expander.tsx`, `components/home/NewsPage.tsx`, `components/home/ArticlePage.tsx` |
| Base URL resolution (`EXPO_PUBLIC_API_URL` → web same-origin → Metro `hostUri`:8790 → loopback, dev only) | `apps/mobile/src/api/base-url.ts` |
| Live socket client (backoff, AppState, 45 s watchdog, `resync` on every open) | `apps/mobile/src/api/live.ts`, `backoff.ts` |
| Pure feed/thread reducers (live merge, unseen pill, head reconcile) | `apps/mobile/src/api/feed-state.ts`, `feed-merge.ts`, `thread-merge.ts` |
| Offline cache (expo-sqlite kv-store natively, localStorage on web; re-validated on read) | `apps/mobile/src/api/cache.ts`, `kv.ts`, `kv.web.ts` |
| Data hooks | `apps/mobile/src/hooks/` |
| Display helpers: dates, timeframes, order types, non-breaking units; card-duplicate text hiding | `apps/mobile/src/lib/format.ts`, `signal-text.ts` |
| Every user-visible string (German) | `apps/mobile/src/i18n/de.ts` |
| Theme tokens (`palette`, `colors` incl. `glassCard`/`glassStrong`/`glassSoft`/`goldWash`/`shadow`, `gradient()`, `CARD_SHEEN`) + fonts, `Glass`, `Button`, `Segmented`, `SectionTitle`, `Locked`, `textures` (background, mark, article materials). No colour literals in components: add a token | `apps/mobile/src/ui/` |
| Tab-switch transition (wraps each tab root; first child must stay the scroll view) | `apps/mobile/src/ui/TabEnter.tsx` |
| Trade cockpit: Trades/Alle toggle, trade state (dead = all TPs / stopped / closed), card footer from `post.thread`, timeline screen (root + `?focus=`), live-arrival animation | `components/feed/ViewToggle.tsx`, `lib/trade.ts`, `components/feed/PostCard.tsx`, `app/signale/post/[id].tsx`, `ui/Enter.tsx` (all under `apps/mobile/src/`) |
| On-device course progress ("angesehen", no accounts) | `apps/mobile/src/api/progress.ts` |
| Broker link store (PARKED since the Concierge tab went, 2026-10-15): on-device only, simulated check | `apps/mobile/src/api/broker-link.ts` |
| App config: bundle id (placeholder `club.spa.garden`), `EXPO_PUBLIC_API_URL`, `SPA_ALLOW_CLEARTEXT`, `SPA_EAS_PROJECT_ID`; WhatsApp link `EXPO_PUBLIC_WHATSAPP_URL` (Home, read in `src/content/home.ts`) | `apps/mobile/app.config.ts` |
| EAS build profiles (development / preview / production) | `apps/mobile/eas.json` |
| Expo agent rules (always check versioned docs; `npx expo install`) | `apps/mobile/AGENTS.md` |
| The one ingest HTTP client (retry on 5xx/429/network, fail fast on 4xx) plus the `push <dir>` / `health` CLI and `pruneChannel` | `tools/lib/ingest.mjs` |
| Fictional demo feeds (SPA Gold Desk with desk follow-ups, FX Ideas), deterministic, dates relative to now | `tools/seed_demo.mjs` |
| Presenter demo: scripted live sequence (server, `DEMO_CONTROLS=1`, only `demo-` sourceIds), in-app Demo button + feed filter, terminal trigger | `apps/server/src/demo.ts`, `apps/mobile/src/api/demo.ts` + `components/DemoButton.tsx`, `tools/live_demo.mjs` |
| One-off public HTTPS URL (Cloudflare quick tunnel, no account) | `tools/tunnel.sh` |
| Web screenshots plus end-to-end live check (Playwright from any local install, `PLAYWRIGHT_MODULE`) | `tools/screenshot.mjs` |
| Every brand image (hall 1080×2340, symbol, monogram icon set, typeset news posters, Licht/Glas article frames) from the text-free generated art, which lives outside the repo | `tools/make_brand.py` |
| systemd user unit (not installed) | `deploy/spa-app-server.service` |
| Runtime state (gitignored) | `apps/server/data/` (`spa.sqlite`, `media/`), `tools/out/` |

## Invariants / gotchas

- **The contract is the single source of truth for the wire.** Server, app and every
  producer import `@spa/contract`. Don't change it on your own; a real gap gets a
  minimal additive change that you call out. Two response shapes are not schematized there
  yet: `PUT /v1/ingest/channels/:id` → `{channel}` and `DELETE …` → `{deleted, id}`.
- **Ingest is idempotent by `(channel, sourceId)`.** `sourceId` is the producer's own stable
  id (e.g. a Telegram message id). Re-PUT = edit, never a duplicate. A byte-identical
  re-PUT changes nothing and broadcasts nothing. The server id is derived:
  `postId = "<channel>:<sourceId>"`.
- **Delete is hard, with no tombstones.** Like a chat delete: no tombstone.
  Replies survive and lose `replyTo`. DELETE of a missing post returns `200 {deleted:false}`
  (safe for producer retries), and an unknown channel returns 404.
- **Reply TREES:** `post.thread` (update count + newest update, any depth) and
  `PostThread.timeline` / `rootId` come from recursive queries (`store.ts`, depth-capped at 50
  so a malformed reply cycle can't hang). Any new, edited, re-parented or deleted reply
  re-broadcasts EVERY ancestor, so a trade card updates live even for a nested answer.
  `?only=signals` pages signal posts only (the Trades view).
- **Replies resolve at read time, same channel only**, so a reply that arrives before its
  parent heals once the parent lands. `replyToSourceId` equal to the post's own id → 400.
- **Media URLs are server-relative** (`/media/<sha32>.<ext>`), and clients prefix their base.
  Upload media first (`POST /v1/ingest/media`), then reference `mediaIds`. An unknown id → 400.
  Media files are immutable (cached for a year) and are **never garbage-collected** after a delete.
- **Ordering:** `createdAt DESC`, then `sourceSortKey(sourceId)` (natural order, so "10000" is
  newer than "9999"), then id. The server's ORDER BY and every client comparator **must** use
  the same key, or paging and live inserts disagree.
- **Timestamps** are ISO-8601 UTC. Producer timestamps outside 2000–2100 → 400 `invalid timestamp`.
- **Live has no replay.** There is no "changes since" endpoint, so the client refetches the head
  on **every** socket open, the first one included. There is no channel event either: a new or
  renamed channel only shows after a channel-list refetch.
- **Feed data stays out of git.** `apps/server/data/` (the sqlite file, media) and `tools/out/`
  (screenshots, snapshots) are gitignored. The demo feeds are fictional and reproducible
  (`tools/seed_demo.mjs`); never commit a real channel's posts.
- **Courses are club-owned content**, kept apart from the feeds. `course.area` (`club`/`orangerie`)
  places a course in Mitglieder; `lesson.preview` keeps a lesson open to non-members. The four
  courses are sample content (subtitle starts with "Beispielinhalt"). A malformed
  `course.json` stops the server from starting. That is deliberate: the author sees it at once.
- **German UI.** Every string goes in `apps/mobile/src/i18n/de.ts`. Prices stay strings,
  shown exactly as the producer wrote them. The app shows the risk notice ("Keine Anlageberatung") on
  feeds and threads.
- **Never put a view before a screen's scroll view** (e.g. a backdrop). react-native-screens
  finds the content scroll view by walking FIRST children only, so iOS large-title collapse,
  scroll-edge glass and tap-tab-to-top break. The hall background lives at the app ROOT,
  behind the navigator (theme + stack `contentStyle` transparent), never inside a screen. On
  ANDROID, NativeTabs' `backgroundColor` paints the whole tabs container (not just the bar)
  and hides the hall: keep it `transparent` there (`AppTabs.tsx`); `TabBarFloor` in
  `app/_layout.tsx` draws the bar's floor. And `Animated.event` with `useNativeDriver: true` returns an OBJECT on
  native: only `Animated.ScrollView`/`FlatList` accept it, never call it yourself. Web hides both
  bugs, so check native-only paths against the RN source, not just the web build.
- **Expo SDK churn.** SDK 58 APIs differ from training data (NativeTabs uses the stable import
  `expo-router/native-tabs`). Check the versioned docs
  (`https://docs.expo.dev/versions/v58.0.0/`) and installed types in `node_modules`, not memory.
  Add native deps with `npx expo install`, never plain `npm install`.
- **Release builds need `EXPO_PUBLIC_API_URL`.** Without it they show a German config error
  instead of calling loopback. `SPA_ALLOW_CLEARTEXT=1` (Android cleartext plus iOS
  `NSAllowsArbitraryLoads`) is for POC/preview builds only. The bundle id `club.spa.garden` is a
  **placeholder** and is permanent once uploaded to App Store Connect.

## How to add a channel / course / producer

- **Channel:** `PUT /v1/ingest/channels/<slug>` with an `IngestChannel` body (`title`, `kind`
  `stream|signals`, optional `subtitle`/`accent`/`order`/`access`, plus `demo: true` for snapshots).
  It returns 201 when new, 200 on update. There is **no channel delete API**. To remove a channel,
  prune its posts (`pruneChannel` / `--replace`) and delete the row by hand, with the server stopped.
- **Course:** create `apps/server/content/courses/<slug>/course.json` (the `slug` must equal the
  directory name, lesson slugs must be unique). Put assets next to it and reference them by
  relative path in `image`/`video`/`file` blocks. Third-party video goes in an `embed` block
  (YouTube/Vimeo in their own player). Restart the server; it validates at boot.
- **Producer:** use `tools/lib/ingest.mjs` (`createClient`), or speak HTTP to the contract:
  put the channel first, upload media first, PUT parents before replies, use a **stable**
  `sourceId`, set `createdAt` from the source, send `DELETE` for removals, and retry 5xx/429.
  Ingest must never be a producer's critical path: a producer queues and retries, and a down server never blocks its source.
- After any change: `npm test`, `npm run typecheck`, `(cd apps/mobile && npx expo lint)`.
  For tools: `node --test tools/test_ingest.mjs`; for the UI, `node tools/screenshot.mjs` and look at the screens.

## Run / operate

- **Dev server:** `npm run server` (`tsx watch`, port 8790, `0.0.0.0`). One-off: `npm run start -w @spa/server`.
- **As a service:** `deploy/spa-app-server.service` (systemd user unit, `node --import tsx …`).
  It is **not installed**; steps are in `docs/demo.md`.
- **Web build:** `(cd apps/mobile && npx expo export -p web)` → `apps/mobile/dist`. The server only
  serves it if the directory exists **at startup**.
- **App dev:** `npm run mobile` (= `expo start` in `apps/mobile`). On a phone, the API URL is
  derived from Metro's host plus `:8790`, or set `EXPO_PUBLIC_API_URL`.
- **Seeding and demo:** `tools/README.md`. The producer token is `SPA_INGEST_TOKEN`, which must
  equal the server's `INGEST_TOKEN`.
- **Health:** `curl -s http://127.0.0.1:8790/v1/health` or `node tools/lib/ingest.mjs health`.
- **Exposure:** LAN. Public HTTPS through Tailscale Funnel or a Cloudflare quick tunnel
  (`tools/tunnel.sh`) is documented in `docs/demo.md`. Keep `INGEST_TOKEN` strong if anything goes public.
- **Node 22+.** The server's better-sqlite3 binary is built per Node version; on an older Node
  the server tests die with SIGSEGV, not an assertion.
