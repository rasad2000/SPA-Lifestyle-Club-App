import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  ChannelsResponse,
  CourseResponse,
  CoursesResponse,
  HealthResponse,
  IngestMediaResponse,
  IngestPostResponse,
  LiveEvent,
  PostThread,
  PostsPage,
} from '@spa/contract';
import { tokenMatches } from '../src/app.ts';
import { MAX_MEDIA_BYTES } from '../src/media.ts';
import { AUTH, GOLD, json, makeEnv, makeJpeg, makePng, tempDir, TOKEN, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeEach(() => (env = makeEnv()));
afterEach(() => env.cleanup());

const req = (path: string, init?: RequestInit) => env.app.request(path, init);
const putChannel = (id = 'gold-desk', body: unknown = GOLD) => req(`/v1/ingest/channels/${id}`, { method: 'PUT', ...json(body, AUTH) });
const putPost = (src: string, body: unknown, channel = 'gold-desk') =>
  req(`/v1/ingest/posts/${channel}/${src}`, { method: 'PUT', ...json(body, AUTH) });

describe('ingest auth', () => {
  it('missing or wrong bearer → 401 with WWW-Authenticate', async () => {
    for (const headers of [{} as Record<string, string>, { authorization: 'Bearer wrong' }, { authorization: TOKEN }, { authorization: `Basic ${TOKEN}` }]) {
      const r = await req('/v1/ingest/channels/gold-desk', { method: 'PUT', ...json(GOLD, headers) });
      expect(r.status).toBe(401);
      expect(r.headers.get('www-authenticate')).toBe('Bearer');
      expect(ApiError.parse(await r.json()).error).toBe('unauthorized');
    }
    for (const path of ['/v1/ingest/posts/gold-desk/1', '/v1/ingest/media']) {
      expect((await req(path, { method: path.endsWith('media') ? 'POST' : 'DELETE' })).status).toBe(401);
    }
  });

  it('no token configured → 503 ingest disabled on every ingest route, even with a header', async () => {
    env.cleanup();
    env = makeEnv({ ingestToken: undefined });
    const calls: Array<[string, string]> = [
      ['PUT', '/v1/ingest/channels/gold-desk'],
      ['PUT', '/v1/ingest/posts/gold-desk/1'],
      ['DELETE', '/v1/ingest/posts/gold-desk/1'],
      ['POST', '/v1/ingest/media'],
    ];
    for (const [method, path] of calls) {
      const r = await req(path, { method, ...json({}, AUTH) });
      expect(r.status).toBe(503);
      expect((await r.json()).error).toBe('ingest disabled');
    }
  });

  it('ingest gets no CORS headers; read API does', async () => {
    expect((await putChannel()).headers.get('access-control-allow-origin')).toBeNull();
    expect((await req('/v1/channels', { headers: { origin: 'http://localhost:8081' } })).headers.get('access-control-allow-origin')).toBe('*');
  });

  it('tokenMatches is exact', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN + 'x', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
  });
});

