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

const root = resolve(".static-site");
const base = "/ash-shifahiya-app/";
const exists = (path) => access(path).then(() => true, () => false);
assert(await exists(resolve(root, "index.html")), "Run npm run build:static first");

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
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    assert(pathname.startsWith(base), "Outside the Pages subdirectory");
    const relative = pathname.slice(base.length);
    const file = resolve(root, relative || "index.html");
    assert(file.startsWith(root + sep), "Outside the static directory");
    const body = await readFile(file);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(body);
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
  assert.equal(await earlierAudio.getAttribute("href"), "./text-and-audio-87-88.html?lesson=87");
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
    ["shifahiya-session-91", firstSession(91, 1000)],
  ]);
  await assertCompact(91, lessonSummaries.length - 89);
  assert(await card(80).isVisible(), "An earlier unfinished lesson must remain reachable");

  // The two original embedded recordings are also discoverable at the next step.
  for (const id of [87, 88]) {
    await seed(scoreEntries(lessonSummaries, "shifahiya-lesson-", id - 1));
    await assertCompact(id, lessonSummaries.length - id + 1);
    assert.equal(await heroAudio.getAttribute("href"), `./text-and-audio-87-88.html?lesson=${id}`);
  }

  // The final lesson being complete should leave a short, recoverable empty list.
  await seed(scoreEntries(lessonSummaries, "shifahiya-lesson-"));
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
  console.log("Compact homepage passed: continuation, audio access, completed lessons, achievements, all-completed state, reading courses and mobile layout");
} catch (error) {
  for (const message of errors) console.error(message);
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
