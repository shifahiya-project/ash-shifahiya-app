// Drives the published site in a real browser and walks one lesson of the
// fourth course from its first card to its stored result.
//
//   npm run build:static && npm run smoke
//
// The suite in tests/ checks the data and the modules around it; it cannot
// tell whether the page comes alive. Twice already that was the difference
// that mattered: a static build rendered while React never hydrated, and a
// lesson's Arabic showed Qur'anic verses as unreadable font glyphs. Both are
// invisible to a green `npm test` and obvious on screen.
//
// What is served is `.static-site`, the directory deploy.yml publishes — not
// the Worker build behind `vinext start`. The difference is the whole point of
// build-static.mjs: it rewrites asset addresses in the markup and inside the
// escaped hydration payload, and a miss there leaves a page that renders and
// stays dead. Checking the Worker would step around exactly that.
//
// The fourth course is walked because it is the newest, and because the third
// and fourth share one set of screens — walking the newer one exercises both.
// Storage is seeded so the courses it waits on count as finished.
//
// A machine with no Chromium skips instead of failing: this check is not part
// of `npm test`, and a missing browser is not a broken change.
import { access, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize } from "node:path";

const SITE = ".static-site";

/**
 * Pages serves this project from a subdirectory, not from a domain root, and
 * that is the whole reason build-static.mjs rewrites asset addresses at all.
 * Serving from "/" here would resolve an unrewritten "/assets/…" perfectly
 * well and let exactly the defect this check exists for walk past it.
 */
const BASE = process.env.SMOKE_BASE ?? "/ash-shifahiya-app";

const exists = (path) => access(path).then(() => true, () => false);

function skip(reason) {
  console.log(`ПРОПУЩЕНО: ${reason}`);
  console.log("Задайте SMOKE_CHROMIUM=/путь/к/chrome, если браузер лежит не там.");
  process.exit(0);
}

/**
 * Chromium as this machine happens to hold it. Playwright's own answer comes
 * first — it knows the standard cache (~/.cache/ms-playwright) and honours
 * PLAYWRIGHT_BROWSERS_PATH — but it answers with a path whether or not the
 * browser is actually there, so every candidate is checked before it is used.
 */
async function findChromium(playwright) {
  // A path given by hand is a claim about this machine: if it is wrong, say so
  // rather than quietly falling through to some other browser.
  const named = process.env.SMOKE_CHROMIUM ?? process.env.CHROME_PATH;
  if (named) {
    if (await exists(named)) return named;
    console.error(`Указанный браузер не найден: ${named}`);
    process.exit(1);
  }

  const own = (() => {
    try {
      return playwright.chromium.executablePath();
    } catch {
      return null;
    }
  })();
  if (own && (await exists(own))) return own;

  // Images that unpack the browser themselves do not always follow Playwright's
  // layout, so the store is also read as it lies.
  const store = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (store) {
    const direct = join(store, "chromium");
    if (await exists(direct)) return direct;
    for (const entry of await readdir(store).catch(() => [])) {
      if (!entry.startsWith("chromium")) continue;
      for (const layout of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const path = join(store, entry, layout);
        if (await exists(path)) return path;
      }
    }
  }

  for (const path of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ]) {
    if (await exists(path)) return path;
  }
  return null;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

/**
 * Serves the published directory in this process. GitHub Pages resolves a
 * directory to its index.html; so does this, and nothing else — a request that
 * misses is a 404 here just as it would be there.
 */
