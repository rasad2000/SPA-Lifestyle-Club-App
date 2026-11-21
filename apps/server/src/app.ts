/**
 * HTTP surface (Hono). A factory over injected deps so tests drive it with
 * `app.request(...)` against a temp DB — no sockets, no globals.
 *
 * Read API is public + CORS-open (GET only). Ingest is bearer-protected and
 * deliberately gets NO CORS headers: producers are server-side processes
 * (a relay, a seed tool), never browsers.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { z } from 'zod';
import {
  IngestChannel,
  IngestPost,
  Slug,
  SourceId,
  type ApiError,
  type ChannelsResponse,
  type CourseResponse,
  type CoursesResponse,
  type DemoResetResponse,
  type DemoRunResponse,
  type HealthResponse,
  type IngestMediaResponse,
  type IngestPostResponse,
  type LiveEvent,
} from '@spa/contract';
import type { Config } from './config.ts';
import { courseAssetUrl, type CourseCatalog } from './courses.ts';
import type { Db } from './db.ts';
import { createDemo } from './demo.ts';
import { MAX_MEDIA_BYTES, MEDIA_FILE_RE, MediaError, ingestMedia, mediaDir } from './media.ts';
import { CONTENT_TYPES, IMMUTABLE, REVALIDATE, fileResponse, resolveInside, safeSegments, statFile } from './static.ts';
import { CursorError, PAGE_DEFAULT, PAGE_MAX, TimestampError, UnknownMediaError, type Store } from './store.ts';

export interface AppDeps {
  config: Pick<Config, 'dataDir' | 'ingestToken' | 'webDir' | 'contentDir' | 'version' | 'demoControls' | 'demoChannel'>;
  db: Db;
  store: Store;
  courses: CourseCatalog;
  /** Live fan-out (the WebSocket hub in production, a recorder in tests). */
  publish: (event: LiveEvent) => void;
}

const JSON_BODY_MAX = 512 * 1024;

const fail = (c: Context, status: 400 | 401 | 403 | 404 | 413 | 415 | 500 | 503, error: string, details?: unknown) =>
  c.json({ error, ...(details !== undefined ? { details } : {}) } satisfies ApiError, status);

/** Constant-time bearer check: hash both sides so lengths match and nothing leaks via timing. */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Parse + validate a JSON body; returns a 400 Response on failure. */
async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, 400, 'invalid JSON body');
  }
  const r = schema.safeParse(raw);
  return r.success ? r.data : fail(c, 400, 'validation failed', r.error.issues);
}

function param<S extends z.ZodType<string>>(c: Context, name: string, schema: S, label: string): string | Response {
  const r = schema.safeParse(c.req.param(name));
  return r.success ? r.data : fail(c, 400, `invalid ${label}`, r.error.issues);
}

