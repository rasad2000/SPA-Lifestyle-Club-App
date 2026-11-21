#!/usr/bin/env node
// Presenter demo from the command line: the same thing as the app's "Demo" header
// button. The sequence itself lives on the server (apps/server/src/demo.ts), so the app
// and this script can never drift apart. Needs the server running with DEMO_CONTROLS=1.
//
//   node tools/live_demo.mjs            # play the sequence (replaces a running one), wait for it
//   node tools/live_demo.mjs --reset    # stop it and delete every demo post
//   [--api http://127.0.0.1:8790]       # or SPA_API_URL
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (flag('--api') ?? process.env.SPA_API_URL ?? 'http://127.0.0.1:8790').replace(/\/+$/, '');

async function post(path) {
  const res = await fetch(BASE + path, { method: 'POST' });
  if (res.status === 404) throw new Error(`${path}: 404. Is the server running with DEMO_CONTROLS=1?`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  if (argv.includes('--reset')) {
    const r = await post('/v1/demo/reset');
    console.log(`demo reset: ${r.deleted} demo post(s) deleted`);
    return;
  }
  const r = await post('/v1/demo/run');
  console.log(`demo running in "${r.channel}": ${r.steps} steps over ${Math.round(r.durationMs / 1000)} s`);
  await new Promise((res) => setTimeout(res, r.durationMs + 500));
  console.log('fertig');
}

main().catch((e) => {
  console.error(`live_demo FAILED: ${e.message}`);
  process.exit(1);
});
