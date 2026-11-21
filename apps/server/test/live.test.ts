/** End-to-end: a REAL server on an ephemeral port, a real ws client, real HTTP ingest. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect } from 'node:net';
import WebSocket from 'ws';
import { LiveEvent } from '@spa/contract';
import { startServer, type RunningServer } from '../src/server.ts';
import { AUTH, GOLD, tempDir, testConfig } from './helpers.ts';

let t: ReturnType<typeof tempDir>;
let srv: RunningServer;

beforeEach(async () => {
  t = tempDir();
  srv = await startServer(testConfig(t.dir), { heartbeatMs: 100 });
});
afterEach(async () => {
  await srv.close();
  t.cleanup();
});

/** Collect parsed LiveEvents; `next(type)` resolves with the next event of that type. */
function client(url: string) {
  const ws = new WebSocket(url);
  const queue: LiveEvent[] = [];
  const waiters: Array<{ type: LiveEvent['type']; resolve: (e: LiveEvent) => void }> = [];
  ws.on('message', (data) => {
    const ev = LiveEvent.parse(JSON.parse(String(data))); // every frame must match the contract
    const i = waiters.findIndex((w) => w.type === ev.type);
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(ev);
    else queue.push(ev);
  });
  const next = <T extends LiveEvent['type']>(type: T, ms = 3000) =>
    new Promise<Extract<LiveEvent, { type: T }>>((resolve, reject) => {
      const i = queue.findIndex((e) => e.type === type);
      if (i >= 0) return resolve(queue.splice(i, 1)[0] as Extract<LiveEvent, { type: T }>);
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), ms);
      waiters.push({ type, resolve: (e) => (clearTimeout(timer), resolve(e as Extract<LiveEvent, { type: T }>)) });
    });
  return { ws, next };
}

const api = (path: string, init?: RequestInit) => fetch(`${srv.url}${path}`, init);
const put = (path: string, body: unknown) =>
  api(path, { method: 'PUT', body: JSON.stringify(body), headers: { ...AUTH, 'content-type': 'application/json' } });

describe('live (WebSocket /v1/live)', () => {
  it('hello → post.upsert(isNew) → edit → post.delete, all over real sockets', async () => {
    const c = client(`${srv.url.replace('http', 'ws')}/v1/live`);
    const hello = await c.next('hello');
    expect(Date.parse(hello.serverTime)).not.toBeNaN();

    expect((await put('/v1/ingest/channels/live-demo', { ...GOLD, title: 'Live Demo' })).status).toBe(201);
    expect((await put('/v1/ingest/posts/live-demo/1', { text: '🟢 BUY XAUUSD' })).status).toBe(201);
    const created = await c.next('post.upsert');
    expect(created.isNew).toBe(true);
    expect(created.post).toMatchObject({ id: 'live-demo:1', channel: 'live-demo', text: '🟢 BUY XAUUSD' });

    await put('/v1/ingest/posts/live-demo/1', { text: '🟢 BUY XAUUSD — TP1 ✅' });
    const edited = await c.next('post.upsert');
    expect(edited.isNew).toBe(false);
    expect(edited.post.editedAt).toBeDefined();

    expect((await api('/v1/ingest/posts/live-demo/1', { method: 'DELETE', headers: AUTH })).status).toBe(200);
    expect(await c.next('post.delete')).toEqual({ type: 'post.delete', id: 'live-demo:1', channel: 'live-demo' });

    // Heartbeat: the JSON ping frame arrives (heartbeatMs=100 in this test).
    expect((await c.next('ping')).type).toBe('ping');
    expect(srv.live.clientCount()).toBe(1);
    c.ws.close();
  });

  it('broadcasts to every connected client', async () => {
    const a = client(`${srv.url.replace('http', 'ws')}/v1/live`);
    const b = client(`${srv.url.replace('http', 'ws')}/v1/live`);
    await Promise.all([a.next('hello'), b.next('hello')]);
    await put('/v1/ingest/channels/live-demo', GOLD);
    await put('/v1/ingest/posts/live-demo/7', { text: 'fan-out' });
    const [ea, eb] = await Promise.all([a.next('post.upsert'), b.next('post.upsert')]);
    expect(ea.post.id).toBe('live-demo:7');
    expect(eb.post.id).toBe('live-demo:7');
    a.ws.close();
    b.ws.close();
  });

  it('rejects upgrades on other paths', async () => {
    const ws = new WebSocket(`${srv.url.replace('http', 'ws')}/v1/nope`);
    const err = await new Promise<Error>((resolve) => ws.on('error', resolve));
    expect(err.message).toMatch(/404/);
  });

  it('survives an upgrade with an unparseable request target (regression: process crash)', async () => {
    const { port } = new URL(srv.url);
    const reply = await new Promise<string>((resolve, reject) => {
      const sock = connect(Number(port), '127.0.0.1', () => {
        sock.write(
          'GET //[ HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
            'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
        );
      });
      let buf = '';
      sock.on('data', (d) => (buf += String(d)));
      sock.on('close', () => resolve(buf));
      sock.on('error', reject);
    });
    expect(reply).toMatch(/^HTTP\/1\.1 404/);
    const r = await api('/v1/health'); // still alive
    expect(r.status).toBe(200);
  });

  it('accepts the live path with a query string', async () => {
    const c = client(`${srv.url.replace('http', 'ws')}/v1/live?v=1`);
    expect((await c.next('hello')).type).toBe('hello');
    c.ws.close();
  });

  it('serves HTTP on the same port', async () => {
    const r = await api('/v1/health');
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});
