// Use the real HTTP cache: Playwright request routing would disable it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.static-site'), base = '/ash-shifahiya-app/';
const catalogPath = 'text-and-audio/catalog.json';
const textPath = 'text/shifahiya-1/lesson-96.json';
const audioPath = 'audio/shifahiya-1/lesson-96.mp3';
const catalog = JSON.parse(await readFile(resolve(root, catalogPath), 'utf8'));
const entry = catalog.find(item => (item.courseId ?? 1) === 1 && item.lessonId === 96);
const transcript = JSON.parse(await readFile(resolve(root, textPath), 'utf8'));
const recording = await readFile(resolve(root, audioPath));
const previous = catalog.find(item => (item.courseId ?? 1) === 1 && item.lessonId === 87);
const legacyCatalog = catalog.map(item => item === entry
  ? { ...item, textSrc: './' + textPath, audioSrc: './' + audioPath, duration: previous.duration }
  : item);
const stale = new Map([
  [catalogPath, Buffer.from(JSON.stringify(legacyCatalog))],
  [textPath, Buffer.from(JSON.stringify({ lessonId: 96, paragraphs: ['Старая копия текста'] }))],
  [audioPath, await readFile(resolve(root, previous.audioSrc.split('?')[0]))],
]);
let published = false;
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    assert(url.pathname.startsWith(base));
    const relative = url.pathname.slice(base.length) || 'index.html';
    const file = resolve(root, relative);
    assert(file.startsWith(root + '/'));
    const body = relative === 'seed.html' ? Buffer.from('<!doctype html><meta charset="utf-8"><title>Cache seed</title>')
      : !published && stale.has(relative) ? stale.get(relative) : await readFile(file);
    requests.push({ relative, search: url.search, published });
    // Simulate a browser that still considers the old Pages assets fresh.
    res.setHeader('cache-control', extname(relative) === '.html' ? 'no-store' : 'public, max-age=3600');
    res.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream');
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(site + 'seed.html');
  const seed = async () => page.evaluate(async paths => {
    await Promise.all(paths.map(async path => { await (await fetch('./' + path)).arrayBuffer(); }));
  }, [catalogPath, textPath, audioPath]);
  await seed();
  const warmed = requests.length;
  await seed();
  assert.equal(requests.length, warmed, 'The regression must start with cached old assets');
  published = true;
  requests.length = 0;
  await page.goto(site + 'text-and-audio.html?v=9&lesson=96');
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  assert.deepEqual(await page.locator('#listening-transcript > *').allTextContents(), transcript.paragraphs);
  assert((await page.locator('#listening-transcript').innerText()).includes('أَنَا نِمْتُ فِي هَذِهِ الْحُجْرَةِ وَحْدِي.'));
  assert(Math.abs(await page.locator('audio').evaluate(a => a.duration) - entry.duration) < 0.2);
  assert(requests.some(req => req.relative === catalogPath));
  assert(requests.some(req => req.relative === textPath && req.search));
  assert(requests.some(req => req.relative === audioPath && req.search));
  const audioVersion = new URL(entry.audioSrc, site).searchParams.get('v');
  assert.equal(await page.locator('audio').evaluate(a => new URL(a.currentSrc).searchParams.get('v')), audioVersion);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать урок для занятий без интернета', exact: true }).click();
  const download = await downloadEvent;
  const html = await readFile(await download.path(), 'utf8');
  const encoded = html.match(/data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)/)[1];
  const hash = body => createHash('sha256').update(body).digest('hex');
  assert.equal(hash(Buffer.from(encoded, 'base64')), hash(recording), 'Offline HTML must contain the current recording');
  assert(html.includes('أَنَا نِمْتُ فِي هَذِهِ الْحُجْرَةِ وَحْدِي.'));

  await page.locator('audio').evaluate(a => { a.currentTime = 25; });
  await page.waitForFunction(() => !document.querySelector('audio').seeking);
  await page.locator('audio').evaluate(a => a.play());
  await page.waitForFunction(() => document.querySelector('audio').currentTime > 25.4);
  await page.locator('audio').evaluate(a => a.pause());
  await page.goto(site, { waitUntil: 'networkidle' });
  const mini = page.locator('.resume-audio');
  await mini.waitFor();
  await page.waitForFunction(() => document.querySelector('.resume-audio audio')?.readyState > 0);
  assert.equal(await mini.locator('audio').evaluate(a => new URL(a.currentSrc).searchParams.get('v')), audioVersion);
  assert(Math.abs(await mini.locator('audio').evaluate(a => a.duration) - entry.duration) < 0.2);
  const href = await mini.getByRole('link', { name: 'Текст урока →' }).getAttribute('href');
  assert.equal(new URL(href, site).searchParams.get('v'), '9');
  await mini.getByRole('link', { name: 'Текст урока →' }).click();
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  assert.deepEqual(await page.locator('#listening-transcript > *').allTextContents(), transcript.paragraphs);
  assert.equal(requests.filter(req => req.relative === catalogPath).length, 2, 'Each opening must request the current catalog');
  assert.equal(requests.filter(req => req.relative === textPath).length, 2, 'Each opening must request the current text');
  assert.deepEqual(errors, []);
  console.log('Cached old catalog, text and audio are replaced by the corrected lesson; download, homepage audio and reopening use the new version.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
