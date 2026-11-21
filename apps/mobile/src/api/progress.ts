/**
 * Course progress = which lessons were OPENED on this device. There are no accounts
 * yet, so this is a local convenience (kv store), never synced and never shown as
 * "completed"/certified. A tiny external store so every screen updates at once.
 */
import { useSyncExternalStore } from 'react';

import { kvGet, kvSet } from './kv';

const KEY = 'spa.progress.v1.seen';

type Seen = Readonly<Record<string, readonly string[]>>;

function load(): Seen {
  try {
    const raw = kvGet(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [course, lessons] of Object.entries(parsed)) {
      if (Array.isArray(lessons)) out[course] = lessons.filter((l): l is string => typeof l === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

let state: Seen = load();
const listeners = new Set<() => void>();

export const progress = {
  get: (): Seen => state,
  markSeen(course: string, lesson: string): void {
    if (state[course]?.includes(lesson)) return;
    state = { ...state, [course]: [...(state[course] ?? []), lesson] };
    kvSet(KEY, JSON.stringify(state));
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Lesson slugs opened on this device, per course slug. */
export function useSeenLessons(): Seen {
  return useSyncExternalStore(progress.subscribe, progress.get, progress.get);
}

/** Seen count limited to lessons that still exist (a removed lesson must not count). */
export function seenCount(seen: readonly string[] | undefined, lessonSlugs: readonly string[]): number {
  if (!seen) return 0;
  return lessonSlugs.filter((s) => seen.includes(s)).length;
}
