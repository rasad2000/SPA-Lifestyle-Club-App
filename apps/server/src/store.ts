/**
 * Repository over the SQLite schema: channels, posts, media lookups.
 *
 * Semantics mirror a chat relay (e.g. Telegram), the kind of producer this feed is built for:
 *  - a post is addressed by (channel, sourceId); a re-PUT is an EDIT, never a dup;
 *  - delete is HARD (no tombstones, like a chat delete) — replies survive and
 *    simply lose their `replyTo`, exactly like a Telegram reply to a deleted msg;
 *  - `replyTo` is resolved at read time, so out-of-order ingest (reply before
 *    parent) heals itself once the parent arrives.
 */
import {
  postId,
  sourceSortKey,
  IsoDate,
  type Channel,
  type ChannelSummary,
  type IngestChannel,
  type IngestPost,
  type Media,
  type Post,
  type PostThread,
  type PostsPage,
  type SignalLevels,
} from '@spa/contract';
import type { z } from 'zod';
import type { Db } from './db.ts';
import { toMedia, type MediaRow } from './media.ts';

export type ChannelInput = z.output<typeof IngestChannel>;
export type PostInput = z.output<typeof IngestPost>;

export const PAGE_DEFAULT = 30;
export const PAGE_MAX = 100;
export const PREVIEW_CHARS = 160;
/** Upper bound on replies re-broadcast when a parent changes (live-update fan-out). */
const RELATED_REPLY_CAP = 200;
/** Deepest reply chain followed (real data: max 5); also what stops a malformed reply cycle. */
const MAX_THREAD_DEPTH = 50;

/** Normalize any accepted ISO timestamp (with offset) to canonical UTC "…Z". */
export const isoUtc = (s: string | Date): string => new Date(s).toISOString();

const CANONICAL_ISO = /^(\d{4})-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
/** Sane publish-time window; anything outside is a producer bug, not a post date. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/**
 * isoUtc for PRODUCER timestamps, refusing what the contract's IsoDate accepts but
 * the store can't keep: an offset can push a year-9999/0000 date out of the 4-digit
 * range ("+010000-01-01T…", "-000001-…"), which breaks lexical == chronological
 * ordering, fails IsoDate on the way back out (the client rejects the whole page)
 * and makes an undecodable cursor. Throws TimestampError (→ 400).
 */
export function producerTimestamp(s: string, field: string): string {
  const iso = isoUtc(s);
  const m = CANONICAL_ISO.exec(iso);
  const year = m ? Number(m[1]) : NaN;
  if (!m || year < MIN_YEAR || year > MAX_YEAR) {
    throw new TimestampError(`${field} must be between ${MIN_YEAR} and ${MAX_YEAR} (got ${s})`);
  }
  return iso;
}

