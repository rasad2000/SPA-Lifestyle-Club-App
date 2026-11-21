/**
 * Offline cache: the last page per channel, the channel list and the courses,
 * so the app opens with content before (or without) the network.
 *
 * Cached JSON is re-validated with the same contract schema on read — a cache
 * written by an older app build must not crash a newer one; it's just dropped.
 */
import {
  ChannelsResponse,
  CoursesResponse,
  LenientCourseResponse,
  PostsPage,
} from '@spa/contract';

import type { Schema } from './client';
import { kvGet, kvSet } from './kv';

const PREFIX = 'spa.cache.v1.';

function read<T>(key: string, schema: Schema<T>): T | null {
  const raw = kvGet(PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    kvSet(PREFIX + key, JSON.stringify(value));
  } catch {
    // unserializable: skip
  }
}

export const cache = {
  channels: {
    get: () => read('channels', ChannelsResponse),
    set: (v: ChannelsResponse) => write('channels', v),
  },
  feed: {
    get: (channel: string) => read(`feed.${channel}`, PostsPage),
    /**
     * Stores the server's newest page exactly as fetched (its nextBefore cursor is
     * opaque to the client, so the page is never truncated or re-cursored here).
     */
    set: (channel: string, v: PostsPage) => write(`feed.${channel}`, v),
  },
  courses: {
    get: () => read('courses', CoursesResponse),
    set: (v: CoursesResponse) => write('courses', v),
  },
  course: {
    // Lenient like the API read: one block this build can't render must not void the cache.
    get: (slug: string) => read(`course.${slug}`, LenientCourseResponse),
    set: (slug: string, v: LenientCourseResponse) => write(`course.${slug}`, v),
  },
  /** Signale view: "trades" (signal cards only, the default) or "all" (every post). */
  feedView: {
    get: (): 'trades' | 'all' => (kvGet(PREFIX + 'feedView') === 'all' ? 'all' : 'trades'),
    set: (v: 'trades' | 'all') => kvSet(PREFIX + 'feedView', v),
  },
  /** Last selected channel on the Signale tab. */
  selectedChannel: {
    get: () => kvGet(PREFIX + 'selectedChannel'),
    set: (id: string) => kvSet(PREFIX + 'selectedChannel', id),
  },
};
