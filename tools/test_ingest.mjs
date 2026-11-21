// node --test tools/test_ingest.mjs
// The ingest client's contract with the server: retry what is transient, fail loudly
// (with the server's own error details) on what is our bug.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient, IngestError, pruneChannel, resolveConfig, validateIngestPost } from './lib/ingest.mjs';

const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

test('retries 5xx and network errors with backoff, then succeeds', async () => {
  const f = fakeFetch([new TypeError('fetch failed'), reply(503, { error: 'busy' }),
    reply(200, { post: { id: 'gold-desk:1' }, isNew: true })]);
  const api = createClient({ token: 't', fetchImpl: f, backoffMs: 1 });
  const r = await api.putPost('gold-desk', '1', { text: 'x' });
  assert.equal(r.isNew, true);
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].url, 'http://127.0.0.1:8790/v1/ingest/posts/gold-desk/1');
  assert.equal(f.calls[2].headers.authorization, 'Bearer t');
  assert.equal(f.calls[2].headers['content-type'], 'application/json');
});

test('4xx is not retried and surfaces the server JSON details', async () => {
  const f = fakeFetch([reply(400, { error: 'invalid body', details: [{ path: ['text'], message: 'too long' }] })]);
  const api = createClient({ token: 't', fetchImpl: f, backoffMs: 1 });
  await assert.rejects(api.putPost('gold-desk', '1', { text: 'x' }), (e) => {
    assert.ok(e instanceof IngestError);
    assert.equal(e.status, 400);
    assert.match(e.message, /PUT \/v1\/ingest\/posts\/gold-desk\/1 -> 400: invalid body details=.*too long/);
    return true;
  });
  assert.equal(f.calls.length, 1);
});

test('gives up after the retry budget on persistent 5xx', async () => {
  const f = fakeFetch([reply(500, { error: 'x' }), reply(500, { error: 'x' }), reply(500, { error: 'boom' })]);
  const api = createClient({ token: 't', fetchImpl: f, retries: 2, backoffMs: 1 });
  await assert.rejects(api.putChannel('live-demo', { id: 'live-demo', title: 'x', kind: 'stream' }), /-> 500: boom/);
  assert.equal(f.calls.length, 3);
  // channel id is in the path, never in the body (IngestChannel = Channel minus id)
  assert.equal(JSON.parse(f.calls[0].body).id, undefined);
});

test('uploadMedia sends raw bytes with the image type and returns the media id', async () => {
  const f = fakeFetch([reply(201, { media: { id: 'abc', url: '/media/abc.png', kind: 'image' } })]);
  const api = createClient({ token: 't', fetchImpl: f });
  assert.equal(await api.uploadMedia(new Uint8Array([1, 2, 3]), 'image/png'), 'abc');
  assert.equal(f.calls[0].headers['content-type'], 'image/png');
  assert.ok(f.calls[0].body instanceof Uint8Array);
});

test('deletePost: a missing post is the server\'s 200 {deleted:false}; a 404 (bad channel/route) fails loudly', async () => {
  const api = createClient({ token: 't', fetchImpl: fakeFetch([
    reply(200, { deleted: false, id: 'live-demo:x' }),
    reply(200, { deleted: true, id: 'live-demo:y' }),
    reply(404, { error: 'channel not found' }),
  ]) });
  assert.equal(await api.deletePost('live-demo', 'x'), false);
  assert.equal(await api.deletePost('live-demo', 'y'), true);
  await assert.rejects(api.deletePost('live-dmeo', 'z'), (e) => e instanceof IngestError && e.status === 404);
});

test('pruneChannel deletes exactly the posts not kept', async () => {
  const f = fakeFetch([
    reply(200, { posts: [{ sourceId: '1' }, { sourceId: '2' }, { sourceId: '3' }], nextBefore: null }),
    reply(200, { deleted: true, id: 'c:2' }),
  ]);
  const api = createClient({ token: 't', fetchImpl: f });
  assert.equal(await pruneChannel(api, 'c', ['1', 3]), 1);
  assert.equal(f.calls[1].method, 'DELETE');
  assert.match(f.calls[1].url, /\/v1\/ingest\/posts\/c\/2$/);
});

test('ingest calls refuse to run without a token', async () => {
  const api = createClient({ token: '', fetchImpl: fakeFetch([]) });
  await assert.rejects(api.putPost('a', 'b', {}), /no ingest token/);
});

test('flags beat env beat default', () => {
  assert.deepEqual(resolveConfig(['--api', 'http://x:1/', '--token', 'f'], { SPA_API_URL: 'http://e', SPA_INGEST_TOKEN: 'e' }),
    { apiUrl: 'http://x:1', token: 'f' });
  assert.deepEqual(resolveConfig([], { SPA_INGEST_TOKEN: 'e' }), { apiUrl: 'http://127.0.0.1:8790', token: 'e' });
});

test('client-side contract validation names the bad field', async () => {
  await assert.rejects(validateIngestPost({ text: 'x', replyToSourceId: 'has space' }), /replyToSourceId/);
  await validateIngestPost({ text: 'x', createdAt: '2026-09-10T10:00:00Z', mediaIds: ['m'] });
});