export class CursorError extends Error {}
export class TimestampError extends Error {}
export class UnknownMediaError extends Error {
  constructor(public readonly missing: string[]) {
    super(`unknown media id(s): ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------- cursor

/** Opaque page cursor: base64url("createdAt|id") of the last post on the page. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: string; id: string; sortKey: string } {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new CursorError('malformed cursor');
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const bar = raw.indexOf('|');
  const createdAt = raw.slice(0, bar);
  const id = raw.slice(bar + 1);
  if (bar <= 0 || !id || !IsoDate.safeParse(createdAt).success) throw new CursorError('malformed cursor');
  const colon = id.indexOf(':');
  // The tiebreak key is derived from the id's sourceId, so the cursor format is unchanged.
  return { createdAt: isoUtc(createdAt), id, sortKey: sourceSortKey(colon >= 0 ? id.slice(colon + 1) : id) };
}

// ---------------------------------------------------------------- preview

/**
 * One-line quote of a parent post: whitespace collapsed, cut on CODE POINTS
 * (the feeds are emoji-heavy; slicing UTF-16 units would split a surrogate pair).
 */
export function previewText(text: string, max = PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

// ---------------------------------------------------------------- rows

interface ChannelRow {
  id: string;
  title: string;
  subtitle: string | null;
  kind: Channel['kind'];
  access: Channel['access'];
  accent: string | null;
  demo: number;
  ord: number;
  post_count: number;
  last_post_at: string | null;
}

/** One row of the threadSummary query: descendant count + the newest descendant. */
interface SummaryRow {
  n: number;
  id: string;
  text: string;
  media_json: string;
  created_at: string;
}

export interface PostRow {
  id: string;
  channel: string;
  source_id: string;
  text: string;
  signal_json: string | null;
  media_json: string;
  reply_to_source_id: string | null;
  created_at: string;
  edited_at: string | null;
  updated_seq: number;
  /** sourceSortKey(source_id): same-createdAt tiebreak (natural order, not raw text). */
  sort_key: string;
}

const toChannelSummary = (r: ChannelRow): ChannelSummary => ({
  id: r.id,
  title: r.title,
  ...(r.subtitle != null ? { subtitle: r.subtitle } : {}),
  kind: r.kind,
  access: r.access,
  ...(r.accent != null ? { accent: r.accent } : {}),
  demo: r.demo === 1,
  order: r.ord,
  postCount: r.post_count,
  lastPostAt: r.last_post_at,
});

export interface UpsertResult {
  post: Post;
  isNew: boolean;
  /** False for a byte-identical re-PUT (no seq bump, nothing to broadcast). */
  changed: boolean;
  /** Other posts whose rendered form changed (parent replyCount, replies' preview/replyTo). */
  related: Post[];
}

export interface DeleteResult {
  id: string;
  channel: string;
  related: Post[];
}

export type Store = ReturnType<typeof createStore>;

export function createStore(db: Db) {
  const q = {
    upsertChannel: db.prepare(`
      INSERT INTO channels (id, title, subtitle, kind, access, accent, demo, ord, updated_at)
      VALUES (@id, @title, @subtitle, @kind, @access, @accent, @demo, @ord, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, subtitle=excluded.subtitle, kind=excluded.kind, access=excluded.access,
        accent=excluded.accent, demo=excluded.demo, ord=excluded.ord, updated_at=excluded.updated_at`),
    channelSummaries: db.prepare(`
      SELECT c.*, COUNT(p.id) AS post_count, MAX(p.created_at) AS last_post_at
      FROM channels c LEFT JOIN posts p ON p.channel = c.id
      GROUP BY c.id ORDER BY c.ord ASC, c.title ASC, c.id ASC`),
    channelSummary: db.prepare(`
      SELECT c.*, COUNT(p.id) AS post_count, MAX(p.created_at) AS last_post_at
      FROM channels c LEFT JOIN posts p ON p.channel = c.id
      WHERE c.id = ? GROUP BY c.id`),
    channelExists: db.prepare(`SELECT 1 FROM channels WHERE id = ?`),
    postById: db.prepare(`SELECT * FROM posts WHERE id = ?`),
    postBySource: db.prepare(`SELECT * FROM posts WHERE channel = ? AND source_id = ?`),
    insertPost: db.prepare(`
      INSERT INTO posts (id, channel, source_id, text, signal_json, media_json, reply_to_source_id, created_at, edited_at, updated_seq, sort_key)
      VALUES (@id, @channel, @source_id, @text, @signal_json, @media_json, @reply_to_source_id, @created_at, @edited_at, @updated_seq, @sort_key)`),
    updatePost: db.prepare(`
      UPDATE posts SET text=@text, signal_json=@signal_json, media_json=@media_json,
        reply_to_source_id=@reply_to_source_id, created_at=@created_at, edited_at=@edited_at, updated_seq=@updated_seq
      WHERE id=@id`),
    deletePost: db.prepare(`DELETE FROM posts WHERE id = ?`),
    sourceIdsLike: db.prepare(`SELECT source_id FROM posts WHERE channel = ? AND source_id LIKE ? ESCAPE '\\'`),
    nextSeq: db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'post_seq' RETURNING value`),
    // Order everywhere: created_at, then sort_key (natural sourceId order), then id —
    // the same rule as the clients' comparator (contract sourceSortKey).
    pageFirst: db.prepare(`
      SELECT * FROM posts WHERE channel = ?
      ORDER BY created_at DESC, sort_key DESC, id DESC LIMIT ?`),
    pageBefore: db.prepare(`
      SELECT * FROM posts WHERE channel = @channel
        AND (created_at < @created_at OR (created_at = @created_at
          AND (sort_key < @sort_key OR (sort_key = @sort_key AND id < @id))))
      ORDER BY created_at DESC, sort_key DESC, id DESC LIMIT @limit`),
    // Same two queries restricted to posts that carry a structured signal ("Trades" view).
    pageFirstSignals: db.prepare(`
      SELECT * FROM posts WHERE channel = ? AND signal_json IS NOT NULL
      ORDER BY created_at DESC, sort_key DESC, id DESC LIMIT ?`),
    pageBeforeSignals: db.prepare(`
      SELECT * FROM posts WHERE channel = @channel AND signal_json IS NOT NULL
        AND (created_at < @created_at OR (created_at = @created_at
          AND (sort_key < @sort_key OR (sort_key = @sort_key AND id < @id))))
      ORDER BY created_at DESC, sort_key DESC, id DESC LIMIT @limit`),
    replies: db.prepare(`
      SELECT * FROM posts WHERE channel = ? AND reply_to_source_id = ?
      ORDER BY created_at ASC, sort_key ASC, id ASC LIMIT ?`),
    replyCount: db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE channel = ? AND reply_to_source_id = ?`),
    // A post's reply TREE (any depth). The depth cap ends a (malformed) reply cycle.
    descendants: db.prepare(`
      WITH RECURSIVE d(source_id, depth) AS (
        SELECT source_id, 1 FROM posts WHERE channel = @channel AND reply_to_source_id = @src
        UNION
        SELECT p.source_id, d.depth + 1 FROM posts p JOIN d ON p.reply_to_source_id = d.source_id
          WHERE p.channel = @channel AND d.depth < ${MAX_THREAD_DEPTH}
      )
      SELECT p.* FROM posts p JOIN (SELECT DISTINCT source_id FROM d) x ON x.source_id = p.source_id
      WHERE p.channel = @channel AND p.source_id != @src
      ORDER BY p.created_at ASC, p.sort_key ASC, p.id ASC LIMIT @limit`),
    threadSummary: db.prepare(`
      WITH RECURSIVE d(source_id, depth) AS (
        SELECT source_id, 1 FROM posts WHERE channel = @channel AND reply_to_source_id = @src
        UNION
        SELECT p.source_id, d.depth + 1 FROM posts p JOIN d ON p.reply_to_source_id = d.source_id
          WHERE p.channel = @channel AND d.depth < ${MAX_THREAD_DEPTH}
      ), x AS (SELECT DISTINCT source_id FROM d WHERE source_id != @src)
      SELECT (SELECT COUNT(*) FROM x) AS n, p.id, p.text, p.media_json, p.created_at
      FROM posts p JOIN x ON x.source_id = p.source_id
      WHERE p.channel = @channel
      ORDER BY p.created_at DESC, p.sort_key DESC, p.id DESC LIMIT 1`),
    mediaById: db.prepare(`SELECT id, file, kind, width, height FROM media WHERE id = ?`),
    postCount: db.prepare(`SELECT COUNT(*) AS n FROM posts`),
  };

  const rowBySource = (channel: string, sourceId: string) =>
    q.postBySource.get(channel, sourceId) as PostRow | undefined;

  function toPost(r: PostRow): Post {
    const signal = r.signal_json ? (JSON.parse(r.signal_json) as SignalLevels) : undefined;
    const media = (JSON.parse(r.media_json) as string[])
      .map((id) => q.mediaById.get(id) as MediaRow | undefined)
      .filter((m): m is MediaRow => m !== undefined)
      .map(toMedia);
    // Only a parent that exists in the SAME channel resolves; a deleted or
    // not-yet-ingested parent leaves the reply as a plain post.
    const parent = r.reply_to_source_id ? rowBySource(r.channel, r.reply_to_source_id) : undefined;
    const replyCount = (q.replyCount.get(r.channel, r.source_id) as { n: number }).n;
    const summary = replyCount > 0 ? (q.threadSummary.get({ channel: r.channel, src: r.source_id }) as SummaryRow | undefined) : undefined;
    return {
      id: r.id,
      channel: r.channel,
      sourceId: r.source_id,
      text: r.text,
      ...(signal ? { signal } : {}),
      media,
      ...(parent
        ? {
            replyTo: parent.id,
            replyPreview: {
              id: parent.id,
              text: previewText(parent.text),
              hasMedia: (JSON.parse(parent.media_json) as string[]).length > 0,
              ...(parent.signal_json ? { pair: (JSON.parse(parent.signal_json) as SignalLevels).pair } : {}),
            },
          }
        : {}),
      replyCount,
      ...(summary && summary.n > 0
        ? {
            thread: {
              updates: summary.n,
              last: {
                id: summary.id,
                text: previewText(summary.text),
                hasMedia: (JSON.parse(summary.media_json) as string[]).length > 0,
                createdAt: summary.created_at,
              },
            },
          }
        : {}),
      createdAt: r.created_at,
      ...(r.edited_at ? { editedAt: r.edited_at } : {}),
    };
  }

  const repliesOf = (channel: string, sourceId: string, cap = RELATED_REPLY_CAP) =>
    q.replies.all(channel, sourceId, cap) as PostRow[];

  /** Parent, grandparent, … up to the root (nearest first). Stops on a cycle or the depth cap. */
  function ancestorsOf(channel: string, parentSourceId: string | null): PostRow[] {
    const out: PostRow[] = [];
    const seen = new Set<string>();
    let src = parentSourceId;
    while (src && !seen.has(src) && out.length < MAX_THREAD_DEPTH) {
      seen.add(src);
      const row = rowBySource(channel, src);
      if (!row) break;
      out.push(row);
      src = row.reply_to_source_id;
    }
    return out;
  }

  // ------------------------------------------------------------ channels

  function upsertChannel(id: string, input: ChannelInput, now = new Date()): ChannelSummary {
    q.upsertChannel.run({
      id,
      title: input.title,
      subtitle: input.subtitle ?? null,
      kind: input.kind,
      access: input.access,
      accent: input.accent ?? null,
      demo: input.demo ? 1 : 0,
      ord: input.order,
      updated_at: isoUtc(now),
    });
    return getChannel(id)!;
  }

  function getChannel(id: string): ChannelSummary | undefined {
    const r = q.channelSummary.get(id) as ChannelRow | undefined;
    return r ? toChannelSummary(r) : undefined;
  }

  const listChannels = (): ChannelSummary[] => (q.channelSummaries.all() as ChannelRow[]).map(toChannelSummary);
  const hasChannel = (id: string): boolean => q.channelExists.get(id) !== undefined;

  // ------------------------------------------------------------ posts

  /** Unknown media ids → UnknownMediaError (the producer must upload first). */
  function checkMedia(ids: string[]): void {
    const missing = ids.filter((id) => q.mediaById.get(id) === undefined);
    if (missing.length) throw new UnknownMediaError(missing);
  }

  const upsertPost = db.transaction(
    (channel: string, sourceId: string, input: PostInput, now: Date = new Date()): UpsertResult => {
      const id = postId(channel, sourceId);
      // Same image twice would duplicate a React key client-side; keep first occurrence.
      const mediaIds = [...new Set(input.mediaIds)];
      checkMedia(mediaIds);
      const next = {
        text: input.text,
        signal_json: input.signal ? JSON.stringify(input.signal) : null,
        media_json: JSON.stringify(mediaIds),
        reply_to_source_id: input.replyToSourceId ?? null,
      };
      const prev = q.postById.get(id) as PostRow | undefined;
      const nowIso = isoUtc(now);

      if (!prev) {
        const row: PostRow = {
          id,
          channel,
          source_id: sourceId,
          ...next,
          created_at: input.createdAt ? producerTimestamp(input.createdAt, 'createdAt') : nowIso,
          edited_at: input.editedAt ? producerTimestamp(input.editedAt, 'editedAt') : null,
          updated_seq: (q.nextSeq.get() as { value: number }).value,
          sort_key: sourceSortKey(sourceId),
        };
        q.insertPost.run(row);
        const related: PostRow[] = [];
        // A new reply bumps its parent's replyCount and every ancestor's thread summary;
        // a new parent re-links orphan replies.
        related.push(...ancestorsOf(channel, row.reply_to_source_id));
        related.push(...repliesOf(channel, sourceId));
        return { post: toPost(row), isNew: true, changed: true, related: related.map(toPost) };
      }

      const contentChanged =
        prev.text !== next.text ||
        prev.signal_json !== next.signal_json ||
        prev.media_json !== next.media_json ||
        prev.reply_to_source_id !== next.reply_to_source_id;
      const created_at = input.createdAt ? producerTimestamp(input.createdAt, 'createdAt') : prev.created_at;
      const edited_at = input.editedAt
        ? producerTimestamp(input.editedAt, 'editedAt')
        : contentChanged
          ? nowIso
          : prev.edited_at;
      const changed = contentChanged || created_at !== prev.created_at || edited_at !== prev.edited_at;
      if (!changed) return { post: toPost(prev), isNew: false, changed: false, related: [] };

      const row: PostRow = {
        ...prev,
        ...next,
        created_at,
        edited_at,
        updated_seq: (q.nextSeq.get() as { value: number }).value,
      };
      q.updatePost.run(row);

      const related = new Map<string, PostRow>();
      // Re-parented, or a reply whose content changed: every ancestor's thread summary
      // (count / latest update) may have changed, on both the old and the new chain.
      if (prev.reply_to_source_id !== next.reply_to_source_id || contentChanged) {
        for (const parentSrc of new Set([prev.reply_to_source_id, next.reply_to_source_id])) {
          for (const a of ancestorsOf(channel, parentSrc)) related.set(a.id, a);
        }
      }
      // Replies quote this post (text / hasMedia / pair) — their preview is now stale.
      if (prev.text !== next.text || prev.media_json !== next.media_json || prev.signal_json !== next.signal_json) {
        for (const r of repliesOf(channel, sourceId)) related.set(r.id, r);
      }
      return { post: toPost(row), isNew: false, changed: true, related: [...related.values()].map(toPost) };
    },
  );

  const deletePost = db.transaction((channel: string, sourceId: string): DeleteResult | null => {
    const prev = rowBySource(channel, sourceId);
    if (!prev) return null;
    q.deletePost.run(prev.id);
    q.nextSeq.get();
    const related: PostRow[] = ancestorsOf(channel, prev.reply_to_source_id); // counts/summaries shrink
    related.push(...repliesOf(channel, sourceId)); // they lose replyTo/replyPreview
    return { id: prev.id, channel, related: related.map(toPost) };
  });

  /** Source ids in `channel` starting with `prefix` (the demo uses this to find its own posts). */
  function sourceIdsWithPrefix(channel: string, prefix: string): string[] {
    const like = prefix.replace(/[\\%_]/g, (m) => `\\${m}`) + '%';
    return (q.sourceIdsLike.all(channel, like) as { source_id: string }[]).map((r) => r.source_id);
  }

  function getPost(id: string): Post | undefined {
    const r = q.postById.get(id) as PostRow | undefined;
    return r ? toPost(r) : undefined;
  }

  /** Newest first; `before` is the previous page's `nextBefore`. Throws CursorError. */
  function page(channel: string, before?: string, limit = PAGE_DEFAULT, opts: { signalsOnly?: boolean } = {}): PostsPage {
    const n = Math.max(1, Math.min(PAGE_MAX, Math.trunc(limit)));
    const [first, older] = opts.signalsOnly ? [q.pageFirstSignals, q.pageBeforeSignals] : [q.pageFirst, q.pageBefore];
    let rows: PostRow[];
    if (before) {
      const c = decodeCursor(before);
      rows = older.all({ channel, created_at: c.createdAt, sort_key: c.sortKey, id: c.id, limit: n + 1 }) as PostRow[];
    } else {
      rows = first.all(channel, n + 1) as PostRow[];
    }
    const hasMore = rows.length > n;
    const pageRows = hasMore ? rows.slice(0, n) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      posts: pageRows.map(toPost),
      nextBefore: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    };
  }

  /** The post, its (same-channel) parent, its direct replies and its whole reply tree, oldest-first. */
  function thread(id: string): PostThread | undefined {
    const r = q.postById.get(id) as PostRow | undefined;
    if (!r) return undefined;
    const parent = r.reply_to_source_id ? rowBySource(r.channel, r.reply_to_source_id) : undefined;
    const ancestors = ancestorsOf(r.channel, r.reply_to_source_id);
    return {
      post: toPost(r),
      parent: parent ? toPost(parent) : null,
      replies: (q.replies.all(r.channel, r.source_id, 1000) as PostRow[]).map(toPost),
      rootId: (ancestors[ancestors.length - 1] ?? r).id,
      timeline: (q.descendants.all({ channel: r.channel, src: r.source_id, limit: 1000 }) as PostRow[]).map(toPost),
    };
  }

  const postCount = (): number => (q.postCount.get() as { n: number }).n;

  return {
    upsertChannel,
    getChannel,
    listChannels,
    hasChannel,
    upsertPost,
    deletePost,
    sourceIdsWithPrefix,
    getPost,
    page,
    thread,
    postCount,
    toPost,
  };
}
