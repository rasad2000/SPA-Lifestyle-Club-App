/**
 * Pure list operations for a newest-first feed. Live events, paging and
 * reconnect-refetch all funnel through here, so ordering/dedup rules live in
 * one tested place instead of being re-derived inside React state updaters.
 *
 * Order: createdAt DESC, ties broken by the contract's natural sourceId order
 * (sourceSortKey — "10000" is newer than "9999"), exactly like the server.
 */
import { sourceSortKey, type Post } from '@spa/contract';

/** createdAt DESC, then the contract's natural sourceId key DESC, then id — the server's ORDER BY. */
export function compareNewestFirst(a: Post, b: Post): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb) return tb - ta;
  const ka = sourceSortKey(a.sourceId);
  const kb = sourceSortKey(b.sourceId);
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Insert a new post at its sorted position, or replace an existing one IN
 * PLACE (an edit must not make the row jump, even if the producer re-sent a
 * different createdAt).
 */
export function upsertPost(posts: readonly Post[], post: Post): Post[] {
  const idx = posts.findIndex((p) => p.id === post.id);
  if (idx >= 0) {
    const next = posts.slice();
    next[idx] = post;
    return next;
  }
  const next = posts.slice();
  let at = next.findIndex((p) => compareNewestFirst(post, p) < 0);
  if (at < 0) at = next.length;
  next.splice(at, 0, post);
  return next;
}

export function removePost(posts: readonly Post[], id: string): Post[] {
  const idx = posts.findIndex((p) => p.id === id);
  if (idx < 0) return posts as Post[];
  return posts.slice(0, idx).concat(posts.slice(idx + 1));
}

/** Append an OLDER page (infinite scroll); duplicates (from live inserts) are skipped. */
export function appendOlder(posts: readonly Post[], older: readonly Post[]): Post[] {
  const seen = new Set(posts.map((p) => p.id));
  return posts.concat(older.filter((p) => !seen.has(p.id)));
}

/**
 * Reconcile a freshly fetched NEWEST page with what the client holds (after a
 * reconnect or pull-to-refresh):
 *  - every post in the fresh page wins (picks up edits made while offline);
 *  - held posts inside the fresh page's time window that the server no longer
 *    returns were deleted while we were away → dropped;
 *  - held posts older than the window are kept (already-loaded deeper pages) —
 *    but only when the held list reaches into the window. If it doesn't, more
 *    posts arrived while offline than one page holds, and splicing would hide a
 *    gap; the held list is discarded and paging restarts from the fresh cursor.
 * `keptOlder` tells the caller whether to keep its own deeper `nextBefore`.
 *
 * Live events that land while the fetch is in flight are NOT this function's
 * job: the fresh page may predate them, so the reducer replays them on top of
 * the result (feed-state.ts `inflight`).
 */
export function reconcileHead(
  posts: readonly Post[],
  fresh: readonly Post[],
): { posts: Post[]; keptOlder: boolean } {
  if (fresh.length === 0) return { posts: [], keptOlder: false };
  const sortedFresh = fresh.slice().sort(compareNewestFirst);
  const oldestFresh = sortedFresh[sortedFresh.length - 1];
  const reachesWindow = posts.some((p) => compareNewestFirst(p, oldestFresh) <= 0);
  if (!reachesWindow) return { posts: sortedFresh, keptOlder: false };
  const freshIds = new Set(sortedFresh.map((p) => p.id));
  const olderKept = posts.filter(
    (p) => !freshIds.has(p.id) && compareNewestFirst(p, oldestFresh) > 0,
  );
  return { posts: sortedFresh.concat(olderKept), keptOlder: olderKept.length > 0 };
}
