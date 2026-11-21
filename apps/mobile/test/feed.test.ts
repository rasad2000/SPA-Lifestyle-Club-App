import { describe, expect, it } from 'vitest';

import { appendOlder, reconcileHead, removePost, upsertPost } from '../src/api/feed-merge';
import { feedReducer, initialFeedState } from '../src/api/feed-state';
import { applyThreadEvent } from '../src/api/thread-merge';

import { ids, post } from './fixtures';

describe('feed-merge', () => {
  const list = [post('c', 30), post('b', 20), post('a', 10)];

  it('inserts a new post at its sorted position', () => {
    expect(ids(upsertPost(list, post('n', 40)))).toEqual(['n', 'c', 'b', 'a']);
    expect(ids(upsertPost(list, post('m', 15)))).toEqual(['c', 'b', 'm', 'a']);
  });
  it('replaces an edit in place even if createdAt moved', () => {
    const edited = post('b', 50, { text: 'edited' });
    const out = upsertPost(list, edited);
    expect(ids(out)).toEqual(['c', 'b', 'a']);
    expect(out[1].text).toBe('edited');
  });
  it('removes by id and returns the same array when absent', () => {
    expect(ids(removePost(list, 'ch:b'))).toEqual(['c', 'a']);
    expect(removePost(list, 'ch:zz')).toBe(list);
  });
  it('appendOlder skips duplicates', () => {
    expect(ids(appendOlder(list, [post('a', 10), post('z', 5)]))).toEqual(['c', 'b', 'a', 'z']);
  });
  it('reconcileHead drops posts deleted inside the window, keeps deeper ones', () => {
    const held = [post('d', 40), post('c', 30), post('b', 20), post('a', 10)];
    const fresh = [post('e', 50), post('d', 40), post('b', 20)]; // c was deleted offline
    const r = reconcileHead(held, fresh);
    expect(ids(r.posts)).toEqual(['e', 'd', 'b', 'a']);
    expect(r.keptOlder).toBe(true);
  });
  it('same-createdAt posts order by natural sourceId, like the server (10000 newer than 9999)', () => {
    const out = upsertPost([post('9999', 30)], post('10000', 30));
    expect(ids(out)).toEqual(['10000', '9999']);
  });
  it('reconcileHead discards the held list when a gap is possible', () => {
    const held = [post('a', 10)];
    const fresh = [post('z', 59), post('y', 58)];
    expect(reconcileHead(held, fresh)).toEqual({ posts: fresh, keptOlder: false });
  });
});

