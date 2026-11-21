/**
 * SQLite storage (better-sqlite3, synchronous on purpose: a single-process
 * feed server with tiny rows gains nothing from async I/O and loses ordering
 * guarantees — every upsert + its broadcast happen in one tick).
 *
 * Schema evolution is a plain ordered list of migrations keyed by
 * `PRAGMA user_version`: append a new entry, never edit a shipped one.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sourceSortKey } from '@spa/contract';

export type Db = Database.Database;

/** SQL, or a function for a step plain SQL can't express (e.g. a JS-computed backfill). */
type Migration = string | ((db: Db) => void);

const MIGRATIONS: readonly Migration[] = [
  // v1 — channels, posts, media, monotonic post sequence.
  `
  CREATE TABLE channels (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    subtitle    TEXT,
    kind        TEXT NOT NULL,
    access      TEXT NOT NULL,
    accent      TEXT,
    demo        INTEGER NOT NULL DEFAULT 0,
    ord         INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
  );

  -- created_at/edited_at are ALWAYS normalized ISO-8601 UTC ("…Z", ms precision),
  -- so lexical order == chronological order and the cursor index works.
  CREATE TABLE posts (
    id                  TEXT PRIMARY KEY,          -- postId(channel, source_id)
    channel             TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    source_id           TEXT NOT NULL,
    text                TEXT NOT NULL DEFAULT '',
    signal_json         TEXT,
    media_json          TEXT NOT NULL DEFAULT '[]', -- ordered media ids
    reply_to_source_id  TEXT,
    created_at          TEXT NOT NULL,
    edited_at           TEXT,
    updated_seq         INTEGER NOT NULL
  );
  CREATE INDEX posts_channel_created ON posts(channel, created_at DESC, id DESC);
  CREATE INDEX posts_channel_reply   ON posts(channel, reply_to_source_id);
  CREATE INDEX posts_updated_seq     ON posts(updated_seq);

  CREATE TABLE media (
    id          TEXT PRIMARY KEY,
    file        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    width       INTEGER,
    height      INTEGER,
    sha256      TEXT NOT NULL UNIQUE,
    bytes       INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );

  -- Monotonic counters that must survive deletes (MAX(updated_seq) would not).
  CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT INTO meta (key, value) VALUES ('post_seq', 0);
  `,
  // v2 — natural-order tiebreak for same-createdAt posts (contract sourceSortKey):
  // ordering by the raw id put "…:9999" after "…:10000". The key is computed in JS
  // (the SAME function every client sorts with), so it is a stored column.
  (db) => {
    db.exec(`ALTER TABLE posts ADD COLUMN sort_key TEXT NOT NULL DEFAULT ''`);
    const set = db.prepare(`UPDATE posts SET sort_key = ? WHERE id = ?`);
    for (const r of db.prepare(`SELECT id, source_id FROM posts`).all() as { id: string; source_id: string }[]) {
      set.run(sourceSortKey(r.source_id), r.id);
    }
    db.exec(`
      DROP INDEX posts_channel_created;
      CREATE INDEX posts_channel_created ON posts(channel, created_at DESC, sort_key DESC, id DESC);
    `);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Apply pending migrations; each runs atomically with its user_version bump. */
export function migrate(db: Db): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(`database schema v${current} is newer than this server (v${MIGRATIONS.length})`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      const step = MIGRATIONS[v]!;
      if (typeof step === 'string') db.exec(step);
      else step(db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return MIGRATIONS.length;
}

/** Open (creating if needed) <dataDir>/spa.sqlite with WAL + FKs, migrated. */
export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'spa.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}
