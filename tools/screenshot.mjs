#!/usr/bin/env node
/**
 * Visual check of the exported web build, served by the feed server, at an
 * iPhone-sized viewport (390x844 @3x, dark, de-DE). Captures every screen plus a
 * LIVE check: press the app's own "Demo" header button (server needs DEMO_CONTROLS=1),
 * assert the feed empties, the scripted signal lands WITHOUT a reload (the WebSocket
 * path, end to end) and the sequence plays to its last TP, then "Beenden" restores it.
 *
 *   node tools/screenshot.mjs [--api http://127.0.0.1:8790]
 *
 * Playwright isn't a dependency of this workspace (the web build doesn't need it): install it
 * globally, or point PLAYWRIGHT_MODULE at any installed playwright/index.mjs.
 * Output: tools/out/screens/*.png.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out', 'screens');
const PW = process.env.PLAYWRIGHT_MODULE ?? 'playwright';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (flag('--api') ?? process.env.SPA_API_URL ?? 'http://127.0.0.1:8790').replace(/\/+$/, '');

const { chromium } = await import(PW).catch(() => {
  console.error(`screenshot: cannot load Playwright from "${PW}". Install it, or set PLAYWRIGHT_MODULE to its index.mjs.`);
  process.exit(2);
});

async function getJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

/** The most-replied gold post: the thread screen should show a real thread. */
async function pickThread() {
  let before;
  let best;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: '100', ...(before ? { before } : {}) });
    const d = await getJson(`/v1/channels/gold-desk/posts?${q}`);
    for (const p of d.posts) if (!best || (p.replyCount ?? 0) > (best.replyCount ?? 0)) best = p;
    before = d.nextBefore;
    if (!before) break;
  }
  if (!best) throw new Error('no gold posts — seed first');
  return best.id;
}

async function settle(page, ms = 900) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms); // fonts, image decode, blur compositing
}

const failures = [];
const consoleErrors = [];
const shots = [];

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`  shot ${name}.png`);
}