describe('ingest validation', () => {
  it('bad JSON / schema violations → 400 with issues', async () => {
    const badJson = await req('/v1/ingest/channels/gold-desk', { method: 'PUT', body: '{nope', headers: { ...AUTH, 'content-type': 'application/json' } });
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).error).toBe('invalid JSON body');

    const bad = await putChannel('gold-desk', { title: '', kind: 'chat' });
    expect(bad.status).toBe(400);
    const body = ApiError.parse(await bad.json());
    expect(body.error).toBe('validation failed');
    expect((body.details as Array<{ path: string[] }>).map((i) => i.path[0]).sort()).toEqual(['kind', 'title']);

    await putChannel();
    const badSignal = await putPost('1', { text: 'x', signal: { pair: 'XAUUSD', direction: 'long' } });
    expect(badSignal.status).toBe(400);
  });

  it('path params validated with Slug / SourceId', async () => {
    expect((await putChannel('Gold_Sniper')).status).toBe(400);
    await putChannel();
    expect((await putPost('a%20b', { text: 'x' })).status).toBe(400);
    expect((await putPost('x'.repeat(129), { text: 'x' })).status).toBe(400);
  });

  it('unknown channel → 404; empty post, self-reply, unknown media → 400', async () => {
    expect((await putPost('1', { text: 'x' }, 'nope')).status).toBe(404);
    await putChannel();
    expect((await putPost('1', { text: '   ' })).status).toBe(400);
    expect((await putPost('1', { text: 'x', replyToSourceId: '1' })).status).toBe(400);
    const m = await putPost('1', { text: 'x', mediaIds: ['deadbeef'] });
    expect(m.status).toBe(400);
    expect(await m.json()).toEqual({ error: 'unknown media', details: { missing: ['deadbeef'] } });
  });

  it('an out-of-range timestamp is a 400, never a stored non-ISO date (regression)', async () => {
    await putChannel();
    const r = await putPost('1', { text: 'x', createdAt: '9999-12-31T23:59:59-01:00' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid timestamp');
    expect((await req('/v1/posts/gold-desk%3A1')).status).toBe(404);
  });
});

describe('ingest → read API', () => {
  beforeEach(async () => {
    expect((await putChannel()).status).toBe(201);
    expect((await putChannel()).status).toBe(200); // re-PUT updates
  });

  it('upsert: 201 then 200 on edit, with live events only when something changed', async () => {
    const created = await putPost('100', { text: 'BUY XAUUSD', createdAt: '2026-10-01T10:00:00Z' });
    expect(created.status).toBe(201);
    expect(IngestPostResponse.parse(await created.json())).toMatchObject({ isNew: true, post: { id: 'gold-desk:100' } });

    const same = await putPost('100', { text: 'BUY XAUUSD', createdAt: '2026-10-01T10:00:00Z' });
    expect(same.status).toBe(200);
    expect((await same.json()).isNew).toBe(false);

    const edited = IngestPostResponse.parse(await (await putPost('100', { text: 'BUY XAUUSD (TP1 hit)' })).json());
    expect(edited).toMatchObject({ isNew: false, post: { createdAt: '2026-10-01T10:00:00.000Z' } });
    expect(edited.post.editedAt).toBeDefined();

    expect(env.events.map((e) => LiveEvent.parse(e))).toHaveLength(2); // create + edit, NOT the no-op
    expect(env.events.map((e) => e.type === 'post.upsert' && e.isNew)).toEqual([true, false]);
  });

  it('channels, posts page, thread and health all conform to the contract', async () => {
    await putPost('1', { text: 'Entry', signal: { pair: 'XAUUSD', direction: 'buy', entries: ['4000'], targets: ['4010'] } });
    await putPost('2', { text: 'TP1 ✅', replyToSourceId: '1' });

    const ch = ChannelsResponse.parse(await (await req('/v1/channels')).json());
    expect(ch.channels[0]).toMatchObject({ id: 'gold-desk', postCount: 2, demo: true });

    const page = PostsPage.parse(await (await req('/v1/channels/gold-desk/posts?limit=1')).json());
    expect(page.posts).toHaveLength(1);
    expect(page.nextBefore).not.toBeNull();
    const page2 = PostsPage.parse(await (await req(`/v1/channels/gold-desk/posts?limit=1&before=${page.nextBefore}`)).json());
    expect(page2.posts[0]!.id).not.toBe(page.posts[0]!.id);

    for (const path of ['/v1/posts/gold-desk%3A1', '/v1/posts/gold-desk:1']) {
      const th = PostThread.parse(await (await req(path)).json());
      expect(th.replies.map((p) => p.id)).toEqual(['gold-desk:2']);
      expect(th.replies[0]!.replyPreview).toMatchObject({ text: 'Entry', pair: 'XAUUSD', hasMedia: false });
    }

    const health = HealthResponse.parse(await (await req('/v1/health')).json());
    expect(health).toMatchObject({ ok: true, posts: 2, version: '0.0.0-test' });
  });

  it('read API errors: unknown channel/post 404, bad limit/cursor/post id 400', async () => {
    expect((await req('/v1/channels/nope/posts')).status).toBe(404);
    expect((await req('/v1/channels/gold-desk/posts?limit=0')).status).toBe(400);
    expect((await req('/v1/channels/gold-desk/posts?limit=abc')).status).toBe(400);
    expect((await req('/v1/channels/gold-desk/posts?before=%21%21')).status).toBe(400);
    expect((await req('/v1/posts/gold-desk%3A404')).status).toBe(404);
    expect((await req('/v1/posts/no-colon')).status).toBe(400);
    expect((await req('/v1/nope')).status).toBe(404);
  });

  it('hard delete: post gone (404), replies keep working without replyTo; repeat delete is idempotent', async () => {
    await putPost('1', { text: 'parent' });
    await putPost('2', { text: 'child', replyToSourceId: '1' });
    env.events.length = 0;

    const del = await req('/v1/ingest/posts/gold-desk/1', { method: 'DELETE', headers: AUTH });
    expect(await del.json()).toEqual({ deleted: true, id: 'gold-desk:1' });
    expect(env.events[0]).toEqual({ type: 'post.delete', id: 'gold-desk:1', channel: 'gold-desk' });
    expect(env.events[1]).toMatchObject({ type: 'post.upsert', isNew: false, post: { id: 'gold-desk:2' } });

    expect((await req('/v1/posts/gold-desk%3A1')).status).toBe(404);
    const child = PostThread.parse(await (await req('/v1/posts/gold-desk%3A2')).json());
    expect(child.post.replyTo).toBeUndefined();
    expect(child.parent).toBeNull();

    const again = await req('/v1/ingest/posts/gold-desk/1', { method: 'DELETE', headers: AUTH });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ deleted: false, id: 'gold-desk:1' });
    expect((await req('/v1/ingest/posts/nope/1', { method: 'DELETE', headers: AUTH })).status).toBe(404);
  });

  it('courses list + detail', async () => {
    const list = CoursesResponse.parse(await (await req('/v1/courses')).json());
    expect(list.courses.map((c) => c.slug)).toContain('trading-basic-academy');
    const one = CourseResponse.parse(await (await req('/v1/courses/forex-strategie-bootcamp')).json());
    expect(one.course.lessons.length).toBeGreaterThan(0);
    expect((await req('/v1/courses/nope')).status).toBe(404);
    expect((await req('/v1/courses/NOPE')).status).toBe(400);
  });
});

