/**
 * Reconnect delay: exponential (1s, 2s, 4s … capped at 30s) with ±20% jitter so
 * a server restart doesn't get every client reconnecting in the same tick.
 * `random` is injectable for tests.
 */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 2 - 1) * 0.2;
  return Math.round(Math.min(BACKOFF_MAX_MS, exp * jitter));
}