async function selectChannel(page, title) {
  await page
    .getByRole('tab', { name: new RegExp(`^${title}`) })
    .first()
    .click();
  await page
    .getByRole('tab', { name: new RegExp(`^${title}`), selected: true })
    .first()
    .waitFor();
  await settle(page);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  colorScheme: 'dark',
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // 0. Home (slide 1): the newsletter every visitor sees.
  await page.goto(BASE + '/');
  await page
    .getByText(/SPA Garden Club/i)
    .first()
    .waitFor({ timeout: 20000 });
  await settle(page, 1500);
  await shot(page, '00-home');
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('div')) if (d.scrollHeight > d.clientHeight + 40) d.scrollTop = 900;
  });
  await settle(page, 600);
  await shot(page, '00b-home-scrolled');

  // 0c. News: a post grows out of its card (app-open transition); swiping brings its text
  // in; a swipe DOWN shrinks it back into the card.
  await page.goto(BASE + '/');
  await page
    .getByText(/SPA Garden Club/i)
    .first()
    .waitFor({ timeout: 20000 });
  await page
    .getByLabel(/Garden Salon/i)
    .first()
    .click();
  await page.waitForTimeout(140);
  await shot(page, '00c-news-opening');
  await page.getByRole('button', { name: 'Schließen' }).waitFor({ timeout: 10000 });
  await settle(page, 900);
  await shot(page, '00d-news-viewer');
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('div'))
      if (d.scrollWidth > d.clientWidth + 40 && getComputedStyle(d).overflowX !== 'visible')
        d.scrollLeft = d.clientWidth;
  });
  await settle(page, 800);
  await shot(page, '00e-news-viewer-text');
  await page.getByRole('button', { name: 'Schließen' }).click();
  await page.getByRole('button', { name: 'Schließen' }).waitFor({ state: 'detached', timeout: 10000 });
  await settle(page, 400);

  // 0f. A welcome video opens into its article; closed by dragging down.
  await page
    .getByLabel(/Willkommen im SPA Garden Club/)
    .first()
    .click();
  await page.getByRole('button', { name: 'Schließen' }).waitFor({ timeout: 10000 });
  await settle(page, 900);
  await shot(page, '00f-article');
  await page.mouse.move(195, 420);
  await page.mouse.down();
  for (let y = 430; y <= 680; y += 25) await page.mouse.move(195, y);
  await page.waitForTimeout(60);
  await shot(page, '00g-article-dragging');
  await page.mouse.up();
  const closed = await page
    .getByRole('button', { name: 'Schließen' })
    .waitFor({ state: 'detached', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!closed) failures.push('expander: a swipe down did not close the article');
  if (!closed) await page.getByRole('button', { name: 'Schließen' }).click();

  // 1. Feeds (slide 3)
  await page.goto(BASE + '/signale');
  // A single channel shows no tab bar; with several, pick the SPA Gold Desk explicitly.
  await page.getByText('XAUUSD').first().waitFor({ timeout: 20000 });
  if ((await page.getByRole('tab', { name: /SPA Gold Desk/ }).count()) > 0)
    await selectChannel(page, 'SPA Gold Desk');
  await settle(page);
  await shot(page, '01-feed-gold-desk');

  // 2. Thread (deep link, as a shared link would open it)
  const threadId = await pickThread();
  await page.goto(`${BASE}/signale/post/${encodeURIComponent(threadId)}`);
  await page
    .getByText(/Verlauf|Antwort/)
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  await settle(page);
  await shot(page, '03-thread');

  // 3. Mitglieder (slide 2): as a guest (default), then the presenter flips "Ansicht".
  await page.goto(BASE + '/mitglieder');
  await page.getByText('Trading Basic Academy').first().waitFor({ timeout: 15000 });
  await settle(page);
  await shot(page, '04-members-prospect');
  const lockedAsProspect = await page.getByText('Gesperrt').count();
  if (lockedAsProspect === 0) failures.push('members: a guest sees nothing locked');
  const viewSwitch = page.getByRole('tab', { name: 'Club', exact: true });
  if ((await viewSwitch.count()) > 0) {
    await viewSwitch.first().click();
    await settle(page, 800);
    await shot(page, '04b-members-club');
    const lockedAsClub = await page.getByText('Gesperrt').count();
    if (lockedAsClub >= lockedAsProspect)
      failures.push(`members: club view unlocked nothing (${lockedAsClub} vs ${lockedAsProspect} locks)`);
    // The area switch comes first in the header; the Ansicht switch also has an "Orangerie".
    await page.getByRole('tab', { name: 'Gast', exact: true }).click();
    await page.getByRole('tab', { name: 'Orangerie', exact: true }).first().click();
    await settle(page, 800);
    await shot(page, '04c-members-orangerie-area-guest');
    await page.getByRole('tab', { name: 'SPA Garden Club', exact: true }).click();
  } else {
    console.log('  (no Ansicht switch: server without DEMO_CONTROLS)');
  }

  await page.getByText('Trading Basic Academy').first().click();
  await page.getByText('Positionsgröße & Risiko pro Trade').first().waitFor({ timeout: 15000 });
  await settle(page);
  await shot(page, '05-course-detail');

  await page.getByText('Positionsgröße & Risiko pro Trade').first().click();
  await page.waitForURL(/\/mitglieder\/[^/]+\/[^/]+/, { timeout: 15000 });
  await settle(page);
  await shot(page, '06-lesson');

  // 5. LIVE: the presenter demo, driven through the app's own header button.
  await page.goto(BASE + '/signale');
  await page.getByText('XAUUSD').first().waitFor({ timeout: 20000 });
  await settle(page, 1500); // let the WebSocket connect
  let navigations = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
  const demoButton = page.getByRole('button', { name: 'Demo', exact: true });
  await demoButton.waitFor({ timeout: 10000 });
  await demoButton.click();
  await page.getByText('Warte auf Signale').first().waitFor({ timeout: 10000 });
  await shot(page, '08-live-before');
  const t0 = Date.now();
  await page.getByText('SELL NOW').first().waitFor({ timeout: 15000 });
  console.log(`  live signal rendered ${Date.now() - t0} ms after the feed cleared (no reload: ${navigations === 0})`);
  if (navigations !== 0) failures.push('live check: the page navigated/reloaded');
  await settle(page, 400);
  await shot(page, '09-live-after-first-post');
  await page.getByText('TP3 HIT').first().waitFor({ timeout: 30000 });
  await settle(page, 800);
  await shot(page, '10-live-after-demo');
  await page.getByRole('button', { name: 'Beenden', exact: true }).click();
  await page.getByRole('button', { name: 'Demo', exact: true }).waitFor({ timeout: 10000 });
  await settle(page, 800);
  // A line only the demo posts (the snapshot also has "TP3 HIT" replies).
  if ((await page.getByText('trade is risk free').count()) > 0)
    failures.push('live check: demo posts still visible after "Beenden"');
  const left = (await getJson('/v1/channels/gold-desk/posts?limit=50')).posts.filter((p) =>
    p.sourceId.startsWith('demo-'),
  );
  if (left.length) failures.push(`live check: ${left.length} demo post(s) left on the server after "Beenden"`);
} catch (e) {
  failures.push(String(e?.stack ?? e));
  await page.screenshot({ path: join(OUT, 'zz-failure.png') }).catch(() => {});
} finally {
  await browser.close();
}

if (consoleErrors.length) console.log('console errors:\n  ' + consoleErrors.join('\n  '));
if (failures.length) {
  console.error('FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`ok — ${shots.length} screenshots in ${OUT}`);
