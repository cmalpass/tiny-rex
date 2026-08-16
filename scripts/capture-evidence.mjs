#!/usr/bin/env node
// Playability evidence driver for Tiny Rex.
//
// Drives the game in headless Chrome through the window.TINY_REX debug handle
// and records: a full playthrough video plus one screenshot per key screen.
//
// Usage:
//   npm i playwright-core          (dev dependency, only needed here)
//   npm run dev &                  (default) or start your own server
//   node scripts/capture-evidence.mjs [url]
//
// Defaults to http://127.0.0.1:5173. Output goes to docs/evidence/.
// Screenshots marked "harness-assisted" use the debug handle to jump the
// simulation (pit drop, goal teleport); all other frames are genuine play.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(REPO, 'docs', 'evidence');
const VIDEO_DIR = join(OUT, '.video-tmp');
const TARGET_URL = process.argv[2] || 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (msg) => console.log(`[t=${((Date.now() - t0) / 1000) | 0}s] ${msg}`);

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 960, height: 540 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 960, height: 540 } },
});
const page = await ctx.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const snap = async (name) => {
  await page.locator('#game').screenshot({ path: join(OUT, name) });
  log(`snap ${name}`);
};
const state = () =>
  page.evaluate(() => {
    const g = window.TINY_REX.game;
    const p = g.player;
    return {
      state: g.state,
      x: p ? Math.round(p.x) : null,
      y: p ? Math.round(p.y) : null,
      hearts: p ? p.hearts : null,
      score: g.score,
      time: Math.round(g.time * 10) / 10,
      deaths: g.deaths,
      stomps: g.stomps,
      checkpoint: g.checkpoint ? `${g.checkpoint.x},${g.checkpoint.y}` : 'none',
    };
  });
const say = (label) => state().then((s) => log(`${label}: ${JSON.stringify(s)}`));

// --------------------------------------------------------------------------
await page.goto(TARGET_URL, { waitUntil: 'load' });
await page.waitForFunction('window.TINY_REX !== undefined', null, { timeout: 10000 });
await sleep(1200); // let the menu animation settle

// 1. Title screen
await snap('01-menu.png');
await say('menu');

// 2. Start the run; bot holds right + jumps periodically (genuine gameplay)
await page.evaluate(() => window.TINY_REX.game.handleKey('primary'));
await sleep(700);
await snap('02-run-start.png');
await say('run start');

const jumpTimer = setInterval(() => {
  page
    .evaluate(() => {
      const i = window.TINY_REX.game.input;
      i.touchBtn('jump', true);
      setTimeout(() => i.touchBtn('jump', false), 220);
    })
    .catch(() => {});
}, 800);
await page.evaluate(() => {
  window.TINY_REX.game.input.touch.right = true;
});
await sleep(3800);
await snap('03-running.png');
await say('running');

// 3. Death (harness-assisted pit drop): dying -> gameover panel
clearInterval(jumpTimer);
await page.evaluate(() => {
  const g = window.TINY_REX.game;
  if (g.state === 'playing') g.player.y = 720; // below killY (680)
});
await page.waitForFunction('window.TINY_REX.game.state === "dying"', null, { timeout: 5000 });
await sleep(350);
await snap('04-dying.png');
await say('dying');
await page.waitForFunction('window.TINY_REX.game.state === "gameover"', null, { timeout: 6000 });
await sleep(400);
await snap('05-gameover.png');
await say('gameover');

// 4. Respawn from the checkpoint
await page.evaluate(() => window.TINY_REX.game.handleKey('primary'));
await sleep(900);
await snap('06-respawn.png');
await say('respawn');

// 5. Pause overlay while actually playing
await sleep(1200);
await page.evaluate(() => window.TINY_REX.game.handleKey('pause'));
await sleep(400);
await snap('07-paused.png');
await say('paused');
await page.evaluate(() => window.TINY_REX.game.handleKey('pause'));
await sleep(400);

// 6. Victory (harness-assisted teleport onto the goal)
await sleep(1200);
await page.evaluate(() => {
  const g = window.TINY_REX.game;
  if (g.state !== 'playing') g.handleKey('primary'); // respawn if the bot died
  const p = g.player;
  p.x = 7126; // goal is at x=7150 (hitbox 7116..7184)
  p.y = 414; // feet on the ground line (460)
  p.vx = 0;
  p.vy = 0;
});
await page.waitForFunction('window.TINY_REX.game.state === "victory"', null, { timeout: 5000 });
await sleep(700);
await snap('08-victory-intro.png');
await say('victory intro');
await sleep(1800);
await snap('09-victory.png');
await say('victory screen');

await sleep(600); // tail of the video
await page.close();
await browser.close();

const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'));
if (videos.length) copyFileSync(join(VIDEO_DIR, videos[0]), join(OUT, 'playthrough.webm'));
console.log(`video -> ${join(OUT, 'playthrough.webm')}`);
console.log('page errors:', pageErrors.length ? pageErrors : 'none');
process.exit(pageErrors.length ? 1 : 0);
