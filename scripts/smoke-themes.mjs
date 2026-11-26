// Check appearance across normal pages, iframe audio and the offline export.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { part2LessonOne } from '../content/part2/lesson-01.ts';

const root = resolve('.static-site'), base = '/ash-shifahiya-app/';
const key = 'shifahiya-theme-v1';
const artifacts = process.env.SMOKE_ARTIFACTS;
if (artifacts) await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    assert(url.pathname.startsWith(base));
    let path = url.pathname.slice(base.length) || 'index.html';
    if (path.endsWith('/')) path += 'index.html';
    if (path === 'seed.html') return res.end('<!doctype html><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"><title>Seed</title>');
    const file = resolve(root, path);
    assert(file.startsWith(root + '/'));
    const body = await readFile(file);
    res.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      res.writeHead(206, { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` });
      res.end(body.subarray(start, end + 1));
    } else res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}${base}`;
let browser;
const errors = [];
const track = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} (${m.location().url})`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
};
const theme = (page, value) => page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
const shot = async (page, name) => { if (artifacts) await page.screenshot({ path: resolve(artifacts, name + '.png') }); };
const fits = async page => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Theme controls must fit a narrow screen');
const contrast = async page => {
  const ratios = await page.evaluate(() => {
    const color = token => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      probe.remove();
      const linear = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    return [['--ink', '--paper'], ['--ink-soft', '--paper'], ['--ink', '--surface'],
      ['--green', '--mint'], ['--on-accent', '--button-green'], ['--on-accent', '--button-blue'], ['--red', '--red-soft']]
      .map(([text, background]) => { const a = color(text), b = color(background);
        return { text, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
  });
  for (const pair of ratios) assert(pair.ratio >= 4.5, `${pair.text} on ${pair.background}: ${pair.ratio}`);
};

try {
  browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Podcast thumbnails are external to the app and this appearance check.
  await context.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'image' && !request.url().startsWith(site)) {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/>' });
    }
    return route.continue();
  });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    window.__themeAtReady = document.documentElement.dataset.theme;
  }));
  const page = await context.newPage(); track(page);
  await page.goto(site + 'seed.html');
  await page.evaluate(key => {
    localStorage.setItem(key, 'sepia');
    localStorage.setItem('shifahiya-lesson-1', '7');
    localStorage.setItem('shifahiya-listening-87-v1', JSON.stringify({ position: 23, rate: 1 }));
  }, key);
  await page.goto(site, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => window.__themeAtReady), 'sepia');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  const picker = page.locator('.theme-picker');
  for (const value of ['light', 'dark', 'sepia']) {
    await picker.locator(`[data-theme-choice="${value}"]`).click();
    await theme(page, value);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), value);
    assert.equal(await picker.locator('[aria-pressed="true"]').count(), 1);
    assert.equal(await picker.locator(`[data-theme-choice="${value}"]`).getAttribute('aria-pressed'), 'true');
    await fits(page); await contrast(page);
    await shot(page, `menu-${value}`);
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('shifahiya-lesson-1')), '7');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('shifahiya-listening-87-v1')).position), 23);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => window.__themeAtReady), 'sepia');
  await page.setViewportSize({ width: 320, height: 844 });
  for (const route of ['podcasts/', 'topics/']) {
    await page.goto(site + route, { waitUntil: 'networkidle' });
    await theme(page, 'sepia');
    await fits(page);
    await page.locator('.theme-menu summary').click();
    await fits(page);
    const box = await page.locator('.theme-picker').boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 320);
    await page.locator('[data-theme-choice="dark"]').click();
    await theme(page, 'dark'); await contrast(page);
    assert.equal(await page.locator('.theme-menu').getAttribute('open'), null);
    await shot(page, `${route.slice(0, -1)}-dark`);
    await page.evaluate(() => window.ShifahiyaTheme.set('sepia'));
  }
  console.log('Three palettes, contrast, early restoration, mobile layouts and all site routes passed');

  const catalog = JSON.parse(await readFile(resolve(root, 'text-and-audio/catalog.json'), 'utf8'));
  await page.evaluate(({ catalog, revision }) => {
    for (let id = 1; id <= 100; id += 1) localStorage.setItem(`shifahiya-lesson-${id}`, '10');
    localStorage.setItem('shifahiya-exams-v1', JSON.stringify({ final: { best: 114, attempts: 1 } }));
    localStorage.setItem('shifahiya-listening-progress-v1', JSON.stringify(Object.fromEntries(catalog
      .filter(c => (c.courseId || 1) === 1).map(c => [c.lessonId, { completed: true, updatedAt: Date.now() }]))));
    localStorage.setItem('shifahiya-p2-session-1', JSON.stringify({ lessonId: 1, contentRevision: revision,
      flowVersion: 3, wordPlanIndex: 140, view: 'listening', index: 0, score: 0, vocabularyScore: 70,
      round: 2, mistakes: [], contextIndex: 0, updatedAt: Date.now() }));
  }, { catalog, revision: part2LessonOne.revision });
  await page.goto(site + '?course=2', { waitUntil: 'networkidle' });
  await page.locator('.continue-learning').click();
  const dock = page.locator('[data-lesson-player]');
  await dock.locator('audio').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-lesson-player]')?.shadowRoot?.querySelector('audio')?.readyState > 0);
  await dock.locator('#settings-toggle').click();
  await dock.locator('audio').evaluate(a => { a.currentTime = 42; });
  await dock.locator('#theme').selectOption('dark');
  await theme(page, 'dark');
  await fits(page);
  assert.equal(await dock.locator('.listening-player').evaluate(el => getComputedStyle(el).colorScheme), 'dark');
  assert(Math.abs(await dock.locator('audio').evaluate(a => a.currentTime) - 42) < 1);
  const transcriptFrame = page.frameLocator('iframe[title="Текст и аудио урока"]');
  await transcriptFrame.locator('html[data-theme="dark"]').waitFor();
  await shot(page, 'embedded-dark');

  const standalone = await context.newPage(); track(standalone);
  await standalone.goto(site + 'text-and-audio.html?v=13&course=2&lesson=1', { waitUntil: 'networkidle' });
  await standalone.locator('#settings-toggle').click();
  await standalone.locator('#theme').selectOption('sepia');
  await theme(page, 'sepia');
  await transcriptFrame.locator('html[data-theme="sepia"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-lesson-player]')?.shadowRoot?.querySelector('#theme')?.value === 'sepia');
  await contrast(standalone); await shot(standalone, 'player-sepia');
  assert(Math.abs(await dock.locator('audio').evaluate(a => a.currentTime) - 42) < 1);
  console.log('Cross-tab changes, iframe transcript, docked native audio and saved playback position passed');

  const downloading = standalone.waitForEvent('download');
  await standalone.locator('#download').click();
  const downloaded = await downloading;
  const file = await downloaded.path();
  const offlineContext = await browser.newContext();
  const offline = await offlineContext.newPage(); track(offline);
  const requests = [];
  await offline.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
  // Cloud Chrome forbids file: navigation. Render the downloaded bytes in an
  // opaque document instead, with every external request blocked.
  await offline.setContent(await readFile(file, 'utf8'));
  await offline.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  await theme(offline, 'sepia'); await contrast(offline);
  assert.equal(await offline.locator('link[rel="stylesheet"], script[src]').count(), 0);
  await offline.locator('#settings-toggle').click();
  await offline.locator('#theme').selectOption('dark');
  await theme(offline, 'dark'); await contrast(offline);
  assert.deepEqual(requests, []);
  await offlineContext.close();

  const blocked = await browser.newContext();
  await blocked.addInitScript(key => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) throw new DOMException('blocked', 'SecurityError'); return read.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('blocked', 'SecurityError'); return write.call(this, name, value); };
  }, key);
  const temporary = await blocked.newPage(); track(temporary);
  await temporary.goto(site, { waitUntil: 'networkidle' });
  await temporary.getByRole('button', { name: 'Меню', exact: true }).click();
  await temporary.locator('[data-theme-choice="dark"]').click();
  await theme(temporary, 'dark');
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log('Offline export retains appearance without network requests; blocked preference storage is handled');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
