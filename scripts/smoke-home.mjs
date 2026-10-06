// Exercise the compact course homepage through the static Pages deployment.
// Run after build:static with Node's --experimental-strip-types flag.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import { lessonSummaries } from "../content/manifest.ts";
import { part2Summaries } from "../content/part2/manifest.ts";
import { part3Summaries } from "../content/part3/manifest.ts";
import { lessonNinetyOne } from "../content/lesson-91.ts";
import { lessonEightySeven } from "../content/lesson-87.ts";
import { expandLessonQuestions } from "../content/questions.ts";

const root = resolve(".static-site");
const base = "/ash-shifahiya-app/";
const exists = (path) => access(path).then(() => true, () => false);
assert(await exists(resolve(root, "index.html")), "Run npm run build:static first");
const listeningCatalog = JSON.parse(await readFile(resolve(root, "text-and-audio/catalog.json"), "utf8"));
assert.deepEqual(listeningCatalog.map(({ lessonId }) => lessonId), [87, 88, 91, 92, 95, 96, 97, 98, 99, 100]);

const specifiedBrowser = process.env.SMOKE_CHROMIUM ?? process.env.CHROME_PATH;
const candidates = specifiedBrowser ? [specifiedBrowser] : [
  chromium.executablePath(),
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];
let executablePath;
for (const candidate of candidates) {
  if (await exists(candidate)) {
    executablePath = candidate;
    break;
  }
}
if (!executablePath) {
  if (specifiedBrowser) throw new Error(`Chromium not found: ${specifiedBrowser}`);
  console.log("SKIPPED: Chromium not found; set SMOKE_CHROMIUM to its path");
  process.exit(0);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    assert(pathname.startsWith(base), "Outside the Pages subdirectory");
    const relative = pathname.slice(base.length);
    const file = resolve(root, relative || "index.html");
    assert(file.startsWith(root + sep), "Outside the static directory");
    const body = await readFile(file);
    response.setHeader("content-type", mime[extname(file)] ?? "application/octet-stream");
    response.setHeader("accept-ranges", "bytes");
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      assert(start <= end);
      response.writeHead(206, { "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": end - start + 1 });
      response.end(body.subarray(start, end + 1));
    } else {
      response.setHeader("content-length", body.length);
      response.end(body);
    }
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}${base}`;
const scoreEntries = (summaries, prefix, count = summaries.length) => summaries
  .slice(0, count)
  .map(({ id }) => [`${prefix}${id}`, "10"]);
const firstSession = (lessonId, updatedAt, cardIndex = 2) => JSON.stringify({
  view: "learn", lessonId, partIndex: 0, deckIndex: 0,
  round: 1, cardIndex, questionIndex: 0, score: 0, mistakes: [], updatedAt,
});
const readingSession = (lessonId, updatedAt) => JSON.stringify({
  lessonId, view: "learn", index: 2, score: 0, mistakes: [], updatedAt,
});
const listeningKey = "shifahiya-listening-progress-v1";
const listeningEntry = (ids = listeningCatalog.map(({ lessonId }) => lessonId)) => [
  listeningKey,
  JSON.stringify(Object.fromEntries(ids.map((id) => [id, { completed: true, updatedAt: 1000 }]))),
];

let browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.goto(origin, { waitUntil: "networkidle" });

  const cards = page.locator(".lesson-list .lesson-card:not(.exam-card)");
  const card = (id) => cards.filter({ has: page.locator(".lesson-number", { hasText: new RegExp(`^${String(id).padStart(2, "0")}$`) }) });
  const hero = page.locator(".continue-learning");
  const showAll = () => page.getByRole("button", { name: "Показать все уроки", exact: true });
  const hideCompleted = () => page.getByRole("button", { name: "Скрыть пройденные", exact: true });
  const firstVisible = async () => Number((await cards.first().locator(".lesson-number").innerText()).trim());
  const seed = async (entries) => {
    await page.evaluate((entries) => {
      localStorage.clear();
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, entries);
    await page.reload({ waitUntil: "networkidle" });
  };
  const assertCompact = async (first, total) => {
    await page.waitForLoadState("networkidle");
    await card(first).waitFor();
    assert.equal(await firstVisible(), first, "List should start at the unfinished lesson");
    assert.equal(await cards.count(), total);
    assert.equal(await cards.filter({ has: page.locator("button.done") }).count(), 0, "Completed lessons should be hidden");
  };

  // A new learner still sees the whole course and a usable first step.
  assert.equal(await firstVisible(), lessonSummaries[0].id);
  assert.equal(await cards.count(), lessonSummaries.length);
  assert(await page.getByRole("button", { name: "Показать достижения", exact: true }).isVisible());
  assert.equal(await page.locator(".achievement-list").isVisible(), false);

  // The latest saved session can be an abandoned repeat of a completed lesson.
  // It must not take the learner away from the unfinished lesson or its audio.
  const lateEntries = [
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90),
    listeningEntry([87, 88]),
    ["shifahiya-session-91", firstSession(91, 1000)],
    ["shifahiya-session-87", firstSession(87, 2000)],
  ];
  await seed(lateEntries);
  await assertCompact(91, lessonSummaries.length - 90);
  assert.match(await hero.innerText(), /Урок 91\./);
  assert.match(await hero.innerText(), /Продолжить/);
  const heroAudio = page.locator(".continue-learning-group").getByRole("link", { name: "Текст и аудио", exact: true });
  await heroAudio.waitFor();
  assert.equal(await heroAudio.getAttribute("href"), "./text-and-audio.html?lesson=91");
  assert.equal(await hero.locator("a").count(), 0, "The audio action must be separate from the continue button");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile homepage should fit the viewport");
  await page.screenshot({ path: "/tmp/compact-home-mobile.png", fullPage: true });

  // Continue really resumes the unfinished session, rather than merely naming it.
  await hero.click();
  await page.locator(".word-card .arabic-word").waitFor();
  assert.equal(await page.locator(".word-card .arabic-word").innerText(), lessonNinetyOne.decks[0].words[2].arabic);
  assert.match(await page.locator(".lesson-progress .counter").innerText(), /^3\//);
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await card(91).waitFor();
  const progressBeforeToggling = await page.evaluate((keys) => keys.map((key) => [key, localStorage.getItem(key)]), lateEntries.map(([key]) => key));
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), lessonSummaries.length);
  assert.equal(await firstVisible(), 1);
  const earlierAudio = card(87).getByRole("link", { name: "Текст и аудио", exact: true });
  assert.equal(await earlierAudio.getAttribute("href"), "./text-and-audio.html?lesson=87");
  await hideCompleted().click();
  await assertCompact(91, lessonSummaries.length - 90);
  const unchangedEntries = await page.evaluate((keys) => keys.map((key) => [key, localStorage.getItem(key)]), lateEntries.map(([key]) => key));
  assert.deepEqual(unchangedEntries, progressBeforeToggling, "Hiding and revealing lessons must preserve progress");

  const showAchievements = page.getByRole("button", { name: "Показать достижения", exact: true });
  await showAchievements.click();
  await page.locator(".achievement-list").waitFor();
  assert((await page.locator(".achievement").count()) > 0);
  await page.getByRole("button", { name: "Скрыть достижения", exact: true }).click();
  assert.equal(await page.locator(".achievement-list").isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/compact-home-desktop.png", fullPage: true });

  // Older imported progress can contain an unfinished earlier lesson. Keep it
  // reachable while placing the learner's actual continuation first.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90)
      .filter(([key]) => key !== "shifahiya-lesson-80"),
    listeningEntry([87, 88]),
    ["shifahiya-session-91", firstSession(91, 1000)],
  ]);
  await assertCompact(91, lessonSummaries.length - 89);
  assert(await card(80).isVisible(), "An earlier unfinished lesson must remain reachable");

  // Every recording is discoverable through the shared player at the next step.
  for (const id of [87, 88]) {
    await seed([
      ...scoreEntries(lessonSummaries, "shifahiya-lesson-", id - 1),
      listeningEntry(listeningCatalog.filter(({ lessonId }) => lessonId < id).map(({ lessonId }) => lessonId)),
    ]);
    await assertCompact(id, lessonSummaries.length - id + 1);
    assert.equal(await heroAudio.getAttribute("href"), `./text-and-audio.html?lesson=${id}`);
  }

  // Finishing the last exercise should lead straight to this lesson's audio,
  // before presenting a completed lesson or the next lesson's words.
  const expanded87 = expandLessonQuestions(lessonEightySeven);
  const closing87 = expanded87.questions.at(-1);
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 86),
    ["shifahiya-session-87", JSON.stringify({
      ...JSON.parse(firstSession(87, 1000)), view: "practice",
      questionIndex: expanded87.questions.length - 1,
      score: expanded87.questions.length - 1,
    })],
  ]);
  await hero.click();
  await page.locator(".practice-view .prompt-card").waitFor();
  await page.locator(".practice-view .options").getByRole("button", { name: closing87.answer, exact: true }).click();
  await page.getByRole("button", { name: /^Результат/ }).click();
  await page.locator(".result-view").waitFor();
  assert.match(await page.locator(".result-view .eyebrow").innerText(), /Урок 87 · слова и задания пройдены/i);
  assert.equal(await page.locator(".result-view a.primary").getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.equal(await page.getByRole("button", { name: /^Перейти к уроку 88/ }).count(), 0);
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await assertCompact(87, lessonSummaries.length - 86);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");

  // Completing words and exercises must not hide unfinished text and audio.
  // This is the learner's reported flow: core 87 done, next core step 88.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 87),
    ["shifahiya-session-88", firstSession(88, 3000)],
  ]);
  await assertCompact(87, lessonSummaries.length - 86);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.match(await hero.innerText(), /Урок 87\./);
  assert.match(await hero.innerText(), /Текст и аудио/);
  assert.equal(await page.locator('.stats-grid > div').filter({ has: page.getByText('уроков завершено', { exact: true }) }).locator('strong').innerText(), "86");
  assert.equal(await card(87).getByRole("link", { name: "Текст и аудио", exact: true }).getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.equal(await page.getByRole("button", { name: "Показать все уроки", exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Pending audio should fit the mobile viewport");
  await page.screenshot({ path: "/tmp/pending-audio-87-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/pending-audio-87-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await hero.click();
  await page.waitForFunction(() => document.querySelector("audio")?.readyState > 0);
  assert.equal(await page.getByLabel("Выбрать урок").locator("option").count(), listeningCatalog.length);
  await page.getByRole("button", { name: "Текст и аудио пройдены", exact: true }).click();
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[87].completed, listeningKey), true);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('#complete[aria-pressed="true"]').waitFor();
  await page.goBack({ waitUntil: "networkidle" });
  await assertCompact(88, lessonSummaries.length - 87);
  assert.match(await hero.innerText(), /Урок 88\./);
  assert.equal(await hero.getAttribute("href"), null, "Words and exercises remain the primary step until they are completed");
  assert.equal(await heroAudio.getAttribute("href"), "./text-and-audio.html?lesson=88");

  // The explicit mark travels with the normal progress backup. Older copies
  // have no audio field, so restoring them must preserve existing marks.
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить копию", exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.format, "shifahiya-progress");
  assert.equal(backup.version, 2);
  assert.equal(backup.listening[87].completed, true);
  await seed([]);
  await page.locator('input[type="file"]').setInputFiles({ name: "progress-v2.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByText("Прогресс восстановлен.", { exact: true }).waitFor();
  await assertCompact(88, lessonSummaries.length - 87);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[87].completed, listeningKey), true);
  await page.reload({ waitUntil: "networkidle" });
  const oldBackup = { ...backup, version: 1 };
  delete oldBackup.listening;
  await page.locator('input[type="file"]').setInputFiles({ name: "progress-v1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(oldBackup)) });
  await page.getByText("Прогресс восстановлен.", { exact: true }).waitFor();
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[87].completed, listeningKey), true);
  await assertCompact(88, lessonSummaries.length - 87);

  // A later saved vocabulary session must not outrank an earlier listening stage.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90),
    ["shifahiya-session-91", firstSession(91, 5000)],
  ]);
  await assertCompact(87, lessonSummaries.length - 88);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert(await card(88).isVisible(), "Other unfinished audio lessons stay in the same course list");
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 88),
    listeningEntry([87]),
  ]);
  await assertCompact(88, lessonSummaries.length - 87);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=88");

  // Undoing an audio completion restores its continuation without changing scores.
  await page.goto(`${origin}text-and-audio.html?lesson=87`, { waitUntil: "networkidle" });
  await page.locator('#complete[aria-pressed="true"]').click();
  await page.getByRole("link", { name: "← К курсу", exact: true }).click();
  await assertCompact(87, lessonSummaries.length - 86);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.equal(await page.evaluate(() => localStorage.getItem("shifahiya-lesson-87")), "10");

  // Existing learners who completed all vocabulary retain every pending audio
  // lesson together, while the original exam gates remain based on core work.
  await seed(scoreEntries(lessonSummaries, "shifahiya-lesson-"));
  await assertCompact(87, listeningCatalog.length);
  assert.deepEqual(await cards.locator(".lesson-number").allTextContents(), listeningCatalog.map(({ lessonId }) => String(lessonId).padStart(2, "0")));
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  for (const title of ["Промежуточный экзамен", "Итоговый экзамен"]) {
    const exam = page.locator(".exam-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert(await exam.getByRole("button", { name: /^Начать/ }).isEnabled(), "Pending audio should not close an existing exam");
  }

  // The final lesson being complete should leave a short, recoverable empty list.
  await seed([...scoreEntries(lessonSummaries, "shifahiya-lesson-"), listeningEntry()]);
  assert.equal(await cards.count(), 0);
  assert.equal(await hero.count(), 0, "A completed course should not offer a completed lesson as the next step");
  for (const title of ["Промежуточный экзамен", "Итоговый экзамен"]) {
    const exam = page.locator(".exam-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert(await exam.isVisible(), "An unfinished exam must remain accessible when its parent lesson is hidden");
    assert(await exam.getByRole("button", { name: /^Начать/ }).isEnabled());
  }
  assert(await showAll().isVisible());
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), lessonSummaries.length);
  await hideCompleted().click();
  assert.equal(await cards.count(), 0);

  // Reading-course cards share the compact behavior, and retain their book
  // and section headings when the first visible lesson falls inside a book.
  const finalPassed = ["shifahiya-exams-v1", JSON.stringify({ final: { best: 150, attempts: 1 } })];
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-"),
    listeningEntry(),
    finalPassed,
    ...scoreEntries(part2Summaries, "shifahiya-p2-lesson-", 20),
    ["shifahiya-p2-session-21", readingSession(21, 1000)],
  ]);
  await page.getByRole("tab", { name: /^2 · Чтение/ }).click();
  await assertCompact(21, part2Summaries.length - 20);
  assert((await page.locator(".lesson-list .book-divider").first().innerText()).includes(part2Summaries[20].book));
  assert.match(await card(21).innerText(), /Продолжить/);
  assert.match(await hero.innerText(), /[Уу]рок 21\./);
  assert.equal(await page.locator(".continue-learning-group").getByRole("link", { name: "Текст и аудио", exact: true }).count(), 0);
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), part2Summaries.length);
  await page.getByRole("tab", { name: /^1 · Шифахия/ }).click();
  await page.getByRole("tab", { name: /^2 · Чтение/ }).click();
  await assertCompact(21, part2Summaries.length - 20);

  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-"),
    listeningEntry(),
    finalPassed,
    ...scoreEntries(part2Summaries, "shifahiya-p2-lesson-"),
    ...scoreEntries(part3Summaries, "shifahiya-p3-lesson-", 10),
    ["shifahiya-p3-session-11", readingSession(11, 1000)],
  ]);
  await page.getByRole("tab", { name: /^3 · Акыда/ }).click();
  await assertCompact(11, part3Summaries.length - 10);
  assert((await page.locator(".lesson-list .book-divider").first().innerText()).includes(part3Summaries[10].book));
  assert((await page.locator(".lesson-list .book-divider.is-section").first().innerText()).includes(part3Summaries[10].section));
  assert.match(await card(11).innerText(), /Продолжить/);
  assert.match(await hero.innerText(), /[Уу]рок 11\./);
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), part3Summaries.length);
  await hideCompleted().click();
  await assertCompact(11, part3Summaries.length - 10);

  assert.deepEqual(errors, [], "The static homepage should hydrate without browser or asset errors");
  console.log("Compact homepage passed: separate audio completion, 87-to-88 continuation, unified recordings, completed lessons, achievements, reading courses and mobile layout");
} catch (error) {
  for (const message of errors) console.error(message);
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
