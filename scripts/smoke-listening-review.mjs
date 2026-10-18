// Exercise the real player, queue, calendar, backups and offline document.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.static-site');
const base = '/ash-shifahiya-app/';
const catalog = JSON.parse(await readFile(resolve(root, 'text-and-audio/catalog.json'), 'utf8'));
const key = 'shifahiya-listening-reviews-v1';
const legacyKey = 'shifahiya-p2-listening-progress-v1';
const timeKey = 'shifahiya-listening-time-v1';
const at = day => new Date(`${day}T07:00:00Z`);
const artifacts = process.env.SMOKE_ARTIFACTS;
async function screenshot(locator, name) {
  if (!artifacts) return;
  await mkdir(artifacts, { recursive: true });
  await locator.screenshot({ path: resolve(artifacts, name) });
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    assert(url.pathname.startsWith(base));
    const file = resolve(root, url.pathname.slice(base.length) || 'index.html');
    assert(file.startsWith(root + '/'));
    const body = await readFile(file);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
    res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Yekaterinburg' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.clock.install({ time: at('2026-10-18') });
  const setDay = async day => {
    await page.clock.setFixedTime(at(day));
    await page.evaluate(() => dispatchEvent(new Event('focus')));
  };
  const records = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key);
  const times = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), timeKey);
  const playBriefly = async target => {
    const before = await target.locator('audio').evaluate(audio => audio.currentTime);
    await target.locator('audio').evaluate(audio => audio.play());
    await target.waitForFunction(before => document.querySelector('audio').currentTime > before + 1.2, before);
    await target.locator('audio').evaluate(audio => audio.pause());
    await target.waitForFunction(() => document.querySelector('audio').paused);
  };
  const record = async () => (await records())['2:11'];
  const openPlayer = async (course = 2, lesson = 11, review = true) => {
    await page.goto(`${site}text-and-audio.html?course=${course}&lesson=${lesson}${review ? '&review=1' : ''}`);
    await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  };
  const home = () => page.goto(site, { waitUntil: 'networkidle' });
  const audioCard = page.locator('.listening-due');
  const repeat = page.locator('#review-complete');
  const openBackup = async () => {
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: 'Показать личный прогресс', exact: true }).click();
  };

  await home();
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('shifahiya-exams-v1', JSON.stringify({ final: { best: 150, attempts: 1 } }));
    for (let lesson = 1; lesson <= 11; lesson++) localStorage.setItem(`shifahiya-p2-lesson-${lesson}`, '1');
  });
  await openPlayer(2, 11, false);
  await playBriefly(page);
  await page.waitForFunction(key => Object.values(JSON.parse(localStorage.getItem(key) || '{}')).some(ms => ms > 0), timeKey);
  const firstTime = await times();
  assert(Object.keys(firstTime).every(id => id.startsWith('2:')));
  await page.locator('audio').evaluate(audio => { audio.currentTime += 30; });
  await page.clock.runFor(120000);
  assert.deepEqual(await times(), firstTime, 'Seeking and time spent paused must not count as listening');
  // Some browsers resume a buffered seek without sending another playing event.
  await page.locator('audio').evaluate(audio => audio.play());
  const sought = await page.locator('audio').evaluate(audio => {
    window.suppressPlaying = event => event.stopImmediatePropagation();
    audio.addEventListener('playing', window.suppressPlaying, true);
    audio.currentTime += 10;
    return audio.currentTime;
  });
  await page.waitForFunction(() => !document.querySelector('audio').seeking);
  const seekCheckpoint = Object.values(await times()).reduce((sum, ms) => sum + ms, 0);
  await page.waitForFunction(sought => document.querySelector('audio').currentTime > sought + 1.2, sought);
  await page.locator('audio').evaluate(audio => {
    audio.pause();
    audio.removeEventListener('playing', window.suppressPlaying, true);
  });
  await page.waitForFunction(({ key, before }) => Object.values(JSON.parse(localStorage.getItem(key) || '{}')).reduce((sum, ms) => sum + ms, 0) > before + 1000,
    { key: timeKey, before: seekCheckpoint });
  assert(await repeat.isHidden());
  await page.getByRole('button', { name: 'Текст и аудио пройдены', exact: true }).click();
  assert.equal((await record()).studiedOn, '2026-10-18');
  assert.equal((await record()).repeatedOn.length, 0);
  assert(await repeat.isDisabled());
  await page.locator('audio').evaluate(audio => { audio.currentTime = 42; audio.dispatchEvent(new Event('seeked')); });
  await home();
  await openBackup();
  const listeningStat = page.locator('.stats-grid > div').filter({ hasText: 'прослушано аудио' });
  assert.match(await listeningStat.innerText(), /< 1 мин.*прослушано аудио/s);
  assert.equal(await page.locator('.stats-grid > div').count(), 8);
  await page.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
  assert(await audioCard.getByRole('button', { name: 'Повторить аудио', exact: true }).isDisabled());

  await setDay('2026-10-19');
  await audioCard.getByRole('link', { name: 'Повторить аудио' }).waitFor();
  await screenshot(audioCard, 'home-audio-review.png');
  await audioCard.getByRole('link', { name: 'Повторить аудио' }).click();
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  assert.match(await page.locator('#review-context').innerText(), /1-е повторение из 7/);
  assert.equal(await page.locator('audio').evaluate(audio => audio.currentTime), 0, 'A fresh review starts at the beginning');
  await page.locator('audio').evaluate(audio => { audio.currentTime = 30; audio.dispatchEvent(new Event('seeked')); });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  assert.equal(await page.locator('audio').evaluate(audio => audio.currentTime), 30, 'An unfinished review resumes');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('shifahiya-p2-listening-11-v1')).position), 42);
  await page.locator('#settings-toggle').click();
  await page.locator('#rate').selectOption('1.25');
  await repeat.click();
  assert.deepEqual((await record()).repeatedOn, ['2026-10-19']);
  assert(await repeat.isDisabled());
  assert.match(await page.locator('#review-status').innerText(), /21 октября/);

  await setDay('2026-10-25');
  assert.equal(await page.locator('audio').evaluate(audio => audio.currentTime), 0, 'A later review also starts fresh in a tab left open');
  assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 1.25, 'Lesson preferences survive between reviews');
  await repeat.click();
  assert.deepEqual((await record()).repeatedOn, ['2026-10-19', '2026-10-25']);
  assert.match(await page.locator('#review-status').innerText(), /29 октября/);
  await page.locator('#complete').click();
  assert.equal((await record()).active, false);
  assert(await repeat.isHidden());
  await page.locator('#complete').click();
  assert.equal((await record()).active, true);
  assert.equal((await record()).studiedOn, '2026-10-18');
  assert.equal((await record()).repeatedOn.length, 2);
  await page.locator('#review-dates summary').click();
  assert.deepEqual(await page.locator('#review-schedule time').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.dateTime)),
    ['2026-10-18', '2026-10-19', '2026-10-25', '2026-10-29']);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The review controls and dates must fit');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page.locator('#audio-review'), 'player-review.png');
  console.log('Initial study, actual-date intervals, early guards, cancellation and separate review positions passed');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать урок для занятий без интернета', exact: true }).click();
  const html = await readFile(await (await downloading).path(), 'utf8');
  const offline = await browser.newContext({ offline: true, timezoneId: 'Asia/Yekaterinburg' });
  const saved = await offline.newPage();
  saved.on('pageerror', error => errors.push(error.message));
  await saved.clock.install({ time: at('2026-10-25') });
  await saved.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ body: html, contentType: 'text/html' });
    errors.push(`Offline document requested ${route.request().url()}`);
    return route.abort();
  });
  await saved.goto(`${site}offline-review.html`);
  await saved.waitForFunction(() => document.querySelector('audio')?.readyState > 0);
  await saved.locator('audio').evaluate(audio => audio.play());
  await saved.waitForFunction(() => document.querySelector('audio').currentTime > 0.1);
  await saved.locator('audio').evaluate(audio => audio.pause());
  await saved.waitForFunction(key => Object.values(JSON.parse(localStorage.getItem(key) || '{}')).some(ms => ms > 0), timeKey);
  await saved.locator('#complete').click();
  await saved.clock.setFixedTime(at('2026-10-26'));
  await saved.evaluate(() => dispatchEvent(new Event('focus')));
  await saved.locator('#review-complete').click();
  assert.equal(await saved.evaluate(key => JSON.parse(localStorage.getItem(key))['2:11'].repeatedOn.length, key), 1);
  assert.equal((await record()).repeatedOn.length, 2, 'Offline progress stays in its own storage');
  await offline.close();
  console.log('Downloaded module player works and records reviews without any external resources');

  await home();
  await openBackup();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить копию', exact: true }).click();
  const backup = JSON.parse(await readFile(await (await backupDownload).path(), 'utf8'));
  assert.equal(backup.version, 5);
  assert.deepEqual(backup.listeningTime, await times());
  assert.equal(backup.listeningReviews['2:11'].repeatedOn.length, 2);
  await page.evaluate(() => localStorage.clear());
  await home();
  await openBackup();
  const restore = async payload => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await page.getByText('Прогресс восстановлен.', { exact: true }).waitFor();
  };
  await restore(backup);
  assert.deepEqual(await times(), backup.listeningTime);
  assert.deepEqual(await records(), backup.listeningReviews);
  for (const version of [1, 2, 3]) {
    const old = { ...backup, version };
    delete old.listeningReviews;
    delete old.listeningTime;
    await restore(old);
    assert.deepEqual(await records(), backup.listeningReviews, `Version ${version} must preserve newer review history`);
    assert.deepEqual(await times(), backup.listeningTime, `Version ${version} must preserve listening time`);
  }
  const version4 = { ...backup, version: 4 };
  delete version4.listeningTime;
  await restore(version4);
  assert.deepEqual(await times(), backup.listeningTime);
  console.log('Version 5 round trip and legacy versions 1–3 preserve the review history');

  await setDay('2026-10-29');
  await openPlayer();
  await page.evaluate(key => {
    window.originalReviewSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return window.originalReviewSetItem.call(this, name, value);
    };
  }, key);
  await repeat.click();
  assert.match(await page.locator('#review-status').innerText(), /Не удалось сохранить/);
  assert.equal((await record()).repeatedOn.length, 2);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalReviewSetItem; });
  await home();
  await audioCard.getByRole('link', { name: 'Повторить аудио' }).waitFor();
  const other = await context.newPage();
  other.on('pageerror', error => errors.push(error.message));
  await other.clock.install({ time: at('2026-10-29') });
  await other.goto(`${site}text-and-audio.html?course=2&lesson=11&review=1`);
  await other.locator('#review-complete:not([disabled])').waitFor();
  await other.locator('#review-complete').click();
  await playBriefly(other);
  await page.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key) || '{}')).length >= 2, timeKey);
  await openBackup();
  const crossTabBackupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить копию', exact: true }).click();
  const crossTabBackup = JSON.parse(await readFile(await (await crossTabBackupDownload).path(), 'utf8'));
  assert.deepEqual(crossTabBackup.listeningTime, await times(), 'The homepage snapshot must include playback from another tab');
  await page.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.listening-review-action'));
  assert.equal((await record()).repeatedOn.length, 3);
  assert(await audioCard.getByRole('button', { name: 'Повторить аудио', exact: true }).isDisabled());
  await other.close();
  await openPlayer();
  for (const date of ['2026-11-12', '2026-12-21', '2027-04-20', '2027-10-22']) {
    await setDay(date);
    await repeat.click();
  }
  assert.equal((await record()).repeatedOn.length, 7);
  assert(await repeat.isDisabled());
  assert.match(await page.locator('#review-status').innerText(), /Все семь/);
  await setDay('2028-01-02');
  await home();
  assert(await audioCard.getByRole('button', { name: 'Повторить аудио', exact: true }).isDisabled());
  assert.match(await audioCard.innerText(), /Все семь/);
  console.log('Storage errors do not advance progress; cross-tab updates and the seven-review limit passed');

  const completed = await records();
  const beforeFirstCourse = await times();
  await openPlayer(1, 87, false);
  await playBriefly(page);
  const afterFirstCourse = await times();
  assert(Object.keys(afterFirstCourse).some(id => id.startsWith('1:')), 'The first course must enter listening time');
  for (const [id, ms] of Object.entries(beforeFirstCourse)) assert.equal(afterFirstCourse[id], ms, 'Earlier listening must be preserved');
  await playBriefly(page);
  assert(Object.entries(await times()).some(([id, ms]) => id.startsWith('1:') && ms > afterFirstCourse[id]), 'Every first-course replay must add listening time');
  assert(await page.locator('#audio-review').isHidden());
  await page.locator('#complete').click();
  assert.deepEqual(await records(), completed, 'The first course must not enter the audio schedule');

  const source = catalog.find(entry => entry.courseId === 2 && entry.lessonId === 11);
  await page.route('**/text-and-audio/catalog.json', route => route.fulfill({ json: [...catalog, { ...source, courseId: 3, courseTitle: 'Третья часть' }] }));
  await openPlayer(3, 11, false);
  await page.locator('#complete').click();
  assert.equal((await records())['3:11'].studiedOn, '2028-01-02');
  assert.equal((await records())['2:11'].repeatedOn.length, 7);
  assert.equal(await page.getByRole('link', { name: '← К курсу', exact: true }).getAttribute('href'), './?course=3');
  await setDay('2028-01-03');
  await repeat.click();
  assert.equal((await records())['3:11'].repeatedOn.length, 1);

  await page.evaluate(legacyKey => {
    const marks = JSON.parse(localStorage.getItem(legacyKey));
    marks[12] = { completed: true, updatedAt: new Date('2028-01-01T07:00:00Z').getTime() };
    localStorage.setItem(legacyKey, JSON.stringify(marks));
  }, legacyKey);
  await openPlayer(2, 12);
  assert.equal(await page.locator('#review-schedule time').first().getAttribute('datetime'), '2028-01-01');
  await repeat.click();
  assert.equal((await records())['2:12'].studiedOn, '2028-01-01');
  assert.deepEqual((await records())['2:12'].repeatedOn, ['2028-01-03']);
  assert.deepEqual(errors, []);
  console.log('First-course listening and repeats, separate review schedule, future courses and legacy completion migration passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
