/**
 * Who is looking: a guest, a SPA Garden Club member or an Orangerie member. Decides
 * which parts of Mitglieder are open; locked parts stay VISIBLE as teasers.
 *
 * DEMO STATE, not authentication: there is no login yet. Everyone starts as a guest
 * (prospect); the presenter "Ansicht"
 * switch (shown only when the server reports `demoControls`) flips it to show what
 * membership unlocks. Remembered on this device.
 */
import { useSyncExternalStore } from 'react';

import { kvGet, kvSet } from './kv';

import type { Viewer } from '@/lib/access';

export type { Area, Viewer } from '@/lib/access';

const KEY = 'spa.viewer.v1';
const VIEWERS: readonly Viewer[] = ['prospect', 'club', 'orangerie'];

function load(): Viewer {
  const raw = kvGet(KEY);
  return VIEWERS.includes(raw as Viewer) ? (raw as Viewer) : 'prospect';
}

let state: Viewer = load();
const listeners = new Set<() => void>();

export const viewer = {
  get: () => state,
  set(next: Viewer) {
    if (next === state) return;
    state = next;
    kvSet(KEY, next);
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useViewer(): Viewer {
  return useSyncExternalStore(viewer.subscribe, viewer.get, viewer.get);
}

export { canAccess, canOpenLesson } from '@/lib/access';
