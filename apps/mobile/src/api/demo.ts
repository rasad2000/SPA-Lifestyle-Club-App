/**
 * Presenter demo state, shared by the header button and the feed. Starting asks the
 * server to replay its scripted sequence (POST /v1/demo/run) and hides every post
 * older than the run's `startedAt`, so the feed starts empty and the sequence lands
 * live, one post at a time. Stopping deletes the demo posts server-side and shows
 * the full feed again. Nothing real is deleted: the hiding is client-side only.
 */
import { useSyncExternalStore } from 'react';

import { api } from './client';

export type DemoState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; channel: string; since: string; endsAt: number };

let state: DemoState = { phase: 'idle' };
const listeners = new Set<() => void>();

function set(next: DemoState) {
  state = next;
  listeners.forEach((l) => l());
}

export const demo = {
  get: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async start(): Promise<boolean> {
    if (state.phase === 'starting') return false;
    set({ phase: 'starting' });
    const r = await api.demoRun();
    if (!r.ok) {
      set({ phase: 'idle' });
      return false;
    }
    set({ phase: 'running', channel: r.data.channel, since: r.data.startedAt, endsAt: Date.now() + r.data.durationMs });
    return true;
  },
  async stop(): Promise<void> {
    set({ phase: 'idle' });
    await api.demoReset();
  },
};

export function useDemo(): DemoState {
  return useSyncExternalStore(demo.subscribe, demo.get, demo.get);
}
