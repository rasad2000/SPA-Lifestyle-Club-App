import { PostThread, PostsPage } from '@spa/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { AUTH, GOLD, json, makeEnv, type TestEnv } from './helpers.ts';

const SIGNAL = { pair: 'XAUUSD', direction: 'sell', entries: ['4400'], stop: '4410', targets: ['4390', '4380'] };

describe('trade threads (reply trees)', () => {
  let env: TestEnv;
  afterEach(() => env?.cleanup());

  const put = (sourceId: string, body: Record<string, unknown>) =>
    env.app.request(`/v1/ingest/posts/gold-desk/${sourceId}`, { method: 'PUT', ...json(body, AUTH) });
  const getThread = async (id: string) => PostThread.parse(await (await env.app.request(`/v1/posts/${encodeURIComponent(id)}`)).json());
  const getPage = async (qs = '') => PostsPage.parse(await (await env.app.request(`/v1/channels/gold-desk/posts${qs}`)).json());

  async function seed() {
    env = makeEnv();
    await env.app.request('/v1/ingest/channels/gold-desk', { method: 'PUT', ...json(GOLD, AUTH) });
    await put('1', { text: 'Sell gold now', signal: SIGNAL, createdAt: '2026-09-01T10:00:00Z' });
    await put('2', { text: 'TP1 HIT', replyToSourceId: '1', createdAt: '2026-09-01T10:05:00Z' });
    // The desk answers its own update: depth 2.
    await put('3', { text: 'TP2 HIT +80 pips', replyToSourceId: '2', createdAt: '2026-09-01T10:09:00Z' });
    await put('4', { text: 'chatter', createdAt: '2026-09-01T10:10:00Z' });
  }

  it('a root carries its whole tree: update count and newest update, at any depth', async () => {
    await seed();
    const root = (await getPage()).posts.find((p) => p.sourceId === '1')!;
    expect(root.replyCount).toBe(1); // direct replies only, unchanged meaning
    expect(root.thread).toEqual({
      updates: 2,
      last: { id: 'gold-desk:3', text: 'TP2 HIT +80 pips', hasMedia: false, createdAt: '2026-09-01T10:09:00.000Z' },
    });
    expect((await getPage()).posts.find((p) => p.sourceId === '4')!.thread).toBeUndefined();
  });

  it('thread: timeline = every descendant oldest-first; rootId points at the top', async () => {
    await seed();
    const t = await getThread('gold-desk:1');
    expect(t.timeline!.map((p) => p.sourceId)).toEqual(['2', '3']);
    expect(t.rootId).toBe('gold-desk:1');
    expect((await getThread('gold-desk:3')).rootId).toBe('gold-desk:1');
  });

  it('?only=signals pages through signal posts only', async () => {
    await seed();
    await put('5', { text: 'Buy gold', signal: { ...SIGNAL, direction: 'buy' }, createdAt: '2026-09-01T11:00:00Z' });
    const first = await getPage('?only=signals&limit=1');
    expect(first.posts.map((p) => p.sourceId)).toEqual(['5']);
    const second = await getPage(`?only=signals&limit=1&before=${encodeURIComponent(first.nextBefore!)}`);
    expect(second.posts.map((p) => p.sourceId)).toEqual(['1']);
    expect(second.nextBefore).toBeNull();
    expect((await env.app.request('/v1/channels/gold-desk/posts?only=bogus')).status).toBe(400);
  });

  it('a nested reply re-broadcasts every ancestor, so the trade card updates live', async () => {
    await seed();
    env.events.length = 0;
    await put('6', { text: 'TP3 HIT', replyToSourceId: '3', createdAt: '2026-09-01T10:20:00Z' });
    const upserted = env.events.filter((e) => e.type === 'post.upsert').map((e) => (e.type === 'post.upsert' ? e.post : null)!);
    const root = upserted.find((p) => p.sourceId === '1');
    expect(root?.thread).toMatchObject({ updates: 3, last: { text: 'TP3 HIT' } });
    expect(upserted.map((p) => p.sourceId)).toEqual(expect.arrayContaining(['6', '3', '2', '1']));

    env.events.length = 0;
    await env.app.request('/v1/ingest/posts/gold-desk/6', { method: 'DELETE', headers: AUTH });
    const after = env.events.filter((e) => e.type === 'post.upsert').map((e) => (e.type === 'post.upsert' ? e.post : null)!);
    expect(after.find((p) => p.sourceId === '1')?.thread).toMatchObject({ updates: 2, last: { text: 'TP2 HIT +80 pips' } });
  });

  it('a reply cycle (malformed producer data) cannot hang a read', async () => {
    await seed();
    await put('7', { text: 'a', replyToSourceId: '8' });
    await put('8', { text: 'b', replyToSourceId: '7' });
    const t = await getThread('gold-desk:7');
    expect(t.timeline!.length).toBeLessThanOrEqual(2);
    expect(t.rootId).toBeDefined();
  });
});
