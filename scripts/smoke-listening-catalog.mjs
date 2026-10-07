// Validate every recording through the same static subdirectory used by Pages.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.static-site');
const base = '/ash-shifahiya-app/';
const catalog = JSON.parse(await readFile(resolve(root, 'text-and-audio/catalog.json'), 'utf8'));
assert(catalog.length > 0);
assert.equal(new Set(catalog.map(entry => entry.lessonId)).size, catalog.length);
assert.deepEqual(catalog.map(entry => entry.lessonId), [...catalog.map(entry => entry.lessonId)].sort((a, b) => a - b));
assert(catalog.some(entry => entry.lessonId === 87) && catalog.some(entry => entry.lessonId === 88), 'The original pilot lessons must join the shared catalog');
const listeningKey = 'shifahiya-listening-progress-v1';
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    assert(url.pathname.startsWith(base));
    const file = resolve(root, url.pathname.slice(base.length) || 'index.html');
    assert(file.startsWith(root + '/'));
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
    res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
    const body = await readFile(file);
    res.setHeader('accept-ranges', 'bytes');
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      assert(start <= end);
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
    } else {
      res.setHeader('content-length', body.length);
      res.end(body);
    }
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM ?? '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('request', req => requests.push(req.url()));
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true });
  await page.goto(origin + base);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ 150: { completed: true, updatedAt: 1 } }));
  }, listeningKey);
  for (const entry of catalog) {
    const transcript = JSON.parse(await readFile(resolve(root, entry.textSrc), 'utf8'));
    assert.equal(transcript.lessonId, entry.lessonId);
    if (entry.lessonId === 87 || entry.lessonId === 88) {
      await page.evaluate((id) => {
        localStorage.setItem(`shifahiya-listening-${id}-v1`, JSON.stringify({ position: 27.5, rate: 0.9, loop: false, showText: true, vocalized: true, fontSize: 30 }));
      }, entry.lessonId);
    }
    requests.length = 0;
    await page.goto(`${origin}${base}text-and-audio.html?lesson=${entry.lessonId}`);
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    const audio = page.locator('audio');
    const paragraphs = page.locator('#listening-transcript > *');
    assert.deepEqual(await paragraphs.allTextContents(), transcript.paragraphs, 'Source Unicode must be preserved');
    assert(Math.abs(await audio.evaluate(a => a.duration) - entry.duration) < 0.2);
    const settings = page.getByRole('button', { name: 'Настройки', exact: true });
    assert(await page.locator('#player-settings').isHidden(), 'Settings must start collapsed');
    assert.equal(await settings.getAttribute('aria-expanded'), 'false');
    assert(await audio.isVisible(), 'Audio controls must stay visible');
    const compactHeight = await page.locator('.listening-player').evaluate(e => e.offsetHeight);
    assert(compactHeight <= 64, 'Collapsed player must fit in one thin row');
    assert.equal(await page.locator('#audio-label').count(), 0, 'The player must not repeat the lesson title');
    if (entry.lessonId === 87 || entry.lessonId === 88) {
      await page.waitForFunction(() => document.querySelector('audio').currentTime === 27.5);
      assert.equal(await audio.evaluate(a => a.playbackRate), 0.9, 'The original pilot speed should survive the shared-player migration');
      assert.equal(await page.getByLabel('Скорость').inputValue(), '0.9');
    }
    assert(requests.filter(url => /\.mp3/.test(url)).every(url => url.endsWith(`lesson-${entry.lessonId}.mp3`)), 'Fetched another recording');
    const startPosition = await audio.evaluate(a => a.currentTime);
    await audio.evaluate(a => a.play());
    await page.waitForFunction(start => document.querySelector('audio').currentTime > start + 0.2, startPosition);
    await settings.focus();
    await page.keyboard.press('Enter');
    assert(await page.locator('#player-settings').isVisible());
    assert.equal(await settings.getAttribute('aria-expanded'), 'true');
    assert.equal(await audio.evaluate(a => a.paused), false, 'Opening settings must not interrupt playback');
    await settings.click();
    assert(await page.locator('#player-settings').isHidden());
    assert.equal(await audio.evaluate(a => a.paused), false, 'Closing settings must not interrupt playback');
    await settings.click();
    await audio.evaluate(a => { a.pause(); a.currentTime = 30; });
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio');
      return !audio.seeking && audio.readyState >= 2 && Math.round(audio.currentTime) === 30;
    });
    await page.getByRole('button', { name: 'Вперёд на 10 секунд' }).click();
    assert.equal(await audio.evaluate(a => a.currentTime), 40);
    await page.getByRole('button', { name: 'Назад на 10 секунд' }).click();
    assert.equal(await audio.evaluate(a => a.currentTime), 30);
    await page.getByLabel('Скорость').selectOption('1.25');
    assert.equal(await audio.evaluate(a => a.playbackRate), 1.25);
    await page.getByRole('button', { name: 'Повтор записи' }).click();
    assert(await audio.evaluate(a => a.loop));
    await page.getByRole('button', { name: 'Огласовки', exact: true }).click();
    assert.notDeepEqual(await paragraphs.allTextContents(), transcript.paragraphs);
    await page.getByRole('button', { name: 'Огласовки', exact: true }).click();
    assert.deepEqual(await paragraphs.allTextContents(), transcript.paragraphs);
    await page.getByRole('button', { name: 'Скрыть текст' }).click();
    assert(await page.locator('#listening-transcript').isHidden());
    await page.getByRole('button', { name: 'Показать текст' }).click();
    await page.getByRole('button', { name: 'Увеличить текст' }).click();
    assert.equal(await page.locator('#listening-transcript').evaluate(e => getComputedStyle(e).fontSize), '33px');
    await page.evaluate(() => scrollTo(0, 700));
    assert(Math.abs(await page.locator('.listening-player').evaluate(e => e.getBoundingClientRect().top) - 8) < 2);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator('.listening-player').evaluate(e => e.offsetHeight) > compactHeight);
    await settings.click();
    assert(await page.locator('#player-settings').isHidden());
    assert.equal(await audio.evaluate(a => Math.round(a.currentTime)), 30);
    assert.equal(await audio.evaluate(a => a.playbackRate), 1.25);
    assert(await audio.evaluate(a => a.loop));
    assert(Math.abs(await page.locator('.listening-player').evaluate(e => e.getBoundingClientRect().top) - 8) < 2, 'Collapsed player must stay sticky');
    if (entry.lessonId === 87) {
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => scrollTo(0, 700));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Collapsed player overflows');
        assert(await audio.isVisible());
        const bar = await page.locator('.player-bar').evaluate(e => {
          const audio = e.querySelector('audio').getBoundingClientRect();
          const button = e.querySelector('button').getBoundingClientRect();
          return { audioTop: audio.top, buttonTop: button.top, audioRight: audio.right, buttonLeft: button.left, target: button.width };
        });
        assert(Math.abs(bar.audioTop - bar.buttonTop) < 1 && bar.audioRight < bar.buttonLeft, 'Settings must sit beside the audio controls');
        assert(bar.target >= 44, 'Settings must keep an accessible touch target');
        await page.screenshot({ path: `/tmp/listening-compact-${width}.png` });
        await settings.click();
        assert(await page.getByRole('button', { name: 'Увеличить текст' }).isVisible());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded settings overflow');
        await page.screenshot({ path: `/tmp/listening-settings-${width}.png` });
        await settings.click();
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    assert(await page.locator('#player-settings').isHidden(), 'Reload must restore compact player');
    assert.equal(await audio.evaluate(a => Math.round(a.currentTime)), 30);
    assert.equal(await audio.evaluate(a => a.playbackRate), 1.25);
    assert(await audio.evaluate(a => a.loop));
    assert.notEqual(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key) ?? '{}')[id]?.completed, { key: listeningKey, id: entry.lessonId }), true, 'Playback alone must not mark text and audio as completed');
    await page.getByRole('button', { name: 'Текст и аудио пройдены', exact: true }).click();
    const marked = await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key))[id], { key: listeningKey, id: entry.lessonId });
    assert.equal(marked.completed, true);
    assert(Number.isFinite(marked.updatedAt) && marked.updatedAt > 0);
    assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[150], listeningKey), { completed: true, updatedAt: 1 }, 'Marking a lesson must preserve other and future lesson records');
    await page.reload();
    await page.locator('#complete[aria-pressed="true"]').waitFor();
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    if (entry.lessonId === 87) {
      const otherTab = await context.newPage();
      otherTab.on('pageerror', error => errors.push(error.message));
      await otherTab.goto(`${origin}${base}text-and-audio.html?lesson=87`);
      await otherTab.locator('#complete[aria-pressed="true"]').click();
      await page.locator('#complete[aria-pressed="false"]').waitFor();
      await page.getByRole('button', { name: 'Текст и аудио пройдены', exact: true }).click();
      await otherTab.locator('#complete[aria-pressed="true"]').waitFor();
      await otherTab.close();
    }
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать урок для занятий без интернета', exact: true }).click();
    const download = await downloadEvent;
    const downloaded = await readFile(await download.path(), 'utf8');
    assert(downloaded.includes('data:audio/mpeg;base64,'));
    const savedPage = await offline.newPage();
    savedPage.on('pageerror', error => errors.push(error.message));
    // Serve the saved document from memory. This tests its complete offline boot;
    // the managed Chromium image disallows navigating to file:// URLs.
    await savedPage.route('**/*', route => {
      if (route.request().isNavigationRequest()) return route.fulfill({ body: downloaded, contentType: 'text/html' });
      errors.push(`Offline file requested external resource: ${route.request().url()}`);
      return route.abort();
    });
    await savedPage.goto(`${origin}/offline-${entry.lessonId}.html`);
    await savedPage.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
    assert(await savedPage.locator('#player-settings').isHidden(), 'Offline player must start compact');
    await savedPage.getByRole('button', { name: 'Настройки', exact: true }).click();
    assert(await savedPage.getByRole('button', { name: 'Вперёд на 10 секунд' }).isVisible());
    await savedPage.getByRole('button', { name: 'Настройки', exact: true }).click();
    assert.deepEqual(await savedPage.locator('#listening-transcript > *').allTextContents(), transcript.paragraphs);
    await savedPage.locator('audio').evaluate(a => a.play());
    await savedPage.waitForFunction(() => document.querySelector('audio').currentTime > 0.2);
    await savedPage.close();
    console.log(`Lesson ${entry.lessonId}: exact text, audio, controls, separate completion, resume and offline download passed`);
  }
  await page.goto(origin + base);
  assert.equal(await page.getByRole('link', { name: 'Текст и аудио', exact: true }).count(), 0);
  await page.evaluate(() => { localStorage.setItem('shifahiya-lesson-100', '1'); });
  await page.reload();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: 'Показать уроки', exact: true }).click();
  await page.getByRole('button', { name: 'Показать все уроки', exact: true }).click();
  const links = page.getByRole('link', { name: 'Текст и аудио', exact: true });
  await links.first().waitFor();
  assert.equal(await links.count(), catalog.length);
  const hrefs = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  for (const entry of catalog) assert(hrefs.includes(`./text-and-audio.html?lesson=${entry.lessonId}`));
  await page.goto(`${origin}${base}text-and-audio.html?lesson=91`);
  await page.getByText('Первая часть · Урок 91', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Выбрать урок').locator('option').count(), catalog.length);
  await page.getByLabel('Выбрать урок').selectOption('87');
  await page.getByText('Первая часть · Урок 87', { exact: true }).waitFor();
  await page.getByLabel('Выбрать урок').selectOption('88');
  await page.getByText('Первая часть · Урок 88', { exact: true }).waitFor();
  await page.getByLabel('Выбрать урок').selectOption('100');
  await page.getByText('Первая часть · Урок 100', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/more-audio-mobile.png' });
  const missing = Array.from({ length: 100 }, (_, index) => index + 1).find(id => !catalog.some(entry => entry.lessonId === id));
  await page.goto(`${origin}${base}text-and-audio.html?lesson=${missing ?? 101}`);
  await page.getByRole('status').filter({ hasText: 'Не удалось открыть урок' }).waitFor();
  assert.equal(await page.locator('audio').getAttribute('src'), null);
  assert.deepEqual(errors, []);
  console.log('Lesson gates, catalog selection, subdirectory links and missing lesson handled correctly');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