describe('feedReducer', () => {
  const base = feedReducer(initialFeedState('ch', null), {
    type: 'headLoaded',
    page: { posts: [post('b', 20), post('a', 10)], nextBefore: 'cursor-1' },
  });

  it('counts only genuinely new live posts as unseen', () => {
    let s = feedReducer(base, { type: 'liveUpsert', post: post('c', 30), isNew: true });
    s = feedReducer(s, { type: 'liveUpsert', post: post('c', 30, { text: 'x' }), isNew: false });
    s = feedReducer(s, { type: 'liveUpsert', post: post('c', 30), isNew: true }); // duplicate frame
    expect(s.unseen).toBe(1);
    expect(ids(s.posts)).toEqual(['c', 'b', 'a']);
  });
  it('ignores other channels', () => {
    const other = { ...post('x', 40), channel: 'other' };
    expect(feedReducer(base, { type: 'liveUpsert', post: other, isNew: true })).toBe(base);
    expect(feedReducer(base, { type: 'liveDelete', id: 'ch:a', channel: 'other' })).toBe(base);
  });
  it('pages older and keeps the cursor on failure', () => {
    const more = feedReducer(base, { type: 'moreLoaded', page: { posts: [post('z', 1)], nextBefore: null }, cursor: 'cursor-1' });
    expect(ids(more.posts)).toEqual(['b', 'a', 'z']);
    expect(more.nextBefore).toBeNull();
    const failed = feedReducer(
      { ...base, loadingMore: true },
      { type: 'moreFailed', error: { ok: false, kind: 'network', message: 'x' } },
    );
    expect(failed.nextBefore).toBe('cursor-1');
    expect(failed.loadingMore).toBe(false);
  });
  it('a related re-broadcast (isNew:false) of a post outside the window is ignored, not spliced in', () => {
    // Regression: a "TP1 hit" reply to a days-old entry re-broadcasts that entry with
    // isNew:false; inserting it put it under the window and the next page AFTER it.
    const s = feedReducer(base, { type: 'liveUpsert', post: post('old', 1, { replyCount: 1 }), isNew: false });
    expect(s).toBe(base);
    const more = feedReducer(s, { type: 'moreLoaded', page: { posts: [post('z', 5), post('old', 1)], nextBefore: null }, cursor: 'cursor-1' });
    expect(ids(more.posts)).toEqual(['b', 'a', 'z', 'old']);
  });
  it('isNew but older than the window while more pages exist → left to paging; at the end → inserted', () => {
    expect(feedReducer(base, { type: 'liveUpsert', post: post('back', 1), isNew: true })).toBe(base);
    const end = { ...base, nextBefore: null };
    const s = feedReducer(end, { type: 'liveUpsert', post: post('back', 1), isNew: true });
    expect(ids(s.posts)).toEqual(['b', 'a', 'back']);
    expect(s.unseen).toBe(0); // not at the top → nothing "new" above the reader
  });
  it('a backfilled post landing mid-window is inserted but does not bump the pill', () => {
    const s = feedReducer(base, { type: 'liveUpsert', post: post('mid', 15), isNew: true });
    expect(ids(s.posts)).toEqual(['b', 'mid', 'a']);
    expect(s.unseen).toBe(0);
  });
  it('deleting a counted live post un-counts it', () => {
    let s = feedReducer(base, { type: 'liveUpsert', post: post('c', 30), isNew: true });
    s = feedReducer(s, { type: 'liveUpsert', post: post('d', 40), isNew: true });
    expect(s.unseen).toBe(2);
    s = feedReducer(s, { type: 'liveDelete', id: 'ch:c', channel: 'ch' });
    expect(s.unseen).toBe(1);
    s = feedReducer(s, { type: 'liveDelete', id: 'ch:a', channel: 'ch' });
    expect(s.unseen).toBe(1);
    expect(ids(s.posts)).toEqual(['d', 'b']);
  });
  it('live events during a head fetch survive it: newer post kept, newer edit not overwritten', () => {
    let s = feedReducer(base, { type: 'headStart', refresh: true });
    s = feedReducer(s, { type: 'liveUpsert', post: post('c', 30), isNew: true });
    s = feedReducer(s, { type: 'liveUpsert', post: post('b', 20, { text: 'edited live' }), isNew: false });
    s = feedReducer(s, { type: 'liveDelete', id: 'ch:a', channel: 'ch' });
    // The page was read BEFORE those events.
    s = feedReducer(s, { type: 'headLoaded', page: { posts: [post('b', 20), post('a', 10)], nextBefore: 'cursor-1' } });
    expect(ids(s.posts)).toEqual(['c', 'b']);
    expect(s.posts[1]!.text).toBe('edited live');
    expect(s.inflight).toBeNull();
  });
  it('a stale loadMore landing after a head reset is dropped (its cursor is gone)', () => {
    let s = feedReducer(base, { type: 'moreStart', cursor: 'cursor-1' });
    s = feedReducer(s, { type: 'headStart', refresh: false });
    expect(s.loadingMore).toBe(false);
    s = feedReducer(s, { type: 'headLoaded', page: { posts: [post('y', 58), post('x', 57)], nextBefore: 'cursor-new' } });
    const late = feedReducer(s, { type: 'moreLoaded', page: { posts: [post('deep', 1)], nextBefore: 'cursor-deep' }, cursor: 'cursor-1' });
    expect(ids(late.posts)).toEqual(['y', 'x']);
    expect(late.nextBefore).toBe('cursor-new');
  });
  it('a failed head fetch over cached posts is stale, not empty', () => {
    const cached = initialFeedState('ch', { posts: [post('a', 10)], nextBefore: null });
    const s = feedReducer(cached, { type: 'headFailed', error: { ok: false, kind: 'network', message: 'x' } });
    expect(s.stale).toBe(true);
    expect(s.posts).toHaveLength(1);
  });
});

