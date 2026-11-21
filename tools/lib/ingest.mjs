// @spa ingest client — the ONLY way a feed producer talks to the server.
//
// Every producer in tools/ (seed_demo, live demo) goes through this
// module and nothing else: no DB access, no server imports. That is deliberate — it is
// exactly the seam a live feed adapter will use (HTTP + bearer token), so if the seeds
// work, the adapter's wire format is proven too.
//
//   import { createClient } from './lib/ingest.mjs';
//   const api = createClient({ apiUrl, token });
//   await api.putChannel('gold-desk', { title: …, kind: 'stream' });
//   const id = await api.uploadMedia(bytes, 'image/png');
//   await api.putPost('gold-desk', '2893', { text, mediaIds: [id] });
//
// CLI (used by seed_gold.py --push, so the Python exporter has no HTTP code of its own):
//   node tools/lib/ingest.mjs push <dir> [--replace] [--api URL] [--token T]
//     <dir>/channel.json  — Channel (with "id")
//     <dir>/posts.ndjson  — one {sourceId, mediaFiles:[rel paths], post:{IngestPost minus mediaIds}}
//                           per line, already in publish order (parents before replies)
//     --replace           — afterwards DELETE channel posts whose sourceId is not in the file
//                           (re-seeding a different window must not leave stale posts behind)
//   node tools/lib/ingest.mjs health [--api URL]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_API_URL = 'http://127.0.0.1:8790';

/** A non-retryable API answer (4xx): carries the server's JSON error + details verbatim. */
export class IngestError extends Error {
  constructor(method, route, status, body) {
    const err = body && typeof body === 'object' ? body : { error: String(body ?? '') };
    const details = err.details !== undefined ? ` details=${JSON.stringify(err.details)}` : '';
    super(`${method} ${route} -> ${status}: ${err.error || 'error'}${details}`);
    this.name = 'IngestError';
    this.status = status;
    this.body = err;
  }
}

/** --api/--token flags win over SPA_API_URL/SPA_INGEST_TOKEN env, then the default. */
export function resolveConfig(argv = process.argv.slice(2), env = process.env) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
    const eq = argv.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.slice(name.length + 1) : undefined;
  };
  return {
    apiUrl: (flag('--api') || env.SPA_API_URL || DEFAULT_API_URL).replace(/\/+$/, ''),
    token: flag('--token') || env.SPA_INGEST_TOKEN || '',
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

/**
 * @param {object} o
 * @param {string} [o.apiUrl]
 * @param {string} [o.token]       bearer token for /v1/ingest/*
 * @param {number} [o.retries]     extra attempts on 5xx / 429 / network errors
 * @param {number} [o.backoffMs]   first backoff; doubles per attempt
 * @param {typeof fetch} [o.fetchImpl] injected for tests
 */
export function createClient({ apiUrl = DEFAULT_API_URL, token = '', retries = 4,
  backoffMs = 300, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const base = apiUrl.replace(/\/+$/, '');

  async function call(method, route, { body, contentType, auth = true, okStatuses = [] } = {}) {
    const headers = {};
    if (auth) {
      if (!token) throw new Error(`${method} ${route}: no ingest token (set SPA_INGEST_TOKEN or --token)`);
      headers.authorization = `Bearer ${token}`;
    }
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    } else if (contentType) {
      headers['content-type'] = contentType;
    }
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(base + route, { method, headers, body: payload });
      } catch (e) {
        // Network-level failure (server restarting, connection refused): transient.
        if (attempt >= retries) throw new Error(`${method} ${route}: network error after ${attempt + 1} attempts: ${e.message}`);
        const wait = backoffMs * 2 ** attempt;
        log(`retry ${method} ${route} in ${wait}ms (${e.message})`);
        await sleep(wait);
        continue;
      }
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      if (res.ok || okStatuses.includes(res.status)) return { status: res.status, body: parsed };
      // 5xx and 429 are the server's problem / back-pressure: retry. Any other 4xx is OUR
      // bug (bad body, bad token) and retrying would only repeat it — fail loudly instead.
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt >= retries) throw new IngestError(method, route, res.status, parsed);
      const wait = backoffMs * 2 ** attempt;
      log(`retry ${method} ${route} in ${wait}ms (HTTP ${res.status})`);
      await sleep(wait);
    }
  }

  return {
    apiUrl: base,
    health: async () => (await call('GET', '/v1/health', { auth: false })).body,
    putChannel: async (id, channel) => {
      const { id: _drop, ...body } = channel; // IngestChannel = Channel minus id
      return (await call('PUT', `/v1/ingest/channels/${enc(id)}`, { body })).body;
    },
    /** Raw image bytes -> the server's media id (to reference in a post's mediaIds). */
    uploadMedia: async (bytes, contentType) => {
      const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const r = await call('POST', '/v1/ingest/media', { body: buf, contentType });
      const id = r.body?.media?.id;
      if (!id) throw new Error(`POST /v1/ingest/media: response has no media.id (${JSON.stringify(r.body)})`);
      return id;
    },
    /** Idempotent upsert: re-PUT of the same (channel, sourceId) is an edit. */
    putPost: async (channel, sourceId, post) =>
      (await call('PUT', `/v1/ingest/posts/${enc(channel)}/${enc(sourceId)}`, { body: post })).body,
    /** Returns true if deleted, false if it was already gone. Idempotency is the
     * SERVER's: a missing post answers 200 {deleted:false}. A 404 means the channel or
     * the route is wrong (typo'd channel id, --api at the wrong server/prefix) — that
     * must fail loudly, or a prune / a producer's delete cascade "succeeds" deleting nothing. */
    deletePost: async (channel, sourceId) => {
      const r = await call('DELETE', `/v1/ingest/posts/${enc(channel)}/${enc(sourceId)}`);
      return r.body?.deleted === true;
    },
    /** Read API (no token): every post of a channel, paging via nextBefore. */
    listPosts: async (channel, pageSize = 100) => {
      const all = [];
      let before = null;
      for (;;) {
        const q = new URLSearchParams({ limit: String(pageSize) });
        if (before) q.set('before', before);
        const r = await call('GET', `/v1/channels/${enc(channel)}/posts?${q}`, { auth: false });
        all.push(...(r.body?.posts || []));
        before = r.body?.nextBefore || null;
        if (!before || !(r.body?.posts || []).length) return all;
      }
    },
  };
}

