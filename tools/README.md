# Tools (`tools/`)

Every producer here feeds the server **only through the public ingest API**
(`PUT /v1/ingest/channels/:id`, `POST /v1/ingest/media`, `PUT|DELETE /v1/ingest/posts/:channel/:sourceId`,
bearer token). No producer touches the database or imports server code, so any real feed
(a Telegram relay, a desk tool) plugs into the same seam.

| File | What it does |
| --- | --- |
| `lib/ingest.mjs` | The one HTTP client: `createClient({apiUrl, token})` → `putChannel`, `uploadMedia(bytes, type)` → media id, `putPost`, `deletePost`, `listPosts`, `health`. Retries 5xx / 429 / network errors with exponential backoff; a 4xx fails at once with the server's JSON `error` + `details`. Validates bodies against `@spa/contract` before sending. Also a CLI: `push <dir>` replays a snapshot dir. |
| `seed_demo.mjs` | The **fictional** demo feeds: SPA Gold Desk (`gold-desk`, entries + desk follow-ups, dates relative to now) and FX Ideas (`fx-ideas`). Deterministic; `--replace` prunes anything else in those channels. |
| `live_demo.mjs` | Terminal trigger for the server's presenter demo (same as the app's Demo button). |
| `screenshot.mjs` | End-to-end web check: every screen, label checks, the live demo. Playwright is not a dependency here: point `PLAYWRIGHT_MODULE` at any installed `playwright/index.mjs`. |
| `make_brand.py` | Every brand asset in `apps/mobile/assets/images/` (see [docs/design.md](../docs/design.md)). `uv run --no-project --with pillow --with numpy python tools/make_brand.py [--src <selected art dir>]` |
| `tunnel.sh` | A one-off public HTTPS URL (Cloudflare quick tunnel, no account). |

Config for every producer: `--api URL` / `--token T`, else `SPA_API_URL`
(default `http://127.0.0.1:8790`) / `SPA_INGEST_TOKEN` (must equal the server's `INGEST_TOKEN`).

## 1. Demo feeds (`seed_demo.mjs`)

```bash
export SPA_INGEST_TOKEN=$(sed -n 's/^INGEST_TOKEN=//p' apps/server/.env)
node tools/seed_demo.mjs --replace
```

## 2. Presenter demo (`live_demo.mjs`)

The live demo is normally started from the app: the **Demo** button in the Signale header. The
feed empties, then a scripted signal sequence lands live (SELL NOW entry → follow-ups → TP1/TP2/TP3
light up on the card → a BUY LIMIT signal), about 22 s. **Beenden** deletes the demo posts and
shows the feed again. The sequence lives on the server (`apps/server/src/demo.ts`), which must run
with `DEMO_CONTROLS=1`. This script is the same trigger from a terminal:

```bash
node tools/live_demo.mjs            # play it (replaces a running one) and wait until done
node tools/live_demo.mjs --reset    # stop it and delete every demo post
```

Demo posts all have `sourceId`s starting `demo-`; nothing else is ever written or deleted.

## Generic snapshot push

```bash
node tools/lib/ingest.mjs push <snapshot dir> [--replace]   # dir: channel.json + posts.ndjson (+ media files)
node tools/lib/ingest.mjs health
```

## Tests

```bash
node --test tools/test_ingest.mjs
```

`tools/out/` (screenshots, snapshots) is gitignored.
