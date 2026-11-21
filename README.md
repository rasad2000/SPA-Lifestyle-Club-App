# SPA Garden Club (portfolio project)

**SPA Garden Club** is a German-language lifestyle app for a fictional private members' club
(*Society · Prosperity · Abundance*). It brings together editorial stories, events, courses,
member tools and a live trading-feed demo for a German-speaking audience. Built for iOS, Android
and web with Expo, its look is a sunlit white-marble glasshouse, deep crimson and gold, Bodoni
type and Apple Liquid Glass on iOS 26. Everything in it (names, posts, signals and courses) is
fictional demo content.

What it shows:

1. **A home newsletter.** The hall is the app's one background and a picture frame: content
   stays between its rose-covered pillars, and carousels slide into them. News posts open
   into full-screen posters with an app-open transition and swipe down to close; the two
   welcome videos open into articles.
2. **A members area.** Two areas (SPA Garden Club, the Orangerie) with courses, tools and
   links. What a guest can't open stays visible, greyed and marked "Gesperrt". A presenter
   switch previews what guests, club members and Orangerie members see.
3. **Signal feeds.** Structured trade cards (entry zone, stop, take-profit tiles that light
   up as targets are hit), each trade's timeline of desk updates, and a Trades/Alle view.
4. **Live push.** Producers PUT posts to an ingest API and every client receives them at once
   over a WebSocket. The in-app **Demo** button replays a scripted live trade.

There is no login: the audience is demo state. Channels and courses carry an `access` field
(`public` | `member`) for a later gate.

## Demo scope and limitations

This is a working portfolio prototype, **not a product connected to real content or membership
services**. The client, local server, ingest API, REST reads and WebSocket updates work, but their
content sources are demonstrations:

- **Home stories, events and member links** are static sample content in `apps/mobile/src/content/`;
  there is no CMS or remote editorial service.
- **Courses** are four sample catalogs loaded from local `apps/server/content/courses/<slug>/course.json`
  files. There is no external course platform, LMS or remote course catalog connected.
- **Feeds** are populated by `tools/seed_demo.mjs` and the scripted presenter demo. No real Telegram
  channel, market-data provider, news source or trading desk is configured. Connecting a real source
  requires a separate producer that pushes through the ingest API; the app does not fetch one itself.
- **Membership is presentation state, not authentication.** Audience switching happens on the device;
  course progress is stored locally and is not synced to an account.
- **No production backend is provisioned.** A release needs a hosted HTTPS/WSS API, a configured
  `EXPO_PUBLIC_API_URL`, real native identifiers and an actual content producer.

## Architecture at a glance

```
 producers (bearer token)                     server  apps/server  :8790             clients
 ─────────────────────────                   ───────────────────────────────         ─────────────────────
 tools/seed_demo.mjs ─┐                       Hono HTTP + ws
 tools/live_demo.mjs ─┼─ PUT  /v1/ingest/…  ─► ingest ─► SQLite (data/spa.sqlite)
 (any feed producer) ─┘  POST /v1/ingest/media      └─► media/ (content-addressed)
                                                 │
                                                 ├─ GET /v1/…  (REST read API)   ◄──── Expo app (iOS/Android)
                                                 ├─ WS  /v1/live (LiveEvent)    ────►  + offline cache
                                                 ├─ GET /media/<file>, /content/courses/…
 content/courses/<slug>/course.json ─(boot)─►    └─ GET /*  web build (apps/mobile/dist, SPA)  ──► browser
```

The wire format (REST, WebSocket and ingest) is defined in **one** place:
[`packages/contract/src/index.ts`](packages/contract/src/index.ts) (`@spa/contract`, zod v4).

## Quick start

Node 22 or later (the server's better-sqlite3 build is per Node version).

```bash
npm ci
cp apps/server/.env.example apps/server/.env    # once; set INGEST_TOKEN, DEMO_CONTROLS=1 for the Demo button
(cd apps/mobile && npx expo export -p web)      # web build -> apps/mobile/dist (served at /)
npm run server                                  # API + web on http://0.0.0.0:8790 (tsx watch)

export SPA_INGEST_TOKEN=$(sed -n 's/^INGEST_TOKEN=//p' apps/server/.env)
node tools/seed_demo.mjs --replace              # the fictional SPA Gold Desk + FX Ideas feeds
```

Open `http://127.0.0.1:8790/`. To run the app on a phone with Expo Go, see [docs/demo.md](docs/demo.md).

### Phone with Expo Go (SDK 58)

Install the current Expo Go app, keep the phone and workstation on the same Wi-Fi, and set
`HOST=0.0.0.0` in `apps/server/.env`. With the API running, use `npm run mobile` and scan the QR
code (iPhone camera, or inside Expo Go on Android). The app derives the API address from Metro's
LAN address and port `:8790`. Allow Node.js through the workstation firewall on private networks;
both ports `8081` and `8790` must be reachable. Full troubleshooting: [docs/demo.md](docs/demo.md).

Checks:

```bash
npm test                 # contract + server + mobile (vitest)
npm run typecheck        # every workspace
(cd apps/mobile && npx expo lint)
node tools/screenshot.mjs   # end-to-end web check + screenshots (needs Playwright, see tools/README.md)
```

## Repo layout

| Path | What |
| --- | --- |
| `packages/contract/` | `@spa/contract`: zod schemas and types for every wire shape. The single source of truth. |
| `apps/server/` | `@spa/server`: Hono, `ws` and better-sqlite3, run with tsx. Read API, ingest API, live WebSocket, media, courses, static web build, presenter demo. |
| `apps/server/content/courses/` | Course material, one `<slug>/course.json` per course (validated at startup; sample content). |
| `apps/server/data/` | Runtime state: `spa.sqlite` and `media/`. **Gitignored.** |
| `apps/mobile/` | `@spa/mobile`: Expo SDK 58, expo-router, React 19.3, RN 0.88. See [apps/mobile/README.md](apps/mobile/README.md). |
| `tools/` | `seed_demo.mjs`, `live_demo.mjs`, `lib/ingest.mjs` (the one ingest client), `screenshot.mjs`, `make_brand.py` (every brand asset), `tunnel.sh`. Output goes to `tools/out/` (**gitignored**). |
| `deploy/spa-app-server.service` | systemd user unit for the server (not installed). |
| `docs/` | [design](docs/design.md) · [architecture](docs/architecture.md) · [demo](docs/demo.md) · [hosting](docs/hosting.md) · [testflight](docs/testflight.md) |

## Brand assets

The artwork (the glasshouse hall, the monogram and tree-of-life marks, the poster and article
images) was generated text-free with an image model; every word on it (poster titles, the
footer line) is set by `tools/make_brand.py` in Bodoni Moda and Manrope. The generator's
source images live outside the repo; only the derived assets in
`apps/mobile/assets/images/` are committed. Details: [docs/design.md](docs/design.md).
