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
    const file = resolve(root, !relative || relative.endsWith("/") ? `${relative}index.html` : relative);
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
  const collapseList = () => page.getByRole("button", { name: "Свернуть список", exact: true });
  const parts = page.locator("#course-parts");
  const showParts = () => page.getByRole("button", { name: "Показать части курса", exact: true });
  const hideParts = () => page.getByRole("button", { name: "Скрыть части курса", exact: true });
  const openCourseParts = async () => {
    if (await showParts().isVisible()) await showParts().click();
    await parts.waitFor();
  };
  const choosePart = async (name) => {
    await openCourseParts();
    await page.getByRole("tab", { name }).click();
    assert.equal(await parts.isVisible(), false, "Choosing a course part should close the selector");
    assert.equal(await showParts().getAttribute("aria-expanded"), "false");
  };
  const firstVisible = async () => Number((await cards.first().locator(".lesson-number").innerText()).trim());
  const seed = async (entries) => {
    await page.evaluate((entries) => {
      localStorage.clear();
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, entries);
    await page.reload({ waitUntil: "networkidle" });
  };
  const assertWindow = async (ids) => {
    await page.waitForLoadState("networkidle");
    await card(ids[0]).waitFor();
    assert.deepEqual(await cards.locator(".lesson-number").evaluateAll((nodes) => nodes.map((node) => Number(node.textContent.trim()))), ids, "The lesson window should contain only the previous, current and next lessons in course order");
    assert((await cards.count()) <= 3);
  };
  const assertMobileActions = async (id, screenshotPrefix) => {
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `The homepage should fit a ${width}px viewport`);
      const bounds = await card(id).locator(".lesson-actions > button, .lesson-actions > a").evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right, height: box.height };
      }));
      assert.equal(bounds.length, 2);
      assert(Math.abs(bounds[0].top - bounds[1].top) < 1, `Lesson ${id} actions should share one row at ${width}px`);
      assert(bounds.every((box) => box.left >= 0 && box.right <= width && box.height >= 44));
      const collisions = await cards.evaluateAll((nodes) => nodes.flatMap((node) => {
        const label = node.querySelector(".lesson-window-label");
        if (!label) return [];
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = [...range.getClientRects()];
        return [...node.querySelectorAll(".card-score, .card-lock")].filter((badge) => {
          const box = badge.getBoundingClientRect();
          return lines.some((line) => line.left < box.right && line.right > box.left && line.top < box.bottom && line.bottom > box.top);
        }).map((badge) => `${label.textContent}: ${badge.textContent.trim()}`);
      }));
      assert.deepEqual(collisions, [], `Badges must not cover lesson role labels at ${width}px`);
      await card(id).screenshot({ path: `/tmp/${screenshotPrefix}-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  };

  // A new learner sees the first two lessons and can open the whole course.
  await assertWindow([1, 2]);
  assert(await showAll().isVisible());
  await showAll().click();
  assert.equal(await cards.count(), lessonSummaries.length);
  await collapseList().click();
  await assertWindow([1, 2]);
  assert(await page.getByRole("button", { name: "Показать достижения", exact: true }).isVisible());
  assert.equal(await page.locator(".achievement-list").isVisible(), false);
  assert.equal(await parts.isVisible(), false, "Course parts should be hidden on arrival");
  assert.equal(await showParts().getAttribute("aria-expanded"), "false");
  assert.equal(await showParts().getAttribute("aria-controls"), "course-parts");
  assert.equal(await page.locator(".selected-course").count(), 1);
  assert.equal(await page.locator(".selected-course").innerText(), "Часть 1 · Шифахия");
  assert.equal(await page.locator(".home-extras .home-disclosure").count(), 5);
  assert.equal(await page.locator(".home-extras .home-disclosure-toggle").count(), 5);
  assert.deepEqual(await page.locator(".home-extras .home-disclosure-toggle strong").allTextContents(), ["Личный прогресс", "Достижения", "Подкаст дня", "Темы наизусть", "Части курса"]);
  assert.equal(await page.locator("#personal-progress").isVisible(), false);
  for (const [name, href] of [[/^Подкаст дня/, "./podcasts/"], [/^Темы наизусть/, "./topics/"]]) {
    assert.equal(await page.locator(".home-extras").getByRole("link", { name }).getAttribute("href"), href);
    assert.equal((await page.request.get(new URL(href, origin).href)).status(), 200, "The shortcut should resolve within the Pages subdirectory");
  }
  assert.doesNotMatch(await page.locator(".home-view").innerText(), /Каждая форма встречается дважды|Второй урок продолжает первый/);
  assert(await page.evaluate(() => {
    const lessons = document.getElementById("course-lessons");
    const principle = document.querySelector(".principle");
    const extras = document.querySelector(".home-extras");
    return Boolean(lessons.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean(principle.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), "All five additional blocks should follow the lesson list");
  const disclosureFormats = await page.locator(".home-disclosure-toggle").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.borderRadius, style.fontSize, style.padding, style.display];
  }));
  for (const format of disclosureFormats) assert.deepEqual(format, disclosureFormats[0], "All five bottom blocks should share the same format");
  const showProgress = () => page.getByRole("button", { name: "Показать личный прогресс", exact: true });
  const hideProgress = () => page.getByRole("button", { name: "Скрыть личный прогресс", exact: true });
  await showProgress().focus();
  await page.keyboard.press("Enter");
  assert(await page.locator("#personal-progress").isVisible());
  assert(await page.getByRole("button", { name: "Сохранить копию", exact: true }).isVisible());
  assert(await page.getByRole("button", { name: "Восстановить", exact: true }).isVisible());
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Expanded personal progress should fit ${width}px`);
  }
  await page.locator(".home-extras").screenshot({ path: "/tmp/unified-home-extras-progress-320.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await hideProgress().click();
  assert.equal(await page.locator("#personal-progress").isVisible(), false);
  await page.locator(".home-extras").screenshot({ path: "/tmp/unified-home-extras-mobile.png" });
  await openCourseParts();
  assert.equal(await page.getByRole("tab").count(), 11);
  assert.equal(await hideParts().getAttribute("aria-expanded"), "true");
  assert(await page.getByRole("tab", { name: /^1 · Шифахия/ }).getAttribute("aria-selected") === "true");
  await hideParts().click();
  assert.equal(await parts.isVisible(), false);

  // The latest saved session can be an abandoned repeat of a completed lesson.
  // It must not take the learner away from the unfinished lesson or its audio.
  const lateEntries = [
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90),
    listeningEntry([87, 88]),
    ["shifahiya-session-91", firstSession(91, 1000)],
    ["shifahiya-session-87", firstSession(87, 2000)],
  ];
  await seed(lateEntries);
  await assertWindow([90, 91, 92]);
  assert.match(await card(90).innerText(), /Последний пройденный/i);
  assert.match(await card(91).innerText(), /Текущий урок/i);
  assert.match(await card(92).innerText(), /Следующий урок/i);
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
  await collapseList().click();
  await assertWindow([90, 91, 92]);
  const unchangedEntries = await page.evaluate((keys) => keys.map((key) => [key, localStorage.getItem(key)]), lateEntries.map(([key]) => key));
  assert.deepEqual(unchangedEntries, progressBeforeToggling, "Hiding and revealing lessons must preserve progress");
  const progressBeforeParts = await page.evaluate(() => Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b)));
  await page.locator(".home-extras").screenshot({ path: "/tmp/home-extras-closed-mobile.png" });
  await openCourseParts();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Expanded course parts should fit the mobile viewport");
  await page.locator(".home-extras").screenshot({ path: "/tmp/home-extras-parts-open-mobile.png" });
  await hideParts().click();
  assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))), progressBeforeParts, "Opening and collapsing course parts must preserve progress");
  await assertWindow([90, 91, 92]);

  const showAchievements = page.getByRole("button", { name: "Показать достижения", exact: true });
  await showAchievements.click();
  await page.locator(".achievement-list").waitFor();
  assert((await page.locator(".achievement").count()) > 0);
  await page.getByRole("button", { name: "Скрыть достижения", exact: true }).click();
  assert.equal(await page.locator(".achievement-list").isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/compact-home-desktop.png", fullPage: true });

  // Older unfinished lessons remain reachable through the full list, while
  // the compact window stays focused on the saved continuation.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90)
      .filter(([key]) => key !== "shifahiya-lesson-80"),
    listeningEntry([87, 88]),
    ["shifahiya-session-91", firstSession(91, 1000)],
  ]);
  await assertWindow([90, 91, 92]);
  assert.equal(await card(80).count(), 0);
  await showAll().click();
  assert(await card(80).isVisible(), "An earlier unfinished lesson must remain reachable in the full list");
  await collapseList().click();
  await assertWindow([90, 91, 92]);

  // Every recording is discoverable through the shared player at the next step.
  for (const id of [87, 88]) {
    await seed([
      ...scoreEntries(lessonSummaries, "shifahiya-lesson-", id - 1),
      listeningEntry(listeningCatalog.filter(({ lessonId }) => lessonId < id).map(({ lessonId }) => lessonId)),
    ]);
    await assertWindow([id - 1, id, id + 1]);
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
  await assertWindow([86, 87, 88]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");

  // Completing words and exercises must not hide unfinished text and audio.
  // This is the learner's reported flow: core 87 done, next core step 88.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 87),
    ["shifahiya-session-88", firstSession(88, 3000)],
  ]);
  await assertWindow([86, 87, 88]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.match(await hero.innerText(), /Урок 87\./);
  assert.match(await hero.innerText(), /Текст и аудио/);
  assert.equal(await page.locator('.stats-grid > div').filter({ has: page.getByText('уроков завершено', { exact: true }) }).locator('strong').innerText(), "86");
  assert.equal(await card(87).getByRole("link", { name: "Текст и аудио", exact: true }).getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.equal(await page.getByRole("button", { name: "Показать все уроки", exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Pending audio should fit the mobile viewport");
  await assertMobileActions(87, "pending-audio-87");
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
  await assertWindow([87, 88, 89]);
  assert.match(await hero.innerText(), /Урок 88\./);
  assert.equal(await hero.getAttribute("href"), null, "Words and exercises remain the primary step until they are completed");
  assert.equal(await heroAudio.getAttribute("href"), "./text-and-audio.html?lesson=88");
  await assertMobileActions(87, "previous-lesson-87");
  await page.screenshot({ path: "/tmp/focused-home-88-mobile.png", fullPage: true });
  await page.locator("#course-lessons").screenshot({ path: "/tmp/focused-lessons-88-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/focused-home-88-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // The explicit mark travels with the normal progress backup. Older copies
  // have no audio field, so restoring them must preserve existing marks.
  await showProgress().click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить копию", exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.format, "shifahiya-progress");
  assert.equal(backup.version, 2);
  assert.equal(backup.listening[87].completed, true);
  await seed([]);
  await showProgress().click();
  await page.locator('input[type="file"]').setInputFiles({ name: "progress-v2.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByText("Прогресс восстановлен.", { exact: true }).waitFor();
  await assertWindow([87, 88, 89]);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[87].completed, listeningKey), true);
  await page.reload({ waitUntil: "networkidle" });
  const oldBackup = { ...backup, version: 1 };
  delete oldBackup.listening;
  await showProgress().click();
  await page.locator('input[type="file"]').setInputFiles({ name: "progress-v1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(oldBackup)) });
  await page.getByText("Прогресс восстановлен.", { exact: true }).waitFor();
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[87].completed, listeningKey), true);
  await assertWindow([87, 88, 89]);

  // A later saved vocabulary session must not outrank an earlier listening stage.
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 90),
    ["shifahiya-session-91", firstSession(91, 5000)],
  ]);
  await assertWindow([86, 87, 88]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert(await card(88).isVisible(), "Other unfinished audio lessons stay in the same course list");
  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-", 88),
    listeningEntry([87]),
  ]);
  await assertWindow([87, 88, 89]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=88");

  // Undoing an audio completion restores its continuation without changing scores.
  await page.goto(`${origin}text-and-audio.html?lesson=87`, { waitUntil: "networkidle" });
  await page.locator('#complete[aria-pressed="true"]').click();
  await page.getByRole("link", { name: "← К курсу", exact: true }).click();
  await assertWindow([86, 87, 88]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  assert.equal(await page.evaluate(() => localStorage.getItem("shifahiya-lesson-87")), "10");

  // Existing learners keep pending audio in their focused window and can open
  // every recording in the full list. Exam gates remain based on core work.
  await seed(scoreEntries(lessonSummaries, "shifahiya-lesson-"));
  await assertWindow([86, 87, 88]);
  assert.equal(await hero.getAttribute("href"), "./text-and-audio.html?lesson=87");
  for (const title of ["Промежуточный экзамен", "Итоговый экзамен"]) {
    const exam = page.locator(".exam-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert(await exam.getByRole("button", { name: /^Начать/ }).isEnabled(), "Pending audio should not close an existing exam");
  }
  await showAll().click();
  assert.equal(await cards.count(), lessonSummaries.length);
  assert.equal(await page.locator(".lesson-list").getByRole("link", { name: "Текст и аудио", exact: true }).count(), listeningCatalog.length);
  await collapseList().click();
  await assertWindow([86, 87, 88]);

  // A completed course keeps the final lesson as a route back into the course.
  await seed([...scoreEntries(lessonSummaries, "shifahiya-lesson-"), listeningEntry()]);
  await assertWindow([100]);
  assert.equal(await hero.count(), 0, "A completed course should not offer a completed lesson as the next step");
  for (const title of ["Промежуточный экзамен", "Итоговый экзамен"]) {
    const exam = page.locator(".exam-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert(await exam.isVisible(), "An unfinished exam must remain accessible alongside the focused lesson list");
    assert(await exam.getByRole("button", { name: /^Начать/ }).isEnabled());
  }
  assert(await showAll().isVisible());
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), lessonSummaries.length);
  await collapseList().click();
  await assertWindow([100]);

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
  await openCourseParts();
  await page.getByRole("tab", { name: /^2 · Чтение/ }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await parts.isVisible(), false, "Choosing a course part with the keyboard should close the selector");
  assert.equal(await showParts().getAttribute("aria-expanded"), "false");
  await page.waitForFunction(() => document.activeElement?.classList.contains("selected-course"));
  assert(await page.locator(".selected-course").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= -1 && bounds.bottom <= innerHeight;
  }), "Selecting a course from the bottom should bring its heading into view and focus it");
  assert.equal(await page.locator(".selected-course").innerText(), "Часть 2 · Чтение");
  const readingProgressBeforeParts = await page.evaluate(() => Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b)));
  await openCourseParts();
  assert.equal(await page.getByRole("tab", { name: /^2 · Чтение/ }).getAttribute("aria-selected"), "true");
  await hideParts().click();
  assert.equal(await page.locator(".selected-course").innerText(), "Часть 2 · Чтение");
  assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))), readingProgressBeforeParts);
  await assertWindow([20, 21, 22]);
  assert((await page.locator(".lesson-list .book-divider").allTextContents()).some((text) => text.includes(part2Summaries[20].book)));
  assert.match(await card(21).innerText(), /Продолжить/);
  assert.match(await hero.innerText(), /[Уу]рок 21\./);
  assert.equal(await page.locator(".continue-learning-group").getByRole("link", { name: "Текст и аудио", exact: true }).count(), 0);
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), part2Summaries.length);
  await choosePart(/^1 · Шифахия/);
  await choosePart(/^2 · Чтение/);
  await assertWindow([20, 21, 22]);

  await seed([
    ...scoreEntries(lessonSummaries, "shifahiya-lesson-"),
    listeningEntry(),
    finalPassed,
    ...scoreEntries(part2Summaries, "shifahiya-p2-lesson-"),
    ...scoreEntries(part3Summaries, "shifahiya-p3-lesson-", 10),
    ["shifahiya-p3-session-11", readingSession(11, 1000)],
  ]);
  await choosePart(/^3 · Акыда/);
  await assertWindow([10, 11, 12]);
  assert((await page.locator(".lesson-list .book-divider").allTextContents()).some((text) => text.includes(part3Summaries[10].book)));
  assert((await page.locator(".lesson-list .book-divider.is-section").allTextContents()).some((text) => text.includes(part3Summaries[10].section)));
  assert.match(await card(11).innerText(), /Продолжить/);
  assert.match(await hero.innerText(), /[Уу]рок 11\./);
  await showAll().click();
  await card(1).waitFor();
  assert.equal(await cards.count(), part3Summaries.length);
  await collapseList().click();
  await assertWindow([10, 11, 12]);

  assert.deepEqual(errors, [], "The static homepage should hydrate without browser or asset errors");
  console.log("Focused homepage passed: three-lesson window, full list, matching bottom disclosures, keyboard selection, 87-to-88 audio continuation, reading courses and mobile layout");
} catch (error) {
  for (const message of errors) console.error(message);
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
