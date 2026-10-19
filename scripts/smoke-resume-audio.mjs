// Verify real media continuation through the static Pages subdirectory.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { createListeningPlayback } from '../public/text-and-audio/playback.js';

const root = resolve('.static-site'), base = '/ash-shifahiya-app/';
const playback = createListeningPlayback();
const key = playback.KEY, study = playback.studyKey(1, 87), reading = playback.studyKey(2, 11);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    assert(url.pathname.startsWith(base));
    const relative = url.pathname.slice(base.length);
    const file = resolve(root, relative || 'index.html');
    assert(file.startsWith(root + '/'));
    const body = await readFile(file);
    res.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream');
    res.setHeader('accept-ranges', 'bytes');
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
    } else res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}${base}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  const home = () => page.goto(site, { waitUntil: 'networkidle' });
  const mini = page.locator('.resume-audio');
  const position = name => page.evaluate(name => JSON.parse(localStorage.getItem(name) || '{}').position, name);
  const restored = async (target, expected) => {
    await target.waitForFunction(expected => {
      const audio = document.querySelector('audio');
      return audio?.readyState > 0 && !audio.seeking && Math.abs(audio.currentTime - expected) < 0.6;
    }, expected);
  };
  const play = async target => {
    const before = await target.locator('audio').evaluate(audio => audio.currentTime);
    await target.locator('audio').evaluate(audio => audio.play());
    await target.waitForFunction(before => document.querySelector('audio').currentTime > before + 1.2, before);
    await target.locator('audio').evaluate(audio => audio.pause());
  };

  await home();
  assert.equal(await mini.count(), 0);
  await page.evaluate(study => localStorage.setItem(study, JSON.stringify({ position: 123.5, rate: 1.25, loop: false })), study);
  await home();
  await restored(page, 123.5);
  assert.match(await mini.innerText(), /Шифахия · Урок 87/);
  assert(await mini.locator('audio').evaluate(audio => audio.paused), 'A homepage visit must not start playback');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert((await mini.getByRole('button', { name: 'Закрыть аудиоплеер' }).boundingBox()).height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.SMOKE_ARTIFACTS) {
    await mkdir(process.env.SMOKE_ARTIFACTS, { recursive: true });
    await mini.screenshot({ path: resolve(process.env.SMOKE_ARTIFACTS, 'resume-audio-mobile.png') });
  }
  await mini.getByRole('button', { name: 'Закрыть аудиоплеер' }).click();
  await mini.waitFor({ state: 'detached' });
  assert.equal(await position(study), 123.5);
  await home();
  assert.equal(await mini.count(), 0, 'Closing the player should survive a homepage reload');

  await page.goto(`${site}text-and-audio.html?lesson=87`);
  await restored(page, 123.5);
  await play(page);
  const fullPosition = await position(study);
  assert(fullPosition > 124);
  await home();
  await restored(page, fullPosition);
  await play(page);
  const miniPosition = await position(study);
  assert(miniPosition > fullPosition);
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: 'Показать личный прогресс', exact: true }).click();
  const timeStat = page.locator('.stats-grid > div').filter({ hasText: 'прослушано аудио' });
  assert.notEqual(await timeStat.locator('strong').innerText(), '0 мин', 'Playback on the homepage must reach the live statistics');
  await page.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
  await page.reload();
  await restored(page, miniPosition);
  await mini.getByRole('link', { name: 'Текст урока →' }).click();
  await restored(page, miniPosition);
  // Retrying the same source must not save the transient zero from audio.load().
  await page.locator('audio').evaluate(audio => audio.load());
  await restored(page, miniPosition);
  assert(Math.abs(await position(study) - miniPosition) < 0.6);
  console.log('Legacy position, no autoplay, close/reload and full-to-mini continuation passed');

  // Leaving before metadata arrives must preserve the old bookmark.
  const requests = [];
  await page.route('**/audio/shifahiya-1/lesson-87.mp3', route => { requests.push(route); });
  await page.goto(`${site}text-and-audio.html?lesson=87`, { waitUntil: 'domcontentloaded' });
  await page.locator('.listening-player:not([hidden])').waitFor();
  await page.evaluate(() => {
    document.querySelector('audio').dispatchEvent(new Event('timeupdate'));
    dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  assert(Math.abs(await position(study) - miniPosition) < 0.6);
  for (const request of requests) await request.abort().catch(() => {});
  await page.unroute('**/audio/shifahiya-1/lesson-87.mp3');
  await home();
  await restored(page, miniPosition);
  await mini.locator('audio').evaluate(audio => audio.play());
  await page.waitForFunction(() => !document.querySelector('audio').paused);
  await page.locator('.continue-learning').click();
  await page.locator('.word-card').waitFor();
  assert.equal(await mini.count(), 0);
  await page.getByRole('button', { name: 'На главную', exact: true }).click();
  await mini.waitFor();
  assert(await mini.locator('audio').evaluate(audio => audio.paused));

  // A paused homepage preview cannot overwrite another tab's completed audio.
  const other = await context.newPage();
  other.on('pageerror', error => errors.push(error.message));
  await other.goto(`${site}text-and-audio.html?lesson=87`);
  await other.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  await other.locator('audio').evaluate(audio => { audio.currentTime = audio.duration - 0.3; });
  await other.locator('audio').evaluate(audio => audio.play());
  await mini.waitFor({ state: 'detached' });
  await other.waitForFunction(() => document.querySelector('audio').ended);
  await other.close();
  await home();
  assert.equal(await mini.count(), 0);
  assert.equal(await position(study), 0, 'A completed recording must not be revived by preview cleanup');
  console.log('Interrupted loading, view cleanup and cross-tab completion passed');

  await page.evaluate(reading => {
    localStorage.removeItem('shifahiya-listening-active-v1');
    localStorage.setItem(reading, JSON.stringify({ position: 42, rate: 1 }));
    localStorage.setItem('shifahiya-listening-reviews-v1', JSON.stringify({ '2:11': {
      active: true, studiedOn: '2026-10-01', repeatedOn: [], updatedAt: Date.now(),
    } }));
  }, reading);
  await page.goto(`${site}text-and-audio.html?course=2&lesson=11&review=1`);
  await restored(page, 0);
  await page.locator('audio').evaluate(audio => { audio.currentTime = 79; });
  await play(page);
  const reviewPosition = await page.locator('audio').evaluate(audio => audio.currentTime);
  assert.equal(await position(reading), 42, 'Review playback must not move the ordinary lesson position');
  await home();
  await restored(page, reviewPosition);
  assert.match(await mini.innerText(), /повторение/);
  await mini.getByRole('link', { name: 'Текст урока →' }).click();
  await restored(page, reviewPosition);
  await home();
  await restored(page, reviewPosition);
  await page.evaluate(() => {
    window.audioBeforeClose = document.querySelector('audio');
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await mini.getByRole('button', { name: 'Закрыть аудиоплеер' }).click();
  await mini.waitFor({ state: 'detached' });
  assert(await page.evaluate(() => window.audioBeforeClose.paused));
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  assert.deepEqual(errors, []);
  console.log('Independent review position, resume link and close without storage passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