describe('applyThreadEvent', () => {
  const thread = { post: post('p', 10), parent: post('root', 5), replies: [post('r1', 11), post('r2', 12)] };

  it('appends new replies oldest-first and edits in place', () => {
    const t1 = applyThreadEvent(thread, { type: 'post.upsert', post: post('r3', 13, { replyTo: 'ch:p' }), isNew: true });
    expect(ids(t1.replies)).toEqual(['r1', 'r2', 'r3']);
    const t2 = applyThreadEvent(t1, { type: 'post.upsert', post: post('p', 10, { text: 'neu' }), isNew: false });
    expect(t2.post.text).toBe('neu');
  });
  it('a reply moved to another parent leaves the thread; a re-parented post drops its old parent', () => {
    const moved = applyThreadEvent(thread, { type: 'post.upsert', post: post('r1', 11, { replyTo: 'ch:other' }), isNew: false });
    expect(ids(moved.replies)).toEqual(['r2']);
    const reparented = applyThreadEvent(thread, { type: 'post.upsert', post: post('p', 10, { replyTo: 'ch:new' }), isNew: false });
    expect(reparented.parent).toBeNull();
    const same = applyThreadEvent(thread, { type: 'post.upsert', post: post('p', 10, { replyTo: 'ch:root', text: 'e' }), isNew: false });
    expect(same.parent?.id).toBe('ch:root');
  });
  it('removes deleted replies / parent; unrelated events return the same object', () => {
    expect(ids(applyThreadEvent(thread, { type: 'post.delete', id: 'ch:r1', channel: 'ch' }).replies)).toEqual(['r2']);
    expect(applyThreadEvent(thread, { type: 'post.delete', id: 'ch:root', channel: 'ch' }).parent).toBeNull();
    expect(applyThreadEvent(thread, { type: 'post.upsert', post: post('x', 1), isNew: true })).toBe(thread);
  });
});

describe('applyThreadEvent: trade timeline (any depth)', () => {
  const root = post('root', 10);
  const t1 = post('t1', 11, { replyTo: 'ch:root' });
  const base = { post: root, parent: null, replies: [t1], rootId: 'ch:root', timeline: [t1] };

  it('inserts a nested update in time order and drops deletes', () => {
    const nested = post('t2', 12, { replyTo: 'ch:t1' }); // the desk answering its own update
    const a = applyThreadEvent(base, { type: 'post.upsert', post: nested, isNew: true });
    expect(a.timeline!.map((p) => p.id)).toEqual(['ch:t1', 'ch:t2']);
    const b = applyThreadEvent(a, { type: 'post.delete', id: 'ch:t2', channel: 'ch' });
    expect(b.timeline!.map((p) => p.id)).toEqual(['ch:t1']);
  });

  it('ignores posts outside the tree and keeps the same object', () => {
    const other = post('x', 13, { replyTo: 'ch:elsewhere' });
    expect(applyThreadEvent(base, { type: 'post.upsert', post: other, isNew: true }).timeline).toBe(base.timeline);
  });

  it('an entry re-parented out of the tree leaves it', () => {
    const moved = post('t1', 11, { replyTo: 'ch:elsewhere' });
    expect(applyThreadEvent(base, { type: 'post.upsert', post: moved, isNew: false }).timeline).toEqual([]);
  });
});

describe('feedReducer: Trades view + live arrivals', () => {
  const signal = { pair: 'XAUUSD', direction: 'sell' as const, entries: ['1'], targets: ['2'] };
  const loaded = (signalsOnly: boolean) =>
    feedReducer(initialFeedState('ch', null, signalsOnly), {
      type: 'headLoaded',
      page: { posts: [post('s1', 10, { signal })], nextBefore: null },
    });

  it('the Trades view never inserts chatter, but a new signal goes in and is marked fresh', () => {
    let s = loaded(true);
    s = feedReducer(s, { type: 'liveUpsert', post: post('r1', 11, { replyTo: 'ch:s1' }), isNew: true });
    expect(ids(s.posts)).toEqual(['s1']);
    s = feedReducer(s, { type: 'liveUpsert', post: post('s2', 12, { signal }), isNew: true });
    expect(ids(s.posts)).toEqual(['s2', 's1']);
    expect(s.fresh).toEqual(['ch:s2']);
  });

  it('the parent re-broadcast (new thread summary) updates the held card in place', () => {
    const s = feedReducer(loaded(true), {
      type: 'liveUpsert',
      post: post('s1', 10, { signal, thread: { updates: 1, last: { id: 'ch:r1', text: 'TP1 HIT', hasMedia: false, createdAt: new Date(11_000).toISOString() } } }),
      isNew: false,
    });
    expect(s.posts[0].thread?.last.text).toBe('TP1 HIT');
    expect(s.fresh).toEqual([]);
  });

  it('the Alle view still inserts chatter', () => {
    const s = feedReducer(loaded(false), { type: 'liveUpsert', post: post('c1', 11), isNew: true });
    expect(ids(s.posts)).toEqual(['c1', 's1']);
  });
});
