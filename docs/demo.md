# Running the demo

Node 22 or later. `apps/server/.env` (from `.env.example`, mode 600) holds `PORT=8790`,
`HOST=0.0.0.0`, an `INGEST_TOKEN` and `DEMO_CONTROLS=1`. The feeds are fictional (section 3);
the live part is the in-app Demo button (section 4).

## 1. Start the server

**Option A, in the foreground (simplest):**

```bash
npm run server                       # tsx watch; Ctrl-C stops it cleanly
```

**Option B, as a systemd user service.** The unit is at `deploy/spa-app-server.service`; it is
**not installed or enabled**. To use it:

```bash
cp deploy/spa-app-server.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start spa-app-server.service      # add `enable` only if it should survive reboots
journalctl --user -u spa-app-server.service -f
systemctl --user stop spa-app-server.service       # graceful: WS 1001 close + WAL checkpoint
```

The unit runs `node --import tsx apps/server/src/main.ts` as one process, so `stop` reaches the
server directly. If node is upgraded, fix the absolute node path in the unit.

Check it: `curl -s http://127.0.0.1:8790/v1/health` → `{"ok":true,…}`. The startup line in the
log lists channels, posts, courses, whether ingest is enabled and whether the web build is served.

## 2. Web build

```bash
(cd apps/mobile && npx expo export -p web)     # → apps/mobile/dist
```

The server serves `dist` at `/` only if the directory existed **when it started**, so restart the
server after the first export. Later re-exports are picked up without a restart.

URLs:
- This box: `http://127.0.0.1:8790/`
- LAN: `http://<LAN-IP>:8790/`

Deep links work too (e.g. `/signale/post/gold-desk%3Ag001`, `/mitglieder/trading-basic-academy`).

## 3. Seed or reseed the demo channels

The server must be running.

```bash
export SPA_INGEST_TOKEN=$(sed -n 's/^INGEST_TOKEN=//p' apps/server/.env)
node tools/seed_demo.mjs --replace        # SPA Gold Desk + FX Ideas (fictional)
node tools/lib/ingest.mjs health
```

## 4. Live demo (in-app button)

The server must run with `DEMO_CONTROLS=1` (set in `apps/server/.env`). Then a
**Demo** button appears in the Signale header:

1. Tap **Demo**. The feed empties ("Warte auf Signale …"). It's hidden, nothing is deleted.
2. About 1 s later a **SELL NOW** signal lands, followed by "All entries active", "TP1 HIT"
   (the TP1 tile lights gold), "risk free", "TP2 HIT", a **BUY LIMIT** signal and "TP3 HIT". That
   is about 22 s, all over the live WebSocket, with no reload.
3. Tap **Beenden**. The demo posts are deleted on the server and the full feed is back.

Tapping Demo again restarts the sequence cleanly. From a terminal: `node tools/live_demo.mjs`
(`--reset` to clear).

Automated check and screenshots (Playwright from any local install, `PLAYWRIGHT_MODULE`):
`node tools/screenshot.mjs` → `tools/out/screens/`. It presses the Demo button itself and fails if
the signal doesn't arrive live or the demo posts survive "Beenden".

## 5. iPhone with Expo Go

```bash
cd apps/mobile
npx expo start                 # scan the QR code with the iPhone camera → Expo Go
```

- **The phone must reach both Metro (8081) and the API (8790)** on this box.
  - The app finds the API itself: it takes Metro's host from Expo's `hostUri` and uses port
    8790 (`src/api/base-url.ts`).
  - On the same Wi-Fi/LAN, that works as is.
- **Over Tailscale** (phone on the tailnet), either:
  - force the API: `EXPO_PUBLIC_API_URL=http://<tailnet-ip>:8790 npx expo start`; or
  - make Metro advertise the tailnet IP:
    `REACT_NATIVE_PACKAGER_HOSTNAME=<tailnet-ip> npx expo start`. The API host is then derived
    from it. *(Not re-verified.)*
