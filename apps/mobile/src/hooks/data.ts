/** Read hooks for channels, courses and post threads. The feed has its own hook. */
import type { ChannelSummary, CourseSummary, LenientCourse, PostThread } from '@spa/contract';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cache } from '@/api/cache';
import { api } from '@/api/client';
import { applyThreadEvent } from '@/api/thread-merge';

import { useLiveEvents } from './use-live';
import { useResource } from './use-resource';

const CHANNEL_REFRESH_DEBOUNCE_MS = 500;

export function useChannels() {
  const r = useResource({
    key: 'channels',
    load: api.channels,
    readCache: cache.channels.get,
    writeCache: cache.channels.set,
  });
  const channels = useMemo<ChannelSummary[]>(
    () => (r.data?.channels ?? []).slice().sort((a, b) => a.order - b.order),
    [r.data],
  );
  // The live socket has no channel event (contract: post.* only), so the
  // summaries' postCount/lastPostAt would go stale while posts stream in. A new
  // or deleted post re-reads the list, debounced so a burst costs one request.
  const { refresh } = r;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLiveEvents({
    onEvent: (e) => {
      if (e.type === 'ping' || (e.type === 'post.upsert' && !e.isNew)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, CHANNEL_REFRESH_DEBOUNCE_MS);
    },
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { ...r, channels };
}

export function useCourses() {
  const r = useResource({
    key: 'courses',
    load: api.courses,
    readCache: cache.courses.get,
    writeCache: cache.courses.set,
  });
  const courses = useMemo<CourseSummary[]>(
    () => (r.data?.courses ?? []).slice().sort((a, b) => a.order - b.order),
    [r.data],
  );
  return { ...r, courses };
}

export function useCourse(slug: string | undefined) {
  const r = useResource({
    key: slug ? `course:${slug}` : null,
    load: (signal) => api.course(slug!, signal),
    readCache: () => (slug ? cache.course.get(slug) : null),
    writeCache: (v) => slug && cache.course.set(slug, v),
  });
  return { ...r, course: (r.data?.course ?? null) as LenientCourse | null };
}

/**
 * A post with its parent and replies, kept current by live events: edits of
 * any of the three are applied in place, new replies append (oldest first),
 * deletes remove (applyThreadEvent; events during a refetch are replayed onto
 * its result by useResource). A delete of the post itself flips `deleted`.
 */
export function usePostThread(postId: string | undefined) {
  const r = useResource<PostThread>({
    key: postId ? `thread:${postId}` : null,
    load: (signal) => api.thread(postId!, signal),
    reduceLive: applyThreadEvent,
  });
  const [deletedId, setDeletedId] = useState<string | null>(null);
  useLiveEvents({
    onEvent: (e) => {
      if (e.type === 'post.delete' && e.id === postId) setDeletedId(e.id);
    },
  });
  return { ...r, thread: r.data, deleted: deletedId != null && deletedId === postId };
}

/** Server health (version, post count, clock) for the Info tab. Never cached: it's a live probe. */
export function useHealth() {
  const r = useResource({ key: 'health', load: api.health });
  return { ...r, health: r.data };
}