describe('media route', () => {
  const upload = (body: Buffer, headers: Record<string, string> = {}) =>
    req('/v1/ingest/media', { method: 'POST', body: new Uint8Array(body) as Uint8Array<ArrayBuffer>, headers: { ...AUTH, 'content-type': 'application/octet-stream', ...headers } });

  it('upload → 201, re-upload → 200 same media, served with immutable cache + sniffed type', async () => {
    const png = makePng(5, 4);
    const first = await upload(png);
    expect(first.status).toBe(201);
    const { media } = IngestMediaResponse.parse(await first.json());
    const second = await upload(png);
    expect(second.status).toBe(200);
    expect(IngestMediaResponse.parse(await second.json()).media).toEqual(media);

    const got = await req(media.url);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);

    const ranged = await req(media.url, { headers: { range: 'bytes=0-7' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe(`bytes 0-7/${png.length}`);
    expect((await ranged.arrayBuffer()).byteLength).toBe(8);
  });

  it('declared content-type is ignored: bytes decide (415 for an svg labelled png)', async () => {
    expect((await upload(Buffer.from('<svg/>'), { 'content-type': 'image/png' })).status).toBe(415);
    expect((await upload(makeJpeg(2, 2), { 'content-type': 'image/png' })).status).toBe(201);
  });

  it('oversized body → 413', async () => {
    const big = Buffer.alloc(MAX_MEDIA_BYTES + 1);
    makePng(1, 1).copy(big);
    expect((await upload(big)).status).toBe(413);
  });

  it('a post references uploaded media in order', async () => {
    await putChannel();
    const a = IngestMediaResponse.parse(await (await upload(makePng(2, 2, 1))).json()).media;
    const b = IngestMediaResponse.parse(await (await upload(makePng(3, 3, 2))).json()).media;
    const r = IngestPostResponse.parse(await (await putPost('1', { text: '', mediaIds: [b.id, a.id] })).json());
    expect(r.post.media.map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it('path traversal attempts are rejected and never leak files', async () => {
    for (const path of [
      '/media/..%2f..%2fetc%2fpasswd',
      '/media/..%2F..%2F..%2Fetc%2Fpasswd',
      '/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/media/..%5c..%5cetc%5cpasswd',
      '/media/spa.sqlite',
      '/content/courses/..%2f..%2f..%2fpackage.json',
      '/content/courses/trading-basic-academy/..%2f..%2f..%2fpackage.json',
      '/content/courses/trading-basic-academy/%2e%2e/%2e%2e/%2e%2e/package.json',
      '/content/courses/trading-basic-academy/.env',
    ]) {
      const r = await req(path);
      expect(r.status, path).toBe(404);
      const text = await r.text();
      expect(text).not.toMatch(/root:|"dependencies"|SQLite/);
    }
  });

  it('never serves course.json (or anything a lesson does not reference) from the content dir', async () => {
    // The raw file holds every lesson + its access tier: serving it would bypass a
    // future member gate on /v1/courses/:slug.
    expect((await req('/content/courses/trading-basic-academy/course.json')).status).toBe(404);
    expect((await req('/content/courses/risikomanagement-grundlagen/course.json')).status).toBe(404);
  });
});

describe('web build', () => {
  it('serves files, SPA-falls-back to index.html for routes, 404s missing assets; 404 without a build', async () => {
    expect((await req('/')).status).toBe(404); // no build configured in makeEnv

    const w = tempDir('spa-web-');
    mkdirSync(join(w.dir, '_expo', 'static', 'js'), { recursive: true });
    writeFileSync(join(w.dir, 'index.html'), '<html>root</html>');
    writeFileSync(join(w.dir, 'explore.html'), '<html>explore</html>');
    writeFileSync(join(w.dir, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
    env.cleanup();
    env = makeEnv({ webDir: w.dir });
    const done = env.cleanup;
    env.cleanup = () => {
      done();
      w.cleanup();
    };

    const root = await req('/');
    expect(await root.text()).toBe('<html>root</html>');
    expect(root.headers.get('cache-control')).toBe('no-cache');
    expect(await (await req('/explore')).text()).toBe('<html>explore</html>');
    expect(await (await req('/channel/gold-desk')).text()).toBe('<html>root</html>');
    // Thread deep links carry a post id: ':' and '.' are legal there, still routes.
    expect(await (await req('/post/gold-desk%3A2892')).text()).toBe('<html>root</html>');
    expect(await (await req('/post/live-demo%3Ademo-2026.10.08')).text()).toBe('<html>root</html>');
    const js = await req('/_expo/static/js/entry-abc.js');
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(js.headers.get('cache-control')).toMatch(/immutable/);
    expect((await req('/_expo/static/js/missing.js')).status).toBe(404);
    expect((await req('/..%2f..%2fetc%2fpasswd')).status).toBe(404);
    // Server-owned prefixes are a clean 404, never the 200 HTML app shell.
    for (const p of ['/media', '/media/', '/media/abc/def', '/content', '/content/courses', '/content/x/y']) {
      const r = await req(p);
      expect(r.status, p).toBe(404);
      expect(r.headers.get('content-type'), p).toMatch(/json/);
    }
    const etag = root.headers.get('etag')!;
    expect((await req('/', { headers: { 'if-none-match': etag } })).status).toBe(304);
  });
});
