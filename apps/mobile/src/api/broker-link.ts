/**
 * Broker link (Concierge): the e-mail a member registered with at the club's partner
 * broker. A real flow would check that e-mail against the
 * broker's affiliate data server-side and unlocks access. The POC has no accounts
 * and no broker API, so the link lives on THIS DEVICE only, is never sent anywhere,
 * and its "verification" is simulated by the screen (badged "Demo").
 */
import { useSyncExternalStore } from 'react';

import { kvGet, kvSet } from './kv';

const KEY = 'spa.broker.v1';

export type BrokerLink = { email: string; linkedAt: string };

function load(): BrokerLink | null {
  try {
    const raw = kvGet(KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof (v as BrokerLink).email === 'string') {
      const { email, linkedAt } = v as BrokerLink;
      return { email, linkedAt: typeof linkedAt === 'string' ? linkedAt : '' };
    }
  } catch {
    // corrupt → treat as unlinked
  }
  return null;
}

let state: BrokerLink | null = load();
const listeners = new Set<() => void>();

function set(next: BrokerLink | null) {
  state = next;
  kvSet(KEY, next ? JSON.stringify(next) : '');
  listeners.forEach((l) => l());
}

export const brokerLink = {
  get: () => state,
  link: (email: string) => set({ email: email.trim(), linkedAt: new Date().toISOString() }),
  unlink: () => set(null),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useBrokerLink(): BrokerLink | null {
  return useSyncExternalStore(brokerLink.subscribe, brokerLink.get, brokerLink.get);
}

/** Deliberately loose: one "@", a dot in the domain, no spaces. */
export function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

/** "jonas@gmail.com" → "j••••@gmail.com" (shown on screen; the full address stays in the field state). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  return `${user[0]}${'•'.repeat(Math.min(4, Math.max(1, user.length - 1)))}@${domain}`;
}
