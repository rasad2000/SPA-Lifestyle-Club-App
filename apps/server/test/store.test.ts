import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IngestChannel, IngestPost, Post, PostThread, PostsPage, type IngestPost as IngestPostIn } from '@spa/contract';
import { openDb, SCHEMA_VERSION } from '../src/db.ts';
import { ingestMedia } from '../src/media.ts';
import {
  CursorError,
  createStore,
  decodeCursor,
  encodeCursor,
  previewText,
  TimestampError,
  UnknownMediaError,
  type Store,
} from '../src/store.ts';
import { GOLD, makePng, tempDir } from './helpers.ts';

let t: ReturnType<typeof tempDir>;
let db: ReturnType<typeof openDb>;
let store: Store;

const put = (sourceId: string, body: IngestPostIn, now?: Date, channel = 'gold-desk') =>
  store.upsertPost(channel, sourceId, IngestPost.parse(body), now);

beforeEach(() => {
  t = tempDir();
  db = openDb(t.dir);
  store = createStore(db);
  store.upsertChannel('gold-desk', IngestChannel.parse(GOLD));
});
afterEach(() => {
  db.close();
  t.cleanup();
});

describe('db', () => {
  it('migrates to the current schema version and reopens idempotently', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
    db = openDb(t.dir); // second open must not re-run migrations
    store = createStore(db);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  });
});

describe('channels', () => {
  it('lists with postCount/lastPostAt, ordered by order then title', () => {
    store.upsertChannel('fx-ideas', IngestChannel.parse({ title: 'FX Ideas', kind: 'signals', order: -1 }));
    put('1', { text: 'a', createdAt: '2026-10-01T10:00:00+02:00' });
    put('2', { text: 'b', createdAt: '2026-10-01T09:00:00Z' });
    const list = store.listChannels();
    expect(list.map((c) => c.id)).toEqual(['fx-ideas', 'gold-desk']);
    const gold = list[1]!;
    expect(gold).toMatchObject({ postCount: 2, lastPostAt: '2026-10-01T09:00:00.000Z', demo: true, access: 'public' });
    expect(list[0]).toMatchObject({ postCount: 0, lastPostAt: null });
  });

  it('re-PUT replaces the channel definition', () => {
    store.upsertChannel('gold-desk', IngestChannel.parse({ ...GOLD, title: 'Renamed', demo: false }));
    expect(store.getChannel('gold-desk')).toMatchObject({ title: 'Renamed', demo: false });
  });
});

