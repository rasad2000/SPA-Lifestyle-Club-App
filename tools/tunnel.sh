#!/usr/bin/env bash
# One-off public HTTPS URL for the POC via a Cloudflare QUICK tunnel: no Cloudflare account,
# a random https://<words>.trycloudflare.com URL, gone the moment you Ctrl-C. Meant for
# showing the demo to someone outside the LAN (web build, or an Expo Go build pointed at it
# with EXPO_PUBLIC_API_URL). Not for production — quick tunnels have no uptime guarantee.
#
#   bash tools/tunnel.sh [port]        # default 8790 = the server (API + web build + WS)
#
# Exposure note: everything the server serves becomes public while this runs. The read API
# is public by design; ingest stays bearer-protected (keep INGEST_TOKEN long and random).
set -euo pipefail
PORT="${1:-8790}"
BIN="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")}"

if [ ! -x "$BIN" ]; then
  echo "cloudflared not found — installing the single binary to ~/.local/bin" >&2
  mkdir -p "$HOME/.local/bin"
  curl -fsSL -o "$HOME/.local/bin/cloudflared" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$HOME/.local/bin/cloudflared"
  BIN="$HOME/.local/bin/cloudflared"
fi

if ! curl -fsS "http://127.0.0.1:${PORT}/v1/health" >/dev/null 2>&1; then
  echo "nothing healthy on :${PORT} — start the server first (npm run server)" >&2
  exit 1
fi

echo "Opening a quick tunnel to :${PORT} — look for the https://…trycloudflare.com line below." >&2
exec "$BIN" tunnel --no-autoupdate --url "http://127.0.0.1:${PORT}"
