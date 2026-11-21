/**
 * Presenter demo: replays a scripted gold-desk sequence into a channel so the
 * real-time path is visible during a pitch: a signal lands, the desk's follow-ups
 * arrive, and the signal card's TP tiles light up as the parent is re-upserted with
 * `signal.progress` (exactly what a live producer does with its desk replies).
 *
 * Safety: every post this module writes or deletes has a sourceId starting with
 * DEMO_PREFIX, so it can never touch a real (snapshot or relayed) post. A new run
 * cancels a running one and removes the previous run's posts first.
 */
import type { IngestPost, LiveEvent, Post } from '@spa/contract';
import { IngestPost as IngestPostSchema } from '@spa/contract';

import type { Store } from './store.ts';

export const DEMO_PREFIX = 'demo-';

export interface DemoStep {
  /** Offset from the run's start. */
  atMs: number;
  sourceId: string;
  post: IngestPost;
}

type Schedule = (fn: () => void, ms: number) => { cancel: () => void };

const defaultSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(t) };
};

const ENTRY_TEXT = 'High Risk\n\nSell Gold Now\n\n4402-4406\n\nTP 4398\nTP 4394\nTP 4390\nTP 4380\n\nSL 4412';
const ENTRY_SIGNAL = {
  pair: 'XAUUSD',
  direction: 'sell',
  directionLabel: 'High Risk · Sell Gold Now',
  entries: ['4402-4406'],
  stop: '4412',
  targets: ['4398', '4394', '4390', '4380'],
} as const;

const LIMIT_TEXT = 'Gold Buy Limit\n\n4371-4374\n\nTP 4378\nTP 4382\nTP 4390\n\nSL 4365';
const LIMIT_SIGNAL = {
  pair: 'XAUUSD',
  direction: 'buy',
  directionLabel: 'Gold Buy Limit',
  entries: ['4371-4374'],
  stop: '4365',
  targets: ['4378', '4382', '4390'],
} as const;

/**
 * The scripted sequence (pure, so it is unit-tested). Wording follows the real desk:
 * English, terse. ~22 s end to end: slow enough to narrate, short enough to hold a room.
 */
export function demoScript(runId: string): DemoStep[] {
  const id = (n: number) => `${DEMO_PREFIX}${runId}-${n}`;
  const entry = id(1);
  const progress = (tp: number, pips: string) => ({
    text: ENTRY_TEXT,
    signal: { ...ENTRY_SIGNAL, entries: [...ENTRY_SIGNAL.entries], targets: [...ENTRY_SIGNAL.targets], progress: { kind: 'tp' as const, tp, pips } },
  });
  return [
    { atMs: 1200, sourceId: entry, post: { text: ENTRY_TEXT, signal: { ...ENTRY_SIGNAL, entries: [...ENTRY_SIGNAL.entries], targets: [...ENTRY_SIGNAL.targets] } } },
    { atMs: 4200, sourceId: id(2), post: { text: 'All entries active', replyToSourceId: entry } },
    { atMs: 7400, sourceId: id(3), post: { text: 'TP1 HIT 🎯\n+40 pips', replyToSourceId: entry } },
    { atMs: 7600, sourceId: entry, post: progress(1, '+40') },
    { atMs: 10600, sourceId: id(4), post: { text: 'Move SL to entry – trade is risk free', replyToSourceId: entry } },
    { atMs: 13800, sourceId: id(5), post: { text: 'TP2 HIT 🎯\n+80 pips', replyToSourceId: entry } },
    { atMs: 14000, sourceId: entry, post: progress(2, '+80') },
    { atMs: 17200, sourceId: id(6), post: { text: LIMIT_TEXT, signal: { ...LIMIT_SIGNAL, entries: [...LIMIT_SIGNAL.entries], targets: [...LIMIT_SIGNAL.targets] } } },
    { atMs: 21000, sourceId: id(7), post: { text: 'TP3 HIT 🎯\n+120 pips', replyToSourceId: entry } },
    { atMs: 21200, sourceId: entry, post: progress(3, '+120') },
  ];
}

export interface Demo {
  run(): { channel: string; startedAt: string; steps: number; durationMs: number };
  reset(): { deleted: number };
}

export function createDemo(deps: {
  store: Store;
  channel: string;
  publishUpsert: (post: Post, isNew: boolean, related: Post[]) => void;
  publish: (e: LiveEvent) => void;
  schedule?: Schedule;
  now?: () => Date;
}): Demo {
  const { store, channel, publishUpsert, publish } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const now = deps.now ?? (() => new Date());
  let timers: { cancel: () => void }[] = [];

  function stop() {
    for (const t of timers) t.cancel();
    timers = [];
  }

  function removeDemoPosts(): number {
    // Replies first: a parent deleted before its replies would re-publish them as orphans.
    const ids = store.sourceIdsWithPrefix(channel, DEMO_PREFIX).sort().reverse();
    let deleted = 0;
    for (const sourceId of ids) {
      const r = store.deletePost(channel, sourceId);
      if (!r) continue;
      deleted++;
      publish({ type: 'post.delete', id: r.id, channel: r.channel });
      for (const p of r.related) {
        if (!p.sourceId.startsWith(DEMO_PREFIX)) publish({ type: 'post.upsert', post: p, isNew: false });
      }
    }
    return deleted;
  }

  return {
    run() {
      if (!store.hasChannel(channel)) throw new Error(`demo channel not found: ${channel}`);
      stop();
      removeDemoPosts();
      const start = now();
      const runId = start.getTime().toString(36);
      const steps = demoScript(runId);
      for (const step of steps) {
        timers.push(
          schedule(() => {
            const input = IngestPostSchema.parse(step.post);
            const r = store.upsertPost(channel, step.sourceId, input);
            if (r.changed) publishUpsert(r.post, r.isNew, r.related);
          }, step.atMs),
        );
      }
      return {
        channel,
        startedAt: start.toISOString(),
        steps: steps.length,
        durationMs: steps.at(-1)?.atMs ?? 0,
      };
    },
    reset() {
      stop();
      return { deleted: removeDemoPosts() };
    },
  };
}
