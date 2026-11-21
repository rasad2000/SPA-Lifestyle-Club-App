/**
 * WebSocket client for /v1/live (LiveEvent JSON frames, validated with the
 * contract).
 *
 * Lifecycle:
 *  - one shared socket for the whole app (started by the root layout);
 *  - exponential-backoff reconnect (backoff.ts);
 *  - AppState aware: the socket is closed in the background (iOS would suspend
 *    it anyway, and a half-dead socket looks "live" while delivering nothing)
 *    and reopened immediately on foreground;
 *  - a watchdog treats ~45s of silence as a dead connection (the server pings);
 *  - EVERY successful connect emits `resync` — the first one too: anything
 *    published between a screen's initial GET and the socket opening would
 *    otherwise be lost, and a screen whose first fetch failed (offline launch)
 *    would sit in its error/stale state under a green "Live". A head refetch is
 *    cheap and idempotent (reconcileHead), so the duplicate fetch at launch is fine;
 *  - only 'background' tears the socket down: iOS 'inactive' (Control Center,
 *    notification shade, app switcher, Face ID sheet) is a transient overlay, and
 *    dropping + refetching every screen for it would flicker "Offline".
 *
 * State is exposed as a tiny external store for useSyncExternalStore.
 */
import { LiveEvent } from '@spa/contract';
import { AppState, type AppStateStatus } from 'react-native';

import { backoffDelay } from './backoff';
import { LIVE_URL } from './config';

export type LiveState = 'connecting' | 'live' | 'offline';
type EventListener = (event: LiveEvent) => void;
type ResyncListener = () => void;

const SILENCE_TIMEOUT_MS = 45_000;

class LiveClient {
  private ws: WebSocket | null = null;
  private state: LiveState = 'offline';
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private foreground = true;
  private appStateSub: { remove(): void } | null = null;

  private stateListeners = new Set<() => void>();
  private eventListeners = new Set<EventListener>();
  private resyncListeners = new Set<ResyncListener>();

  readonly url = LIVE_URL;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.foreground = AppState.currentState !== 'background';
    this.appStateSub = AppState.addEventListener('change', this.onAppState);
    if (this.foreground) this.connect();
  }

  stop(): void {
    this.started = false;
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.teardown();
    this.setState('offline');
  }

  // ---- external store
  getState = (): LiveState => this.state;
  subscribeState = (fn: () => void): (() => void) => {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  };
  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }
  onResync(fn: ResyncListener): () => void {
    this.resyncListeners.add(fn);
    return () => this.resyncListeners.delete(fn);
  }

  /** Skip the backoff wait (e.g. a "retry" tap). */
  retryNow(): void {
    if (!this.started || this.state === 'live') return;
    this.attempt = 0;
    this.teardown();
    this.connect();
  }

  // ---- internals
  private onAppState = (next: AppStateStatus) => {
    const fg = next !== 'background';
    if (fg === this.foreground) return;
    this.foreground = fg;
    if (fg) {
      this.attempt = 0;
      this.connect();
    } else {
      this.teardown();
      this.setState('offline');
    }
  };

  private connect(): void {
    if (!this.started || !this.foreground || this.ws) return;
    if (!this.url) return; // unconfigured release build: stay 'offline', don't spin on retries
    this.clearRetry();
    this.setState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.setState('live');
      this.armWatchdog();
      this.resyncListeners.forEach((fn) => fn());
    };
    ws.onmessage = (msg) => {
      if (this.ws !== ws) return;
      this.armWatchdog();
      let raw: unknown;
      try {
        raw = JSON.parse(typeof msg.data === 'string' ? msg.data : String(msg.data));
      } catch {
        return;
      }
      const parsed = LiveEvent.safeParse(raw);
      if (!parsed.success) {
        if (__DEV__) console.warn('[live] dropped frame failing contract', parsed.error.issues);
        return;
      }
      this.eventListeners.forEach((fn) => fn(parsed.data));
    };
    ws.onerror = () => {
      // onclose always follows; reconnect is scheduled there.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearWatchdog();
      if (this.started && this.foreground) this.scheduleRetry();
      else this.setState('offline');
    };
  }

  private scheduleRetry(): void {
    this.setState(this.attempt === 0 ? 'connecting' : 'offline');
    const delay = backoffDelay(this.attempt++);
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      // Silent socket: force a reconnect cycle.
      const ws = this.ws;
      this.ws = null;
      try {
        ws?.close();
      } catch {}
      if (this.started && this.foreground) this.scheduleRetry();
    }, SILENCE_TIMEOUT_MS);
  }

  private teardown(): void {
    this.clearRetry();
    this.clearWatchdog();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {}
    }
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private setState(next: LiveState): void {
    if (next === this.state) return;
    this.state = next;
    this.stateListeners.forEach((fn) => fn());
  }
}

export const live = new LiveClient();