// ------------------------------------------------------------------ contract check

// Validate producer bodies against @spa/contract BEFORE sending, so a mapping bug is
// reported by the producer with the field path, not discovered as a server 400 mid-push.
// The contract is TypeScript; Node >= 22.18 strips types natively. If that import is not
// possible (older Node) we skip client-side validation — the server validates anyway.
let contractPromise;
export function loadContract() {
  contractPromise ??= import('@spa/contract').catch(() => null);
  return contractPromise;
}

export async function validateIngestPost(body, label = 'post') {
  const c = await loadContract();
  if (!c) return body;
  const r = c.IngestPost.safeParse(body);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${label} violates IngestPost: ${issues}`);
  }
  return body;
}

// ------------------------------------------------------------------ push a snapshot dir

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || null;

export function readSnapshot(dir) {
  const channel = JSON.parse(fs.readFileSync(path.join(dir, 'channel.json'), 'utf8'));
  const lines = fs.readFileSync(path.join(dir, 'posts.ndjson'), 'utf8').split('\n').filter((l) => l.trim());
  return { channel, entries: lines.map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`posts.ndjson line ${i + 1}: ${e.message}`); }
  }) };
}

/** DELETE every post of `channelId` whose sourceId is not in `keepIds`. Returns the count. */
export async function pruneChannel(api, channelId, keepIds) {
  const keep = new Set([...keepIds].map(String));
  let pruned = 0;
  for (const p of await api.listPosts(channelId)) {
    if (!keep.has(p.sourceId) && (await api.deletePost(channelId, p.sourceId))) pruned++;
  }
  return pruned;
}

/** Upload media + PUT every post of a snapshot dir, in file order. Returns counters. */
export async function pushSnapshot(api, dir, { replace = false, log = console.log } = {}) {
  const { channel, entries } = readSnapshot(dir);
  // Fail before the first byte goes out: every body and every media file must be valid.
  for (const e of entries) {
    for (const f of e.mediaFiles || []) {
      if (!mimeOf(f)) throw new Error(`${e.sourceId}: unsupported media type ${f}`);
      if (!fs.existsSync(path.join(dir, f))) throw new Error(`${e.sourceId}: missing media file ${f}`);
    }
    await validateIngestPost({ ...e.post, mediaIds: (e.mediaFiles || []).map(() => 'x') }, `post ${e.sourceId}`);
  }
  await api.putChannel(channel.id, channel);
  log(`channel ${channel.id} upserted`);
  let posts = 0, media = 0;
  for (const e of entries) {
    const mediaIds = [];
    for (const f of e.mediaFiles || []) {
      mediaIds.push(await api.uploadMedia(fs.readFileSync(path.join(dir, f)), mimeOf(f)));
      media++;
    }
    await api.putPost(channel.id, e.sourceId, { ...e.post, mediaIds });
    posts++;
    if (posts % 25 === 0) log(`  ${posts}/${entries.length} posts`);
  }
  const pruned = replace ? await pruneChannel(api, channel.id, entries.map((e) => e.sourceId)) : 0;
  log(`pushed ${posts} posts, ${media} media${replace ? `, pruned ${pruned} stale` : ''} -> ${api.apiUrl} [${channel.id}]`);
  return { posts, media, pruned };
}

// ------------------------------------------------------------------ CLI

async function cli(argv) {
  const [cmd, dir] = argv;
  const cfg = resolveConfig(argv);
  const api = createClient({ ...cfg, log: (m) => console.error(`[ingest] ${m}`) });
  if (cmd === 'health') {
    console.log(JSON.stringify(await api.health()));
  } else if (cmd === 'push' && dir) {
    await pushSnapshot(api, dir, { replace: argv.includes('--replace') });
  } else {
    console.error('usage: node tools/lib/ingest.mjs push <dir> [--replace] [--api URL] [--token T]\n'
      + '       node tools/lib/ingest.mjs health [--api URL]');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  cli(process.argv.slice(2)).catch((e) => { console.error(`[ingest] FAILED: ${e.message}`); process.exit(1); });
}
