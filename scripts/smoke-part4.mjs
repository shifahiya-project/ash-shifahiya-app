// Exercises the complete fiqh edition against the same static files Pages publishes.
// Run after build:static with Node's --experimental-strip-types flag.
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { PART4_REVISION } from "../content/part4/revision.ts";

const SITE = ".static-site";
const BASE = "/ash-shifahiya-app";
const REVISION_KEY = "shifahiya-p4-revisions-v1";
const CARDS_KEY = "shifahiya-card-progress-v1";
const files = (await readdir("content/part4")).filter((file) => /^lesson-\d+\.ts$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const lessons = await Promise.all(files.map(async (file) => Object.values(await import(`../content/part4/${file}`))[0]));
assert.equal(lessons.length, 159);
assert.equal(lessons.flatMap((lesson) => lesson.words).length, 907);
assert.equal(lessons.flatMap((lesson) => lesson.fragments).length, 4668);
await access(`${SITE}/index.html`);
const executablePath = process.env.SMOKE_CHROMIUM ?? "/usr/bin/chromium";
await access(executablePath);

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (requested !== BASE && !requested.startsWith(`${BASE}/`)) {
    response.writeHead(404).end();
    return;
  }
  const path = requested.slice(BASE.length) || "/";
  let file = join(SITE, normalize(path));
  if (!file.startsWith(`${SITE}/`)) { response.writeHead(403).end(); return; }
  if (!/\.[a-z0-9]+$/i.test(path)) file = join(file, "index.html");
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}${BASE}/`;
const browser = await chromium.launch({ executablePath });
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 950 }, acceptDownloads: true });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()}: ${response.url()}`); });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "media" && request.failure()?.errorText === "net::ERR_ABORTED") return;
    failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`);
  });
  const openMenu = async () => {
    if (!(await page.locator("#main-menu").evaluate((element) => element.matches(":popover-open")))) {
      await page.getByRole("button", { name: "Меню", exact: true }).click();
    }
  };
  const openParts = async () => {
    await openMenu();
    const lessonButton = page.getByRole("button", { name: "Показать уроки", exact: true });
    if (await lessonButton.isVisible()) await lessonButton.click();
    const partsButton = page.getByRole("button", { name: "Показать части курса", exact: true });
    if (await partsButton.isVisible()) await partsButton.click();
  };
  const openFiqh = async (id) => {
    await openParts();
    await page.getByRole("tab", { name: /4 · Фикх/ }).click();
    const allButton = page.getByRole("button", { name: "Показать все уроки", exact: true });
    if (await allButton.isVisible()) await allButton.click();
    const card = page.locator(".lesson-list .lesson-card").filter({ has: page.locator(".lesson-number", { hasText: new RegExp(`^0*${id}$`) }) });
    await card.getByRole("button", { name: /Начать урок|Продолжить|Повторить/ }).click();
    await page.locator(".study-view, .practice-view").waitFor();
  };
  const personalProgress = async () => {
    await openMenu();
    const button = page.getByRole("button", { name: "Показать личный прогресс", exact: true });
    if (await button.isVisible()) await button.click();
  };
  const storage = async () => page.evaluate(({ revisionKey, cardsKey }) => ({
    revisions: JSON.parse(localStorage.getItem(revisionKey) ?? "{}"),
    cards: JSON.parse(localStorage.getItem(cardsKey) ?? "{}"),
    legacy: Object.fromEntries(Array.from({ length: 145 }, (_, index) => [index + 1, localStorage.getItem(`shifahiya-p4-lesson-${index + 1}`)])),
  }), { revisionKey: REVISION_KEY, cardsKey: CARDS_KEY });

  await page.goto(`${origin}?course=4`, { waitUntil: "networkidle" });
  const first = lessons[0];
  const firstWord = first.words[0];
  const firstAddress = `p4-lesson-${firstWord.reviewLessonId}-word-${firstWord.reviewIndex}-ar-ru`;
  assert.ok(firstWord.reviewLessonId !== first.id || firstWord.reviewIndex !== 0, "first revised card must exercise a moved review address");
  await page.evaluate(({ cardsKey, firstAddress }) => {
    localStorage.clear();
    for (let id = 1; id <= 37; id += 1) localStorage.setItem(`shifahiya-p3-lesson-${id}`, "10");
    for (let id = 1; id <= 145; id += 1) localStorage.setItem(`shifahiya-p4-lesson-${id}`, "10");
    localStorage.setItem("shifahiya-p4-session-1", JSON.stringify({ lessonId: 1, view: "practice", index: 20, score: 3, mistakes: [], updatedAt: 1 }));
    localStorage.setItem(cardsKey, JSON.stringify({ [firstAddress]: { box: 3, correct: 7, wrong: 2, nextReview: "2000-01-01", lastReviewed: "2000-01-01" } }));
  }, { cardsKey: CARDS_KEY, firstAddress });
  await page.reload({ waitUntil: "networkidle" });
  await personalProgress();
  assert.match(await page.locator(".course-progress-list li").filter({ hasText: "Часть 4 ·" }).innerText(), /0 из 159 уроков/);
  await openParts();
  assert.ok(!(await page.getByRole("tab", { name: /5 ·/ }).innerText()).includes("🔒"), "earned fifth-course access must survive the replacement");
  await openFiqh(1);
  assert.equal(await page.locator(".arabic-word").textContent(), firstWord.arabic, "legacy parked question must not resume against revised text");
  await page.getByRole("button", { name: "Показать перевод", exact: true }).click();
  await page.getByRole("button", { name: /Запомнил/ }).click();
  let saved = await storage();
  assert.equal(saved.cards[firstAddress].box, 4);
  assert.equal(saved.cards[firstAddress].correct, 8);
  assert.equal(saved.revisions[PART4_REVISION].sessions[1].index, 1);
  assert.equal(saved.revisions[PART4_REVISION].sessions[1].view, "learn");
  await page.reload({ waitUntil: "networkidle" });
  await openFiqh(1);
  assert.equal(await page.locator(".arabic-word").textContent(), first.words[1].arabic);
  for (const word of first.words.slice(1)) {
    assert.equal(await page.locator(".arabic-word").textContent(), word.arabic);
    await page.getByRole("button", { name: "Показать перевод", exact: true }).click();
    await page.getByRole("button", { name: /Запомнил/ }).click();
  }
  for (const word of first.words) {
    await page.locator(".options").getByRole("button", { name: word.russian, exact: true }).click();
    await page.locator(".feedback button").click();
  }
  await page.locator(".reading-view").waitFor();
  assert.deepEqual(await page.locator(".reading-arabic").allTextContents(), first.fragments.filter((line) => line.arabic).map((line) => line.arabic));
  await page.locator("button.reading-arabic").evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  await page.waitForFunction((count) => document.querySelectorAll(".reading-russian").length === count, first.fragments.filter((line) => line.russian).length);
  assert.deepEqual(await page.locator(".reading-russian").allTextContents(), first.fragments.filter((line) => line.russian).map((line) => line.russian));
  await page.getByRole("button", { name: /Урок пройден/ }).click();
  await page.locator(".result-view").waitFor();
  saved = await storage();
  assert.equal(saved.revisions[PART4_REVISION].scores[1], first.words.length);
  assert.equal(saved.revisions[PART4_REVISION].totals[1], first.words.length);
  assert.equal(saved.revisions[PART4_REVISION].sessions[1], undefined);
  assert.ok(Object.values(saved.legacy).every((score) => score === "10"));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("shifahiya-p4-session-1")).index), 20);
  console.log("Фикх: свежий старт, старые результаты, доступ дальше, адрес карточки, возобновление и полный первый урок проверены.");

  // Every current lesson is explicitly parked on reading, without manufacturing completions.
  await page.evaluate(({ revisionKey, revision, ids }) => {
    const revisions = JSON.parse(localStorage.getItem(revisionKey));
    revisions[revision].sessions = Object.fromEntries(ids.map((id) => [id, { lessonId: id, view: "reading", index: 0, score: 0, mistakes: [], updatedAt: Date.now() }]));
    localStorage.setItem(revisionKey, JSON.stringify(revisions));
  }, { revisionKey: REVISION_KEY, revision: PART4_REVISION, ids: lessons.map((lesson) => lesson.id) });
  await page.reload({ waitUntil: "networkidle" });
  let checked = first.fragments.length;
  for (const lesson of lessons.slice(1)) {
    await openFiqh(lesson.id);
    await page.locator(".reading-view").waitFor();
    assert.deepEqual(await page.locator(".reading-arabic").allTextContents(), lesson.fragments.filter((line) => line.arabic).map((line) => line.arabic), `Arabic lesson ${lesson.id}`);
    assert.equal(await page.locator(".reading-line").count(), lesson.fragments.length, `fragment count lesson ${lesson.id}`);
    assert.equal(await page.locator(".reading-line.is-heading").count(), lesson.fragments.filter((line) => line.heading).length, `headings lesson ${lesson.id}`);
    await page.locator("button.reading-arabic").evaluateAll((buttons) => buttons.forEach((button) => button.click()));
    await page.waitForFunction((count) => document.querySelectorAll(".reading-russian").length === count, lesson.fragments.filter((line) => line.russian).length);
    assert.deepEqual(await page.locator(".reading-russian").allTextContents(), lesson.fragments.filter((line) => line.russian).map((line) => line.russian), `Russian lesson ${lesson.id}`);
    assert.equal(await page.locator(".reading-arabic").filter({ hasText: /^$/ }).count(), 0, `empty Arabic lesson ${lesson.id}`);
    for (const line of lesson.fragments.filter((fragment) => !fragment.arabic)) {
      const row = page.locator(".reading-line").filter({ hasText: line.russian });
      assert.equal(await row.locator("button").count(), 0, `Russian-only heading must have no empty Arabic controls in lesson ${lesson.id}`);
    }
    checked += lesson.fragments.length;
    if (lesson.id % 30 === 0) console.log(`Фикх: проверены тексты уроков 1–${lesson.id}.`);
    await page.getByRole("button", { name: "Вернуться позже", exact: true }).click();
  }
  assert.equal(checked, 4668);
  assert.equal(lessons.filter((lesson) => !lesson.words.length).length, 14);
  console.log("Фикх: все 159 чанков, 4668 фрагментов, переводы, 183 заголовка, 14 уроков без слов и последний урок проверены в браузере.");

  await personalProgress();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить копию", exact: true }).click();
  const backup = JSON.parse(await readFile(await (await downloading).path(), "utf8"));
  assert.equal(backup.version, 7);
  assert.equal(Object.keys(backup.part4Scores).length, 145);
  assert.ok(Object.values(backup.part4Scores).every((score) => score === 10));
  assert.deepEqual(backup.part4Revisions[PART4_REVISION].scores, { 1: first.words.length });
  assert.equal(backup.part4Revisions[PART4_REVISION].sessions[159].view, "reading");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await personalProgress();
  await page.locator('input[type="file"]').setInputFiles({ name: "new-progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByText("Прогресс восстановлен.", { exact: true }).waitFor();
  saved = await storage();
  assert.deepEqual(saved.revisions, backup.part4Revisions);
  assert.ok(Object.values(saved.legacy).every((score) => score === "10"));
  const legacyBackup = { ...backup, version: 6, part4Scores: { ...backup.part4Scores, 145: 9 } };
  delete legacyBackup.part4Revisions;
  await page.locator('input[type="file"]').setInputFiles({ name: "old-progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(legacyBackup)) });
  await page.waitForFunction(() => localStorage.getItem("shifahiya-p4-lesson-145") === "9");
  assert.deepEqual((await storage()).revisions, backup.part4Revisions, "restoring an old backup must preserve current edition");
  await page.reload({ waitUntil: "networkidle" });
  await personalProgress();
  assert.match(await page.locator(".course-progress-list li").filter({ hasText: "Часть 4 ·" }).innerText(), /1 из 159 уроков/);
  // Startup must resolve an old review address to its revised lesson, rather than
  // loading the same numeric lesson from a different edition.
  const movedLesson = lessons.find((lesson) => lesson.words.some((word) => word.reviewLessonId !== lesson.id));
  const movedWord = movedLesson.words.find((word) => word.reviewLessonId !== movedLesson.id);
  await page.evaluate(({ cardsKey, address }) => {
    localStorage.setItem(cardsKey, JSON.stringify({ [address]: { box: 1, correct: 1, wrong: 0, nextReview: "2000-01-01", lastReviewed: "2000-01-01" } }));
  }, { cardsKey: CARDS_KEY, address: `p4-lesson-${movedWord.reviewLessonId}-word-${movedWord.reviewIndex}-ar-ru` });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Повторить сейчас", exact: true }).click();
  await page.locator(".review-russian, .arabic-word").waitFor();
  assert.equal(await page.locator(".arabic-word").textContent(), movedWord.arabic);
  assert.match(await page.locator(".repeat-badge").innerText(), new RegExp(`Урок ${movedLesson.id} ·`));
  assert.deepEqual(failures, []);
  console.log("Фикх: резервная копия v7 и восстановление старой копии без потери новой редакции проверены. Ошибок браузера и загрузки нет.");
} catch (error) {
  console.error(error);
  if (failures.length) console.error(failures.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
