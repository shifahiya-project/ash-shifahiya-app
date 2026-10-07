// Exercise the supplied self-contained pilot and its links in the static site.
// Run after npm run build:static: node scripts/smoke-listening.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.static-site');
const base = '/ash-shifahiya-app/';
const pilot = 'text-and-audio-87-88.html';
const source = process.argv[2] ? await readFile(process.argv[2], 'utf8') : null;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/original.html' && source) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(source);
      return;
    }
    assert(path.startsWith(base));
    const file = resolve(root, path.slice(base.length) || 'index.html');
    assert(file.startsWith(root + '/'));
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
    res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM ?? '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  // No external service is needed to read or play this pilot.
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) {
      errors.push(`Unexpected external request: ${route.request().url()}`);
      return route.abort();
    }
    return route.continue();
  });
  const originals = new Map();
  if (source) {
    await page.goto(`${origin}/original.html`);
    for (const id of [87, 88]) {
      await page.getByRole('button', { name: `Урок ${id}`, exact: true }).click();
      await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
      originals.set(id, await page.locator('#listening-transcript').textContent());
    }
  }
  for (const id of [87, 88]) {
    await page.goto(`${origin}${base}${pilot}?lesson=${id}`);
    assert.equal(await page.getByRole('link', { name: '← К курсу' }).getAttribute('href'), './');
    assert(await page.getByRole('link', { name: 'Скачать для занятий без интернета' }).getAttribute('download') !== null);
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    const audio = page.locator('audio');
    assert(await audio.evaluate(a => a.duration > 400 && !a.error));
    const transcript = page.locator('#listening-transcript');
    const exactText = await transcript.textContent();
    if (source) assert.equal(exactText, originals.get(id), `Lesson ${id} source text changed`);
    await context.setOffline(true);
    await audio.evaluate(a => a.play());
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 0.2);
    await audio.evaluate(a => { a.pause(); a.currentTime = 30; });
    await page.waitForFunction(() => document.querySelector('audio').currentTime === 30);
    await page.getByRole('button', { name: 'Вперёд на 10 секунд' }).click();
    assert.equal(await audio.evaluate(a => a.currentTime), 40);
    await page.getByRole('button', { name: 'Назад на 10 секунд' }).click();
    assert.equal(await audio.evaluate(a => a.currentTime), 30);
    await page.getByLabel('Скорость').selectOption('1.25');
    assert.equal(await audio.evaluate(a => a.playbackRate), 1.25);
    await page.getByRole('button', { name: 'Повтор записи' }).click();
    assert(await audio.evaluate(a => a.loop));
    await page.getByRole('button', { name: 'Огласовки', exact: true }).click();
    assert.notEqual(await transcript.textContent(), exactText);
    await page.getByRole('button', { name: 'Огласовки', exact: true }).click();
    assert.equal(await transcript.textContent(), exactText);
    const size = await transcript.evaluate(e => getComputedStyle(e).fontSize);
    await page.getByRole('button', { name: 'Увеличить текст' }).click();
    assert.notEqual(await transcript.evaluate(e => getComputedStyle(e).fontSize), size);
    await page.getByRole('button', { name: 'Скрыть текст' }).click();
    assert(await transcript.isHidden());
    await page.getByRole('button', { name: 'Показать текст' }).click();
    assert(await transcript.isVisible());
    await page.evaluate(() => window.scrollTo(0, 800));
    const top = await page.locator('.listening-player').evaluate(e => e.getBoundingClientRect().top);
    assert(Math.abs(top - 8) < 2, 'Player must remain available while scrolling');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
    await context.setOffline(false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    assert.equal(await audio.evaluate(a => Math.round(a.currentTime)), 30);
    assert.equal(await audio.evaluate(a => a.playbackRate), 1.25);
    assert(await audio.evaluate(a => a.loop));
    console.log(`Lesson ${id}: offline playback, controls, exact text and saved position verified`);
  }
  await page.goto(origin + base);
  assert.equal(await page.getByRole('link', { name: 'Текст и аудио', exact: true }).count(), 0, 'Locked lessons expose no links');
  await page.evaluate(() => {
    localStorage.setItem('shifahiya-lesson-87', '1');
    localStorage.setItem('shifahiya-lesson-88', '1');
  });
  await page.reload();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: 'Показать уроки', exact: true }).click();
  await page.getByRole('button', { name: 'Показать все уроки', exact: true }).click();
  const links = page.getByRole('link', { name: 'Текст и аудио', exact: true });
  await links.first().waitFor();
  assert.equal(await links.count(), 2);
  for (let index = 0; index < 2; index++) {
    assert.equal(await links.nth(index).getAttribute('href'), `./text-and-audio.html?lesson=${87 + index}`);
  }
  await links.nth(1).click();
  await page.getByText('Первая часть · Урок 88', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '← К курсу' }).getAttribute('href'), './');
  assert(await page.getByRole('button', { name: 'Скачать урок для занятий без интернета', exact: true }).isVisible());
  assert.equal(await page.getByLabel('Выбрать урок').locator('option').count(), 10);
  await page.screenshot({ path: '/tmp/ash-listening-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('Static subdirectory links, lesson gates and mobile layout verified');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
