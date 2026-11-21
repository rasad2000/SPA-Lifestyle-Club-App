// Seed the server with FICTIONAL demo content (portfolio copy: no real desk's posts).
//
//   node tools/seed_demo.mjs [--replace] [--api URL] [--token T]   (token: SPA_INGEST_TOKEN)
//
// Two channels: "gold-desk" (SPA Gold Desk, the presenter demo's channel) with entry
// signals and the desk's terse follow-ups (TP hits, SL moves, stops), and "fx-ideas"
// (FX Ideas) with longer-form swing ideas. Dates are relative to now, so the feed always
// looks current. Deterministic: the same run produces the same sourceIds (re-PUT = edit),
// and --replace prunes anything else in those channels.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient, pruneChannel, resolveConfig, validateIngestPost } from './lib/ingest.mjs';

const HOUR = 3600_000;

/** Deterministic pseudo-random (mulberry32), so every seed run is identical. */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t) => new Date(t).toISOString();

/** Gold desk: entries every ~14 h over the last 10 days, each with 0-4 follow-ups. */
export function goldDesk(now = Date.now()) {
  const rand = rng(20261116);
  const posts = [];
  let price = 4318;
  for (let i = 0; i < 18; i++) {
    const at = now - (10 * 24 - i * 13.5) * HOUR;
    price += Math.round((rand() - 0.45) * 40);
    const sell = rand() < 0.45;
    const limit = rand() < 0.4;
    const step = 4;
    const lo = price - 2;
    const hi = price + 2;
    const sign = sell ? -1 : 1;
    const rungs = [1, 2, 3, 5];
    const targets = rungs.map((k) => String(price + sign * k * step));
    const stop = String(price - sign * 2.5 * step);
    const label = `${sell ? 'Sell' : 'Buy'} Gold ${limit ? 'Limit' : 'Now'}`;
    const text = `${label}\n\n${lo}-${hi}\n\n${targets.map((t) => `TP ${t}`).join('\n')}\n\nSL ${stop}`;
    const id = `g${String(i + 1).padStart(3, '0')}`;
    const signal = {
      pair: 'XAUUSD',
      direction: sell ? 'sell' : 'buy',
      directionLabel: label,
      entries: [`${lo}-${hi}`],
      stop,
      targets,
    };
    // Outcome: most hit TP1, some run further, some stop out. The newest two stay open.
    const roll = rand();
    const open = i >= 16;
    const reached = open ? 0 : roll < 0.22 ? 0 : roll < 0.55 ? 1 : roll < 0.8 ? 2 : roll < 0.93 ? 3 : 4;
    const stopped = !open && reached === 0;
    const replies = [];
    let t = at + 25 * 60_000;
    if (!open) replies.push({ text: 'All entries active', at: (t += 10 * 60_000) });
    for (let k = 1; k <= reached; k++) {
      t += (20 + rand() * 70) * 60_000;
      const pips = `+${rungs[k - 1] * step * 10}`;
      replies.push({ text: `TP${k} HIT 🎯\n${pips} pips`, at: t, progress: { kind: 'tp', tp: k, pips } });
      if (k === 1) replies.push({ text: 'SL moved to entry, no more risk on this one', at: t + 2 * 60_000 });
    }
    if (stopped) replies.push({ text: 'SL hit. On to the next one.', at: t + 55 * 60_000, progress: { kind: 'sl' } });
    const last = replies.findLast((r) => r.progress);
    posts.push({
      sourceId: id,
      post: {
        text,
        signal: last ? { ...signal, progress: { ...last.progress, at: iso(last.at) } } : signal,
        createdAt: iso(at),
      },
    });
    replies.forEach((r, j) => {
      posts.push({ sourceId: `${id}-r${j + 1}`, post: { text: r.text, replyToSourceId: id, createdAt: iso(r.at) } });
    });
  }
  return {
    channel: {
      id: 'gold-desk',
      title: 'SPA Gold Desk',
      subtitle: 'XAUUSD · Scalping & Intraday',
      kind: 'stream',
      accent: '#8E1B2C',
      demo: true,
      order: 0,
    },
    posts,
  };
}

/** FX ideas: a handful of swing setups with a short rationale. */
export function fxIdeas(now = Date.now()) {
  const ideas = [
    [
      'EURUSD',
      'buy',
      'BUY LIMIT',
      'H4',
      ['1.0842'],
      '1.0798',
      ['1.0890', '1.0935'],
      'Retest of the broken daily range high; momentum turned up on H4.',
    ],
    [
      'GBPJPY',
      'sell',
      'SELL',
      'H1',
      ['198.40'],
      '198.95',
      ['197.60', '196.90'],
      'Lower highs since London open; selling the pullback into supply.',
    ],
    [
      'USDCAD',
      'buy',
      'BUY',
      'D1',
      ['1.3712'],
      '1.3640',
      ['1.3790', '1.3860'],
      'Oil weakness and a higher low on the daily chart.',
    ],
    [
      'AUDUSD',
      'sell',
      'SELL LIMIT',
      'H4',
      ['0.6618'],
      '0.6655',
      ['0.6570', '0.6530'],
      'Rejection at the weekly pivot; risk off into the US session.',
    ],
    [
      'EURGBP',
      'buy',
      'BUY',
      'H4',
      ['0.8541'],
      '0.8512',
      ['0.8580', '0.8610'],
      'Double bottom completed; target the range top.',
    ],
  ];
  const posts = ideas.map(([pair, direction, directionLabel, timeframe, entries, stop, targets, notes], i) => ({
    sourceId: `fx${i + 1}`,
    post: {
      text: `${pair} ${directionLabel}\n\nEntry ${entries[0]}\nSL ${stop}\n${targets.map((t, k) => `TP${k + 1} ${t}`).join('\n')}\n\n${notes}`,
      signal: {
        pair,
        direction,
        directionLabel,
        timeframe,
        entries,
        stop,
        targets,
        status: 'active',
        author: 'Clara Weiss',
        notes,
      },
      createdAt: iso(now - (5 - i) * 31 * HOUR),
    },
  }));
  return {
    channel: {
      id: 'fx-ideas',
      title: 'FX Ideas',
      subtitle: 'Swing-Setups mit Begründung',
      kind: 'signals',
      accent: '#8A6A1F',
      demo: true,
      order: 1,
    },
    posts,
  };
}

async function main(argv) {
  const api = createClient({ ...resolveConfig(argv), log: (m) => console.error(`[seed] ${m}`) });
  const replace = argv.includes('--replace');
  for (const feed of [goldDesk(), fxIdeas()]) {
    const { id, ...channel } = feed.channel;
    for (const p of feed.posts) await validateIngestPost(p.post, `${id}/${p.sourceId}`);
    await api.putChannel(id, channel);
    // Parents first (file order), so replies resolve on arrival.
    for (const p of feed.posts) await api.putPost(id, p.sourceId, p.post);
    const pruned = replace
      ? await pruneChannel(
          api,
          id,
          feed.posts.map((p) => p.sourceId),
        )
      : 0;
    console.log(`${id}: ${feed.posts.length} posts${replace ? `, pruned ${pruned}` : ''}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[seed] FAILED: ${e.message}`);
    process.exit(1);
  });
}
