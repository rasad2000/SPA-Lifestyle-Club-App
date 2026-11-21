/**
 * API base-URL resolution, as a pure function so every branch is unit-tested.
 *
 * Order (first hit wins):
 *  1. EXPO_PUBLIC_API_URL — explicit, set per EAS build profile / .env.
 *  2. Web: same origin. The feed server serves the exported web build itself,
 *     so the page's own origin IS the API (no CORS, works behind any proxy).
 *     Exception: the Metro dev server (port 8081) is not the API → fall through.
 *  3. Dev on a device: Expo's hostUri ("192.168.1.20:8081") names the dev
 *     machine as the phone sees it; the API runs on that host at port 8790.
 *  4. Fallback: http://127.0.0.1:8790 (simulator on the same machine) — DEV ONLY.
 *     A release build (no Metro hostUri) without EXPO_PUBLIC_API_URL returns null:
 *     loopback on a phone is the phone itself, so "falling back" there just turns
 *     every request into a mysterious network error. The caller surfaces null as
 *     a configuration error instead.
 */
export const API_PORT = 8790;
export const FALLBACK_BASE = `http://127.0.0.1:${API_PORT}`;
const METRO_PORTS = new Set(['8081', '19000', '19006']);

export type BaseUrlInput = {
  envUrl?: string | null;
  platform: string;
  /** window.location.origin on web. */
  origin?: string | null;
  /** expo-constants expoConfig.hostUri, e.g. "192.168.1.20:8081". */
  hostUri?: string | null;
  /** Dev build (__DEV__): the loopback fallback is allowed. Defaults to true. */
  dev?: boolean;
};

export function resolveBaseUrl({ envUrl, platform, origin, hostUri, dev = true }: BaseUrlInput): string | null {
  // typeof guard, not `?.trim()`: on the web export expo-constants' `extra` values
  // are not guaranteed to be what app.config wrote (a non-string here blanked
  // the whole web app at module load), and this runs before any error boundary.
  const explicit = typeof envUrl === 'string' ? envUrl.trim() : '';
  if (explicit) return stripSlash(explicit);

  if (platform === 'web' && typeof origin === 'string' && /^https?:\/\//.test(origin)) {
    const port = safePort(origin);
    if (!port || !METRO_PORTS.has(port)) return stripSlash(origin);
    // Metro serving the web bundle in dev → the API lives on the same host, port 8790.
    const host = safeHostname(origin);
    if (host) return `http://${host}:${API_PORT}`;
  }

  const host = typeof hostUri === 'string' ? hostUri.split('/')[0]?.split(':')[0] : undefined;
  if (host) return `http://${host}:${API_PORT}`;

  return dev ? FALLBACK_BASE : null;
}

/** http(s)://host → ws(s)://host + path. */
export function toWsUrl(base: string, path: string): string {
  return base.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`) + path;
}

/** Server-relative media/lesson URLs ("/media/x.jpg") get the base prefixed. */
export function absolutize(base: string, url: string): string {
  return url.startsWith('/') ? base + url : url;
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function safePort(url: string): string | null {
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