export function createApp(deps: AppDeps): Hono {
  const { config, store, courses, publish } = deps;
  const app = new Hono();
  const webDir = existsSync(config.webDir) ? config.webDir : null;

  /** Broadcast an upsert/delete plus every post whose rendered form it changed. */
  const publishUpsert = (post: IngestPostResponse['post'], isNew: boolean, related: IngestPostResponse['post'][]) => {
    publish({ type: 'post.upsert', post, isNew });
    for (const p of related) publish({ type: 'post.upsert', post: p, isNew: false });
  };

  app.onError((err, c) => {
    console.error('[spa-server] unhandled', err);
    return fail(c, 500, 'internal error');
  });

  // CORS for the read side only (Expo dev server / web build on another origin); the
  // presenter demo endpoints also take POST from there.
  const readCors = cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] });
  const demoCors = cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'] });
  app.use('*', (c, next) =>
    c.req.path.startsWith('/v1/ingest') ? next() : c.req.path.startsWith('/v1/demo/') ? demoCors(c, next) : readCors(c, next),
  );

  // ------------------------------------------------------------------ read API

  app.get('/v1/health', (c) =>
    c.json({
      ok: true,
      version: config.version,
      serverTime: new Date().toISOString(),
      posts: store.postCount(),
      ...(config.demoControls ? { demoControls: true } : {}),
    } satisfies HealthResponse),
  );

  // ------------------------------------------------------------------ presenter demo (DEMO_CONTROLS=1)

  if (config.demoControls) {
    const demo = createDemo({ store, channel: config.demoChannel, publishUpsert, publish });
    app.post('/v1/demo/run', (c) => {
      if (!store.hasChannel(config.demoChannel)) return fail(c, 404, 'demo channel not found');
      return c.json(demo.run() satisfies DemoRunResponse);
    });
    app.post('/v1/demo/reset', (c) => c.json(demo.reset() satisfies DemoResetResponse));
  }

  app.get('/v1/channels', (c) => c.json({ channels: store.listChannels() } satisfies ChannelsResponse));

  app.get('/v1/channels/:id/posts', (c) => {
    const id = param(c, 'id', Slug, 'channel id');
    if (id instanceof Response) return id;
    if (!store.hasChannel(id)) return fail(c, 404, 'channel not found');
    const limitRaw = c.req.query('limit');
    const limit = limitRaw === undefined ? PAGE_DEFAULT : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) {
      return fail(c, 400, `limit must be an integer 1..${PAGE_MAX}`);
    }
    const only = c.req.query('only');
    if (only !== undefined && only !== 'signals') return fail(c, 400, 'only must be "signals"');
    try {
      return c.json(store.page(id, c.req.query('before') || undefined, limit, { signalsOnly: only === 'signals' }));
    } catch (e) {
      if (e instanceof CursorError) return fail(c, 400, 'invalid cursor');
      throw e;
    }
  });

  app.get('/v1/posts/:id', (c) => {
    // "channel:sourceId" — a slug can't contain ':', so the FIRST colon splits unambiguously.
    const raw = c.req.param('id');
    const colon = raw.indexOf(':');
    if (colon < 1 || !Slug.safeParse(raw.slice(0, colon)).success || !SourceId.safeParse(raw.slice(colon + 1)).success) {
      return fail(c, 400, 'invalid post id (expected "channel:sourceId")');
    }
    const t = store.thread(raw);
    return t ? c.json(t) : fail(c, 404, 'post not found');
  });

  app.get('/v1/courses', (c) => c.json({ courses: courses.summaries() } satisfies CoursesResponse));

  app.get('/v1/courses/:slug', (c) => {
    const slug = param(c, 'slug', Slug, 'course slug');
    if (slug instanceof Response) return slug;
    const course = courses.get(slug);
    return course ? c.json({ course } satisfies CourseResponse) : fail(c, 404, 'course not found');
  });

  // ------------------------------------------------------------------ ingest API (bearer)

  const requireToken: MiddlewareHandler = async (c, next) => {
    if (!config.ingestToken) return fail(c, 503, 'ingest disabled');
    const m = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '');
    if (!tokenMatches(m?.[1]?.trim(), config.ingestToken)) {
      c.header('WWW-Authenticate', 'Bearer');
      return fail(c, 401, 'unauthorized');
    }
    await next();
  };
  app.use('/v1/ingest/*', requireToken);

  const jsonLimit = bodyLimit({ maxSize: JSON_BODY_MAX, onError: (c) => fail(c, 413, 'body too large') });

  app.put('/v1/ingest/channels/:id', jsonLimit, async (c) => {
    const id = param(c, 'id', Slug, 'channel id');
    if (id instanceof Response) return id;
    const body = await readBody(c, IngestChannel);
    if (body instanceof Response) return body;
    const existed = store.hasChannel(id);
    return c.json({ channel: store.upsertChannel(id, body) }, existed ? 200 : 201);
  });

  app.put('/v1/ingest/posts/:channel/:sourceId', jsonLimit, async (c) => {
    const channel = param(c, 'channel', Slug, 'channel id');
    if (channel instanceof Response) return channel;
    const sourceId = param(c, 'sourceId', SourceId, 'source id');
    if (sourceId instanceof Response) return sourceId;
    const body = await readBody(c, IngestPost);
    if (body instanceof Response) return body;
    if (!store.hasChannel(channel)) return fail(c, 404, 'channel not found');
    if (body.replyToSourceId === sourceId) return fail(c, 400, 'a post cannot reply to itself');
    // Structural guard: a post with no text, no signal and no media has nothing to render → reject.
    if (!body.text.trim() && !body.signal && body.mediaIds.length === 0) {
      return fail(c, 400, 'empty post (needs text, signal or media)');
    }
    try {
      const r = store.upsertPost(channel, sourceId, body);
      if (r.changed) publishUpsert(r.post, r.isNew, r.related);
      return c.json({ post: r.post, isNew: r.isNew } satisfies IngestPostResponse, r.isNew ? 201 : 200);
    } catch (e) {
      if (e instanceof UnknownMediaError) return fail(c, 400, 'unknown media', { missing: e.missing });
      if (e instanceof TimestampError) return fail(c, 400, 'invalid timestamp', e.message);
      throw e;
    }
  });

  app.delete('/v1/ingest/posts/:channel/:sourceId', (c) => {
    const channel = param(c, 'channel', Slug, 'channel id');
    if (channel instanceof Response) return channel;
    const sourceId = param(c, 'sourceId', SourceId, 'source id');
    if (sourceId instanceof Response) return sourceId;
    if (!store.hasChannel(channel)) return fail(c, 404, 'channel not found');
    // Idempotent: deleting an already-gone post is a success, not an error (producer retries).
    const r = store.deletePost(channel, sourceId);
    if (!r) return c.json({ deleted: false, id: `${channel}:${sourceId}` });
    publish({ type: 'post.delete', id: r.id, channel: r.channel });
    for (const p of r.related) publish({ type: 'post.upsert', post: p, isNew: false });
    return c.json({ deleted: true, id: r.id });
  });

  app.post(
    '/v1/ingest/media',
    bodyLimit({ maxSize: MAX_MEDIA_BYTES, onError: (c) => fail(c, 413, `media exceeds ${MAX_MEDIA_BYTES} bytes`) }),
    async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      try {
        const r = ingestMedia(deps.db, config.dataDir, bytes);
        return c.json({ media: r.media } satisfies IngestMediaResponse, r.isNew ? 201 : 200);
      } catch (e) {
        if (e instanceof MediaError) return fail(c, e.status, e.message);
        throw e;
      }
    },
  );

  app.all('/v1/*', (c) => fail(c, 404, 'not found'));

  // ------------------------------------------------------------------ static

  app.on(['GET', 'HEAD'], '/media/:file', (c) => {
    // Content-addressed names only: anything else (incl. any traversal attempt) is a 404.
    const file = c.req.param('file');
    if (!MEDIA_FILE_RE.test(file)) return fail(c, 404, 'not found');
    const path = resolveInside(mediaDir(config.dataDir), [file]);
    const stat = path ? statFile(path) : null;
    return path && stat ? fileResponse(c.req.raw, path, stat, IMMUTABLE) : fail(c, 404, 'not found');
  });

  app.on(['GET', 'HEAD'], '/content/courses/*', (c) => {
    const rest = new URL(c.req.url).pathname.slice('/content/courses/'.length);
    const segs = safeSegments(rest);
    if (!segs || segs.length < 2 || !Slug.safeParse(segs[0]).success) return fail(c, 404, 'not found');
    // Only files a lesson block references (never course.json / drafts in the folder).
    // Compared in the canonical encoded form the catalog rewrote the block URL to.
    if (!courses.hasAsset(courseAssetUrl(segs[0]!, segs.slice(1)))) return fail(c, 404, 'not found');
    const path = resolveInside(`${config.contentDir}/courses`, segs);
    const stat = path ? statFile(path) : null;
    // Course assets are edited in place (not content-addressed) → revalidate via ETag.
    return path && stat ? fileResponse(c.req.raw, path, stat, REVALIDATE) : fail(c, 404, 'not found');
  });

  // Server-owned prefixes never fall through to the SPA: a bad media URL must be a
  // clean 404 for an image client / health probe, not a 200 HTML app shell.
  app.on(['GET', 'HEAD'], ['/media', '/media/*', '/content', '/content/*'], (c) => fail(c, 404, 'not found'));

  // Exported Expo web build with SPA fallback. Works for both "single" (index.html)
  // and "static" (per-route .html) export modes.
  app.on(['GET', 'HEAD'], '*', (c) => {
    if (!webDir) return fail(c, 404, 'not found');
    const rawPath = new URL(c.req.url).pathname;
    const segs = safeSegments(rawPath);
    // Not a servable FILE path, but it may still be an app ROUTE: the thread
    // screen's URL carries a post id ("/post/gold-desk%3A2892"), and ':' is
    // outside the file charset. Such a path never touches the filesystem — it
    // just gets index.html. Traversal attempts ("..", encoded "/") stay 404.
    if (!segs) return isAppRoute(rawPath) ? serveIndex(c, webDir) : fail(c, 404, 'not found');
    const candidates: string[][] = segs.length
      ? [segs, [...segs.slice(0, -1), `${segs[segs.length - 1]}.html`], [...segs, 'index.html']]
      : [['index.html']];
    for (const cand of candidates) {
      const path = resolveInside(webDir, cand);
      const stat = path ? statFile(path) : null;
      if (path && stat) return fileResponse(c.req.raw, path, stat, webCache(cand));
    }
    // A missing asset (a known file type) must 404, not masquerade as HTML. Only
    // KNOWN extensions count: a post id may contain a dot ("demo-2026.10.08").
    const ext = segs.length ? extname(segs[segs.length - 1]!).toLowerCase() : '';
    if (ext && ext in CONTENT_TYPES) return fail(c, 404, 'not found');
    return serveIndex(c, webDir);
  });

  return app;
}

/** Route-shaped path: every decoded segment is id-safe (contract SourceId charset) and not "."/"..". */
const ROUTE_SEGMENT_RE = /^[A-Za-z0-9._:~@+-]+$/;
function isAppRoute(rawPath: string): boolean {
  return rawPath
    .split('/')
    .filter((p) => p !== '')
    .every((p) => {
      let seg: string;
      try {
        seg = decodeURIComponent(p);
      } catch {
        return false;
      }
      return seg !== '.' && seg !== '..' && ROUTE_SEGMENT_RE.test(seg);
    });
}

function serveIndex(c: Context, webDir: string): Response {
  const index = resolveInside(webDir, ['index.html'])!;
  const stat = statFile(index);
  return stat ? fileResponse(c.req.raw, index, stat, REVALIDATE) : fail(c, 404, 'not found');
}

/** Expo's hashed bundles are content-addressed → immutable; HTML and the rest revalidate. */
function webCache(segs: string[]): string {
  return segs[0] === '_expo' && segs[1] === 'static' ? IMMUTABLE : REVALIDATE;
}
