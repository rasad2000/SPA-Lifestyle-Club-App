/**
 * Feed state machine for one channel (pure reducer; the hook in
 * hooks/use-channel-feed.ts wires it to fetch + live). Kept separate so paging,
 * live merging and reconnect-reconciliation are testable without React.
 *
 * Live-merge rules (the server re-broadcasts RELATED posts with isNew:false — a
 * parent whose replyCount changed, up to 200 replies of an edited parent — so a
 * live upsert is not proof the post belongs in the loaded window):
 *  - an id we hold is replaced in place (edits never make a row jump);
 *  - an id we don't hold is inserted ONLY when isNew, and only when it sorts
 *    inside the loaded window — older than our oldest post while more pages
 *    exist means paging will deliver it in its proper place;
 *  - a post counts toward the "N neue" pill only if it lands at the very top;
 *  - in the signals-only ("Trades") view a post without `signal` is never inserted
 *    (its parent's re-broadcast carries the update), and a held post that loses its
 *    signal leaves the list;
 *  - every live INSERT is remembered in `fresh`, so the UI can animate exactly those
 *    rows in (rows mounting because of scrolling or paging must not animate).
 * Live events during a head fetch are buffered (`inflight`) and replayed on the
 * fetched page, because that page may have been read before them.
 */
import type { Post, PostsPage } from '@spa/contract';

import type { ApiFailure } from './client';
import { appendOlder, compareNewestFirst, reconcileHead, removePost, upsertPost } from './feed-merge';

type LiveAction = { type: 'liveUpsert'; post: Post; isNew: boolean } | { type: 'liveDelete'; id: string; channel: string };

export type FeedState = {
  channel: string | null;
  posts: Post[];
  nextBefore: string | null;
  /** True until the first head fetch settles (cached posts may already show). */
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: ApiFailure | null;
  /** Showing cached posts because the network failed. */
  stale: boolean;
  /** Live-inserted posts the user hasn't scrolled up to yet (drives the pill). */
  unseen: number;
  /** Ids counted in `unseen`, so a delete of one of them un-counts it. */
  unseenIds: readonly string[];
  /** Live events received while a head fetch is in flight (null = no fetch). */
  inflight: readonly LiveAction[] | null;
  /** The "Trades" view: only posts carrying a structured signal. */
  signalsOnly: boolean;
  /** Ids inserted by live events (newest last, capped): the rows to animate in. */
  fresh: readonly string[];
};

const FRESH_CAP = 20;

export type FeedAction =
  | { type: 'reset'; channel: string | null; cached: PostsPage | null; signalsOnly?: boolean }
  /** A head fetch (initial / refresh / resync) started; `refresh` shows the spinner. */
  | { type: 'headStart'; refresh: boolean }
  | { type: 'headLoaded'; page: PostsPage }
  | { type: 'headFailed'; error: ApiFailure }
  /** `cursor` = the nextBefore this page was requested with. */
  | { type: 'moreStart'; cursor: string }
  | { type: 'moreLoaded'; page: PostsPage; cursor: string }
  | { type: 'moreFailed'; error: ApiFailure }
  | LiveAction
  | { type: 'markSeen' };

export function initialFeedState(channel: string | null, cached: PostsPage | null, signalsOnly = false): FeedState {
  return {
    channel,
    posts: cached?.posts ?? [],
    nextBefore: cached?.nextBefore ?? null,
    loading: channel != null,
    refreshing: false,
    loadingMore: false,
    error: null,
    stale: false,
    unseen: 0,
    unseenIds: [],
    inflight: null,
    signalsOnly,
    fresh: [],
  };
}

function withUnseen(state: FeedState, unseenIds: readonly string[]): FeedState {
  return { ...state, unseenIds, unseen: unseenIds.length };
}

/** Apply one live event to the list (no buffering). `count` = may add to the pill. */
function applyLive(state: FeedState, action: LiveAction, count: boolean): FeedState {
  if (action.type === 'liveDelete') {
    const posts = removePost(state.posts, action.id);
    if (posts === state.posts) return state;
    const next = { ...state, posts };
    return state.unseenIds.includes(action.id)
      ? withUnseen(next, state.unseenIds.filter((id) => id !== action.id))
      : next;
  }
  const { post, isNew } = action;
  if (state.posts.some((p) => p.id === post.id)) {
    if (state.signalsOnly && !post.signal) return { ...state, posts: removePost(state.posts, post.id) };
    return { ...state, posts: upsertPost(state.posts, post) };
  }
  // Not held: a related re-broadcast (isNew:false) of a post outside our window → ignore.
  if (!isNew) return state;
  if (state.signalsOnly && !post.signal) return state;
  const oldest = state.posts[state.posts.length - 1];
  // Older than everything loaded while more pages exist: paging will deliver it.
  if (oldest && state.nextBefore != null && compareNewestFirst(post, oldest) > 0) return state;
  const posts = upsertPost(state.posts, post);
  const atTop = posts[0]?.id === post.id;
  const next = { ...state, posts, fresh: [...state.fresh.slice(-(FRESH_CAP - 1)), post.id] };
  return count && atTop ? withUnseen(next, [...state.unseenIds, post.id]) : next;
}

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'reset':
      return initialFeedState(action.channel, action.cached, action.signalsOnly ?? false);
    case 'headStart':
      // The hook aborts any loadMore when a head fetch starts (its page could land
      // after a gap-reset and splice a deep page under the fresh head).
      return { ...state, refreshing: action.refresh || state.refreshing, loadingMore: false, inflight: [] };
    case 'headLoaded': {
      const { posts, keptOlder } = reconcileHead(state.posts, action.page.posts);
      let next: FeedState = {
        ...state,
        posts,
        nextBefore: keptOlder ? state.nextBefore : action.page.nextBefore,
        loading: false,
        refreshing: false,
        error: null,
        stale: false,
        unseen: 0,
        unseenIds: [],
        inflight: null,
      };
      for (const live of state.inflight ?? []) next = applyLive(next, live, false);
      return next;
    }
    case 'headFailed':
      return {
        ...state,
        loading: false,
        refreshing: false,
        error: action.error,
        stale: state.posts.length > 0,
        inflight: null,
      };
    case 'moreStart':
      return { ...state, loadingMore: true };
    case 'moreLoaded':
      // A page requested with a cursor we no longer hold (a head fetch reset the
      // list in between) would splice posts under the wrong neighbours: drop it.
      if (action.cursor !== state.nextBefore) return { ...state, loadingMore: false };
      return {
        ...state,
        posts: appendOlder(state.posts, action.page.posts),
        nextBefore: action.page.nextBefore,
        loadingMore: false,
      };
    case 'moreFailed':
      // Keep the cursor so the next onEndReached retries; surface nothing modal.
      return { ...state, loadingMore: false };
    case 'liveUpsert':
    case 'liveDelete': {
      const channel = action.type === 'liveUpsert' ? action.post.channel : action.channel;
      if (channel !== state.channel) return state;
      const next = applyLive(state, action, true);
      if (state.inflight == null) return next;
      return { ...next, inflight: [...state.inflight, action] };
    }
    case 'markSeen':
      return state.unseen === 0 ? state : withUnseen(state, []);
  }
}