- **Check the URL in use** by opening `http://<LAN-IP>:8790/v1/health` in the phone's browser;
  it should return JSON. If it does not, check that both devices are on the same Wi-Fi and that
  the workstation firewall allows Node.js on private networks. Expo Go on iOS and Android scans
  the LAN QR code directly; its URL is `exp://<LAN-IP>:8081`.

**In Expo Go vs a development build:**

| Area | Expo Go | Dev / TestFlight build |
| --- | --- | --- |
| Feeds, threads, courses, live push, offline cache | Expected to work. Every native module imported is an Expo SDK module or a common RN library (expo-image, expo-sqlite, expo-video, expo-web-browser, expo-symbols, expo-blur, react-native-webview, reanimated, screens). *Not yet verified on a physical device for SDK 58.* If one is missing, Expo Go shows a red screen naming it. | Works |
| Liquid Glass | Only if Expo Go's own binary was built with Xcode 26 and runs on iOS 26. Otherwise `glass-mode.ts` falls back to blur, tint or solid. | Yes, when built with Xcode 26 on iOS 26 |
| App icon, splash, name, bundle id | Expo Go's own | SPA's |
| Plain-http API (tailnet IP) | Expo Go's own ATS settings apply. *Not verified.* | Needs `SPA_ALLOW_CLEARTEXT=1` (preview) or HTTPS |
| Distribution to others | No | TestFlight ([testflight.md](testflight.md)) |

Expo docs describe Expo Go as a playground "not useful for building production-grade projects"
and recommend development builds for custom native code
(https://docs.expo.dev/get-started/set-up-your-environment/). A dev build is
`eas build --profile development` (the `development` profile in `eas.json`).

## 6. Public HTTPS via Tailscale Funnel (documented, NOT enabled)

This is the route for a phone outside the tailnet or a TestFlight build, which needs HTTPS.

1. **Admin, once:** enable **HTTPS certificates** and **Funnel** for the tailnet (once per
   tailnet).
2. **Start it:** `tailscale funnel --bg 8790`, then check with `tailscale funnel status`.
3. **Use it:**
   - App and API: `https://<host>.<tailnet>.ts.net`
   - Live: `wss://<host>.<tailnet>.ts.net/v1/live`

   DNS can take up to 10 minutes.
4. **Stop it:** `tailscale funnel reset`.

Funnel listens only on 443, 8443 and 10000, is still in beta, and has bandwidth limits that can't
be configured (https://tailscale.com/kb/1223/funnel, https://tailscale.com/kb/1311/tailscale-funnel).
It publishes **everything on 8790**, ingest included, which is protected only by the bearer token.
Keep `INGEST_TOKEN` long, and turn the funnel off after the demo.

## 7. Android phone with Expo Go (same Wi-Fi as the workstation)

Install **Expo Go** from the Play Store. Run `npm run mobile` on the workstation and scan the QR
code with Expo Go. Metro serves the JS over the LAN (`192.168.178.x`), and the app derives the API
URL from Metro's host plus `:8790`, so no tunnel is needed. Android has no Liquid Glass, so the
`Glass` primitive falls back to blur (`expo-blur`); everything else is identical.

## 8. One-off public URL via Cloudflare quick tunnel (no account)

Use this when the viewer isn't on your LAN.

```bash
npm run server            # terminal 1
bash tools/tunnel.sh      # terminal 2 → prints https://<random>.trycloudflare.com
```

- **Web demo:** send that URL. It serves the web build, API and WebSocket. The URL changes on every
  run and dies on Ctrl-C.
- **Expo Go remotely:** start Metro with the API pointed at the tunnel,
  `EXPO_PUBLIC_API_URL=https://<random>.trycloudflare.com npx expo start --tunnel` (in
  `apps/mobile`; `--tunnel` serves the JS bundle through Expo's ngrok integration and may prompt to
  install `@expo/ngrok`). Both processes must stay up while the viewer uses the app.
- `cloudflared` is a single binary in `~/.local/bin` (the script installs it if missing).