describe('upsertPost', () => {
  it('creates, normalizes createdAt to UTC, and conforms to the contract', () => {
    const r = put('100', { text: 'BUY XAUUSD', createdAt: '2026-10-01T12:00:00+02:00' });
    expect(r.isNew).toBe(true);
    expect(r.post.id).toBe('gold-desk:100');
    expect(r.post.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(r.post.editedAt).toBeUndefined();
    expect(() => Post.parse(r.post)).not.toThrow();
  });

  it('identical re-PUT is a no-op: isNew false, unchanged, no editedAt', () => {
    const now1 = new Date('2026-10-01T10:00:00Z');
    put('100', { text: 'same' }, now1);
    const r = put('100', { text: 'same' }, new Date('2026-10-01T11:00:00Z'));
    expect(r).toMatchObject({ isNew: false, changed: false });
    expect(r.post.editedAt).toBeUndefined();
    expect(r.post.createdAt).toBe(now1.toISOString()); // receive time kept, not bumped
  });

  it('a changed re-PUT is an edit: createdAt preserved, editedAt = now', () => {
    put('100', { text: 'v1', createdAt: '2026-10-01T10:00:00Z' });
    const edit = new Date('2026-10-01T10:05:00Z');
    const r = put('100', { text: 'v2' }, edit);
    expect(r).toMatchObject({ isNew: false, changed: true });
    expect(r.post.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(r.post.editedAt).toBe(edit.toISOString());
    expect(r.post.text).toBe('v2');
  });

  it('honours an explicit editedAt / createdAt from the producer', () => {
    put('100', { text: 'v1', createdAt: '2026-10-01T10:00:00Z' });
    const r = put('100', { text: 'v2', createdAt: '2026-10-01T09:00:00Z', editedAt: '2026-10-01T10:01:00Z' });
    expect(r.post.createdAt).toBe('2026-10-01T09:00:00.000Z');
    expect(r.post.editedAt).toBe('2026-10-01T10:01:00.000Z');
  });

  it('rejects timestamps IsoDate accepts but the store cannot keep canonical (regression)', () => {
    // An offset pushes these out of the 4-digit year range: "+010000-…" / "-000001-…".
    for (const bad of ['9999-12-31T23:59:59-01:00', '0000-01-01T00:00:00+01:00', '1999-12-31T23:59:59Z', '2101-01-01T00:00:00Z']) {
      expect(() => put('1', { text: 'x', createdAt: bad }), bad).toThrow(TimestampError);
      expect(() => put('1', { text: 'x', editedAt: bad }), bad).toThrow(TimestampError);
    }
    expect(store.getPost('gold-desk:1')).toBeUndefined(); // rolled back, nothing stored
    expect(put('1', { text: 'x', createdAt: '2026-10-01T10:00:00-01:00' }).post.createdAt).toBe('2026-10-01T11:00:00.000Z');
  });

  it('rejects unknown media ids and de-duplicates repeated ones', () => {
    expect(() => put('1', { text: 'x', mediaIds: ['nope'] })).toThrow(UnknownMediaError);
    const { media } = ingestMedia(db, t.dir, makePng(4, 3));
    const r = put('2', { text: 'chart', mediaIds: [media.id, media.id] });
    expect(r.post.media).toEqual([{ id: media.id, url: media.url, kind: 'image', width: 4, height: 3 }]);
  });
});

describe('replies', () => {
  it('resolves replyTo + preview only when the parent exists in the same channel', () => {
    store.upsertChannel('other', IngestChannel.parse({ title: 'Other', kind: 'stream' }));
    put('1', { text: 'Entry XAUUSD', signal: { pair: 'XAUUSD', direction: 'buy' } });
    put('1', { text: 'other parent' }, undefined, 'other');
    const reply = put('2', { text: 'TP1 hit', replyToSourceId: '1' });
    expect(reply.post.replyTo).toBe('gold-desk:1');
    expect(reply.post.replyPreview).toEqual({ id: 'gold-desk:1', text: 'Entry XAUUSD', hasMedia: false, pair: 'XAUUSD' });
    const orphan = put('3', { text: 'reply to missing', replyToSourceId: '999' });
    expect(orphan.post.replyTo).toBeUndefined();
    expect(orphan.post.replyPreview).toBeUndefined();
    expect(store.getPost('gold-desk:1')!.replyCount).toBe(1);
  });

  it('a new reply reports its parent as related (replyCount changed)', () => {
    put('1', { text: 'parent' });
    const r = put('2', { text: 'child', replyToSourceId: '1' });
    expect(r.related.map((p) => [p.id, p.replyCount])).toEqual([['gold-desk:1', 1]]);
  });

  it('out-of-order ingest heals: a late parent re-links (and reports) its orphan replies', () => {
    put('2', { text: 'child first', replyToSourceId: '1' });
    const parent = put('1', { text: 'parent later' });
    expect(parent.post.replyCount).toBe(1);
    expect(parent.related.map((p) => p.replyTo)).toEqual(['gold-desk:1']);
  });

  it('hard delete: post gone, replies survive without replyTo, parent count drops', () => {
    put('1', { text: 'parent' });
    put('2', { text: 'child', replyToSourceId: '1' });
    put('3', { text: 'grandchild', replyToSourceId: '2' });
    const del = store.deletePost('gold-desk', '2')!;
    expect(del.id).toBe('gold-desk:2');
    expect(del.related.map((p) => p.id).sort()).toEqual(['gold-desk:1', 'gold-desk:3']);
    expect(store.getPost('gold-desk:2')).toBeUndefined();
    const grandchild = store.getPost('gold-desk:3')!;
    expect(grandchild.replyTo).toBeUndefined();
    expect(grandchild.replyPreview).toBeUndefined();
    expect(store.getPost('gold-desk:1')!.replyCount).toBe(0);
    expect(store.thread('gold-desk:3')!.parent).toBeNull();
    expect(store.deletePost('gold-desk', '2')).toBeNull(); // idempotent
  });

  it('thread: parent + replies oldest-first (equal timestamps tie-break by id)', () => {
    put('1', { text: 'root', createdAt: '2026-10-01T10:00:00Z' });
    put('c', { text: 'late', replyToSourceId: '1', createdAt: '2026-10-01T12:00:00Z' });
    put('b', { text: 'tie-b', replyToSourceId: '1', createdAt: '2026-10-01T11:00:00Z' });
    put('a', { text: 'tie-a', replyToSourceId: '1', createdAt: '2026-10-01T11:00:00Z' });
    const th = store.thread('gold-desk:1')!;
    expect(() => PostThread.parse(th)).not.toThrow();
    expect(th.parent).toBeNull();
    expect(th.replies.map((p) => p.sourceId)).toEqual(['a', 'b', 'c']);
    expect(store.thread('gold-desk:a')!.parent!.id).toBe('gold-desk:1');
    expect(store.thread('gold-desk:nope')).toBeUndefined();
  });

  it('editing the parent re-reports replies (their preview is stale)', () => {
    put('1', { text: 'old' });
    put('2', { text: 'child', replyToSourceId: '1' });
    const r = put('1', { text: 'new parent text' });
    expect(r.related.map((p) => p.replyPreview?.text)).toEqual(['new parent text']);
  });
});

describe('previewText', () => {
  it('passes short text through with whitespace collapsed', () => {
    expect(previewText('  TP1\n\n hit  ')).toBe('TP1 hit');
  });

  it('truncates to 160 code points with an ellipsis, never splitting an emoji', () => {
    const long = '🔥'.repeat(200);
    const p = previewText(long);
    expect(Array.from(p)).toHaveLength(160);
    expect(p.endsWith('…')).toBe(true);
    expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
  });

  it('is applied to replyPreview', () => {
    put('1', { text: 'x'.repeat(500) });
    const r = put('2', { text: 'reply', replyToSourceId: '1' });
    expect(Array.from(r.post.replyPreview!.text)).toHaveLength(160);
  });
});

describe('pagination', () => {
  it('pages newest-first across EQUAL timestamps with no skips or duplicates', () => {
    const same = '2026-10-01T10:00:00Z';
    for (let i = 0; i < 7; i++) put(`s${i}`, { text: `same ${i}`, createdAt: same });
    put('old', { text: 'older', createdAt: '2026-09-30T10:00:00Z' });
    put('new', { text: 'newer', createdAt: '2026-10-02T10:00:00Z' });

    const seen: string[] = [];
    let before: string | undefined;
    let pages = 0;
    do {
      const pg = store.page('gold-desk', before, 3);
      expect(() => PostsPage.parse(pg)).not.toThrow();
      seen.push(...pg.posts.map((p) => p.sourceId));
      before = pg.nextBefore ?? undefined;
      pages++;
    } while (before);

    expect(pages).toBe(3);
    expect(seen).toEqual(['new', 's6', 's5', 's4', 's3', 's2', 's1', 's0', 'old']);
  });

  it('same-timestamp posts tie-break in NATURAL id order across pages (9999 before 10000)', () => {
    const same = '2026-10-01T10:00:00Z';
    for (const id of ['9998', '10000', '9999', '10001']) put(id, { text: id, createdAt: same });
    const p1 = store.page('gold-desk', undefined, 2);
    const p2 = store.page('gold-desk', p1.nextBefore!, 2);
    expect([...p1.posts, ...p2.posts].map((p) => p.sourceId)).toEqual(['10001', '10000', '9999', '9998']);
    expect(p2.nextBefore).toBeNull();
  });

  it('returns nextBefore null on the last page and clamps limit', () => {
    put('1', { text: 'only' });
    expect(store.page('gold-desk', undefined, 30).nextBefore).toBeNull();
    expect(store.page('gold-desk', undefined, 10_000).posts).toHaveLength(1);
  });

  it('cursor round-trips and rejects garbage', () => {
    const c = encodeCursor('2026-10-01T10:00:00.000Z', 'gold-desk:1');
    expect(decodeCursor(c)).toEqual({ createdAt: '2026-10-01T10:00:00.000Z', id: 'gold-desk:1', sortKey: '0011' });
    for (const bad of ['', '!!!', Buffer.from('nobar').toString('base64url'), Buffer.from('notadate|x').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(CursorError);
    }
  });
});
