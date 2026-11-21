import { DemoResetResponse, DemoRunResponse, HealthResponse, IngestPost, PostsPage } from '@spa/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEMO_PREFIX, demoScript } from '../src/demo.ts';
import { AUTH, GOLD, json, makeEnv, type TestEnv } from './helpers.ts';

describe('demoScript', () => {
  const steps = demoScript('run1');

  it('every step is a valid ingest body and only touches demo- source ids', () => {
    for (const s of steps) {
      expect(IngestPost.safeParse(s.post).success).toBe(true);
      expect(s.sourceId.startsWith(DEMO_PREFIX)).toBe(true);
    }
  });

  it('is ordered in time, replies point at the entry, progress only climbs', () => {
    const times = steps.map((s) => s.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const entry = steps[0]!.sourceId;
    const tps = steps.filter((s) => s.sourceId === entry && s.post.signal?.progress).map((s) => s.post.signal!.progress!.tp);
    expect(tps).toEqual([1, 2, 3]);
    for (const s of steps.filter((x) => x.post.replyToSourceId)) expect(s.post.replyToSourceId).toBe(entry);
  });
});

describe('presenter demo endpoints', () => {
  let env: TestEnv;
  afterEach(() => {
    vi.useRealTimers();
    env?.cleanup();
  });

  async function seedChannel(e: TestEnv) {
    await e.app.request('/v1/ingest/channels/gold-desk', { method: 'PUT', ...json(GOLD, AUTH) });
    await e.app.request('/v1/ingest/posts/gold-desk/2892', {
      method: 'PUT',
      ...json({ text: 'real snapshot post', createdAt: '2026-09-11T18:40:02Z' }, AUTH),
    });
  }

  it('is absent unless DEMO_CONTROLS is on', async () => {
    env = makeEnv();
    await seedChannel(env);
    expect((await env.app.request('/v1/demo/run', { method: 'POST' })).status).toBe(404);
    const health = HealthResponse.parse(await (await env.app.request('/v1/health')).json());
    expect(health.demoControls).toBeUndefined();
  });

  it('plays the sequence live, then reset removes only demo posts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    env = makeEnv({ demoControls: true });
    await seedChannel(env);
    expect(HealthResponse.parse(await (await env.app.request('/v1/health')).json()).demoControls).toBe(true);

    const run = DemoRunResponse.parse(await (await env.app.request('/v1/demo/run', { method: 'POST' })).json());
    expect(run).toMatchObject({ channel: 'gold-desk', steps: demoScript('x').length });
    env.events.length = 0;

    vi.advanceTimersByTime(run.durationMs + 100);
    const page = PostsPage.parse(await (await env.app.request('/v1/channels/gold-desk/posts?limit=50')).json());
    const demoPosts = page.posts.filter((p) => p.sourceId.startsWith(DEMO_PREFIX));
    expect(demoPosts).toHaveLength(7);
    const entry = demoPosts.find((p) => p.signal?.direction === 'sell')!;
    expect(entry.signal!.progress).toMatchObject({ kind: 'tp', tp: 3, pips: '+120' });
    expect(entry.replyCount).toBe(5);
    expect(env.events.some((e) => e.type === 'post.upsert' && e.isNew)).toBe(true);

    // A second run replaces the first instead of stacking.
    await env.app.request('/v1/demo/run', { method: 'POST' });
    vi.advanceTimersByTime(run.durationMs + 100);
    const again = PostsPage.parse(await (await env.app.request('/v1/channels/gold-desk/posts?limit=50')).json());
    expect(again.posts.filter((p) => p.sourceId.startsWith(DEMO_PREFIX))).toHaveLength(7);

    const reset = DemoResetResponse.parse(await (await env.app.request('/v1/demo/reset', { method: 'POST' })).json());
    expect(reset.deleted).toBe(7);
    const after = PostsPage.parse(await (await env.app.request('/v1/channels/gold-desk/posts?limit=50')).json());
    expect(after.posts.map((p) => p.sourceId)).toEqual(['2892']);
  });

  it('reset mid-run cancels the remaining steps', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    env = makeEnv({ demoControls: true });
    await seedChannel(env);
    await env.app.request('/v1/demo/run', { method: 'POST' });
    vi.advanceTimersByTime(5000);
    await env.app.request('/v1/demo/reset', { method: 'POST' });
    vi.advanceTimersByTime(30000);
    const page = PostsPage.parse(await (await env.app.request('/v1/channels/gold-desk/posts?limit=50')).json());
    expect(page.posts.map((p) => p.sourceId)).toEqual(['2892']);
  });
});