function serveSite() {
  const server = createServer(async (request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    // Outside the subdirectory there is nothing, just as on Pages.
    if (!requested.startsWith(`${BASE}/`) && requested !== BASE) {
      response.writeHead(404, { "content-type": TYPES[".html"] }).end("not found");
      return;
    }
    const path = requested.slice(BASE.length) || "/";
    // normalize() first, so "../" cannot walk out of the published directory.
    let file = join(SITE, normalize(path));
    if (!file.startsWith(SITE)) {
      response.writeHead(403).end();
      return;
    }
    if (!/\.[a-z0-9]+$/i.test(path)) file = join(file, "index.html");

    try {
      const body = await readFile(file);
      const extension = file.slice(file.lastIndexOf("."));
      response.writeHead(200, { "content-type": TYPES[extension] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": TYPES[".html"] }).end("not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}${BASE}/` });
    });
  });
}

if (!(await exists(join(SITE, "index.html")))) {
  console.error(`Нет опубликованной сборки в ${SITE}/: сначала \`npm run build:static\`.`);
  process.exit(1);
}

let playwright;
try {
  playwright = await import("playwright-core");
} catch {
  skip("playwright-core не установлен (npm ci)");
}

const chromium = await findChromium(playwright);
if (!chromium) skip("Chromium не найден");

const { server, origin } = await serveSite();
let browser;
let collected = [];
try {
  browser = await playwright.chromium.launch({ executablePath: chromium });
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });

  const failures = [];
  collected = failures;
  page.on("pageerror", (error) => failures.push(`ошибка страницы: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`консоль: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`запрос не выполнен: ${request.url()}`);
  });
  // A 404 is a perfectly successful response, so requestfailed never sees it —
  // and a 404 on the entry chunk is precisely how a page renders and stays
  // dead. Without this the symptom is a timeout with no stated cause.
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`${response.status()} на ${response.url()}`);
    }
  });

  await page.goto(origin, { waitUntil: "networkidle" });

  // Each course here opens on the one before it being finished, so those
  // results are seeded rather than played through.
  await page.evaluate(() => {
    localStorage.clear();
    for (let id = 1; id <= 105; id += 1) localStorage.setItem(`shifahiya-p2-lesson-${id}`, "10");
    for (let id = 1; id <= 37; id += 1) localStorage.setItem(`shifahiya-p3-lesson-${id}`, "10");
  });
  await page.reload({ waitUntil: "networkidle" });

  // Clicking the tab is the first thing that needs React alive: a page that
  // rendered but never hydrated gets no further than this.
  await page.getByRole("tab", { name: /Часть 4/ }).click();
  const list = page.locator(".lesson-list");
  await list.getByRole("button", { name: /Начать урок/ }).first().click();
  await page.waitForSelector(".study-view", { timeout: 15_000 });

  const lesson = await page.locator(".repeat-badge").innerText();
  for (let step = 0; step < 400; step += 1) {
    if (await page.locator(".practice-view").count()) break;
    const reveal = page.getByRole("button", { name: "Показать перевод" });
    if (await reveal.count()) await reveal.click();
    await page.getByRole("button", { name: /Запомнил/ }).click();
  }
  for (let step = 0; step < 400; step += 1) {
    if (await page.locator(".reading-view").count()) break;
    await page.locator(".options button").first().click();
    await page.locator(".feedback button").click();
  }

  const fragments = await page.locator(".reading-line").count();
  if (fragments === 0) failures.push("экран чтения без фрагментов");

  // Every translation opened at once, so the check reads the whole lesson.
  const lines = page.locator(".reading-arabic");
  for (let index = 0; index < fragments; index += 1) await lines.nth(index).click();

  // Presentation-form glyphs are what a broken font leaves behind; the ornate
  // Qur'anic brackets and the ligatures below are the legitimate ones.
  const damaged = await page.evaluate(() => {
    const allowed = new Set([..."﴿﴾ﷺﷻ﷽ﷲ"]);
    let count = 0;
    for (const character of document.body.innerText) {
      const code = character.codePointAt(0);
      const presentation =
        (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff);
      if (presentation && !allowed.has(character)) count += 1;
    }
    return count;
  });
  if (damaged) failures.push(`нечитаемых глифов на экране: ${damaged}`);

  await page.getByRole("button", { name: /Урок пройден/ }).click();
  await page.waitForSelector(".result-view", { timeout: 15_000 });

  const stored = await page.evaluate(() => ({
    score: localStorage.getItem("shifahiya-p4-lesson-1"),
    cards: Object.keys(JSON.parse(localStorage.getItem("shifahiya-card-progress-v1") ?? "{}"))
      .filter((key) => key.startsWith("p4-")).length,
  }));
  if (stored.score === null) failures.push("результат урока не сохранился");
  if (!stored.cards) failures.push("карточки четвёртой части не попали в коробку повторения");

  // A lesson that brings no new words has neither cards nor questions and is
  // its text: it must open on the reading step, not on an empty card screen.
  // Only the browser shows that, so the walk ends on one.
  await page.evaluate(() => {
    for (let id = 1; id <= 28; id += 1) localStorage.setItem(`shifahiya-p4-lesson-${id}`, "5");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Часть 4/ }).click();
  const wordless = page.locator(".lesson-card").filter({ hasText: "только чтение" }).first();
  if (!(await wordless.count())) failures.push("урока без новых слов нет в списке");
  else {
    await wordless.getByRole("button", { name: /Начать урок/ }).click();
    await page.waitForSelector(".study-view", { timeout: 15_000 });
    if (!(await page.locator(".reading-view").count())) {
      failures.push("урок без новых слов открылся не на чтении");
    }
  }

  if (failures.length) {
    console.error("Прогон не прошёл:");
    for (const failure of failures) console.error(`  · ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Опубликованный сайт живой. Урок четвёртой части пройден целиком: ${lesson}, ` +
        `фрагментов ${fragments}, счёт ${stored.score}, карточек ${stored.cards}. ` +
        "Урок без новых слов открывается сразу на чтении.",
    );
  }
} catch (error) {
  console.error(`Прогон оборвался: ${String(error.message).split("\n")[0]}`);
  // Whatever was collected before the break is usually the reason for it.
  for (const failure of collected) console.error(`  · ${failure}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
