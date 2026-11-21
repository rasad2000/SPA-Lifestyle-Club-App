/**
 * One channel's feed: cached first page → network head → older pages on
 * demand, with live upserts/deletes merged in and a head reconciliation after
 * every live reconnect (see api/feed-state.ts for the rules). `signalsOnly` is the
 * "Trades" view (server-side filter, its own cache entry).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { cache } from '@/api/cache';
import { api } from '@/api/client';
import { feedReducer, initialFeedState } from '@/api/feed-state';

import { useLiveEvents } from './use-live';

const PAGE_SIZE = 25;

/** Cache key per channel + view; the plain channel id stays the "all" view's key (older caches still load). */
const cacheKey = (channel: string, signalsOnly: boolean) => (signalsOnly ? `${channel}~trades` : channel);

export function useChannelFeed(channelId: string | null, signalsOnly = false) {
  const [state, dispatch] = useReducer(feedReducer, channelId, (ch) =>
    initialFeedState(ch, ch ? cache.feed.get(cacheKey(ch, signalsOnly)) : null, signalsOnly),
  );

  // Channel or view switch → reset from that cache (render-time adjustment avoids a
  // frame of the previous list).
  if (state.channel !== channelId || state.signalsOnly !== signalsOnly) {
    dispatch({
      type: 'reset',
      channel: channelId,
      cached: channelId ? cache.feed.get(cacheKey(channelId, signalsOnly)) : null,
      signalsOnly,
    });
  }

  const headCtrl = useRef<AbortController | null>(null);
  const moreCtrl = useRef<AbortController | null>(null);

  const loadHead = useCallback(
    (mode: 'initial' | 'refresh' | 'resync') => {
      if (!channelId) return;
      headCtrl.current?.abort();
      // A loadMore in flight could land after this head resets the list (gap) and
      // splice a deep page under the fresh head; the reducer also drops such a page
      // by its cursor, aborting just saves the request.
      moreCtrl.current?.abort();
      const ctrl = new AbortController();
      headCtrl.current = ctrl;
      dispatch({ type: 'headStart', refresh: mode === 'refresh' });
      api.posts(channelId, { limit: PAGE_SIZE, signalsOnly }, ctrl.signal).then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          cache.feed.set(cacheKey(channelId, signalsOnly), res.data);
          dispatch({ type: 'headLoaded', page: res.data });
        } else {
          dispatch({ type: 'headFailed', error: res });
        }
      });
    },
    [channelId, signalsOnly],
  );

  useEffect(() => {
    moreCtrl.current?.abort();
    loadHead('initial');
    return () => {
      headCtrl.current?.abort();
      moreCtrl.current?.abort();
    };
  }, [loadHead]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!channelId || s.loadingMore || s.loading || !s.nextBefore) return;
    const ctrl = new AbortController();
    moreCtrl.current = ctrl;
    const cursor = s.nextBefore;
    dispatch({ type: 'moreStart', cursor });
    api.posts(channelId, { before: cursor, limit: PAGE_SIZE, signalsOnly }, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      dispatch(res.ok ? { type: 'moreLoaded', page: res.data, cursor } : { type: 'moreFailed', error: res });
    });
  }, [channelId, signalsOnly]);

  useLiveEvents({
    onEvent: (e) => {
      if (e.type === 'post.upsert') dispatch({ type: 'liveUpsert', post: e.post, isNew: e.isNew });
      else if (e.type === 'post.delete') dispatch({ type: 'liveDelete', id: e.id, channel: e.channel });
    },
    onResync: () => loadHead('resync'),
  });

  const refresh = useCallback(() => loadHead('refresh'), [loadHead]);
  const markSeen = useCallback(() => dispatch({ type: 'markSeen' }), []);

  return {
    ...state,
    hasMore: state.nextBefore != null,
    refresh,
    loadMore,
    markSeen,
  };
}
