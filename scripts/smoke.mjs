// Drives the built app in a real browser and walks one lesson of the third
// course from its first card to its stored result.
//
//   npm run smoke
//
// The suite in tests/ checks the data and the modules around it; it cannot
// tell whether the page comes alive. Twice already that was the difference
// that mattered: a static build rendered while React never hydrated, and a
// lesson's Arabic showed Qur'anic verses as unreadable font glyphs. Both are
// invisible to a green `npm test` and obvious on screen.
//
// The third course is walked because it is the newest and the only one gated
// behind another course; storage is seeded so the gate opens.
//
// A machine with no Chromium skips instead of failing: this check is not part
// of `npm test`, and a missing browser is not a broken change.
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

/**
 * A port the machine hands out, not one this script picked. A fixed port is
 * how the first version of this check went wrong: a server left over from an
 * earlier run held it, the new one could not bind, and the browser walked
 * happily through the previous build.
 */
async function freePort() {
  const fixed = Number(process.env.SMOKE_PORT ?? 0);
  if (fixed) return fixed;
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Chromium as this machine happens to hold it, or null when it holds none. */
async function findChromium() {
  // A path given by hand is a claim about this machine: if it is wrong, say so
  // rather than quietly falling through to some other browser.
  const named = process.env.SMOKE_CHROMIUM ?? process.env.CHROME_PATH;
  if (named) {
    if (await exists(named)) return named;
    console.error(`Указанный браузер не найден: ${named}`);
    process.exit(1);
  }

  // Playwright's own store, wherever the image put it.
  const store = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (store) {
    const direct = join(store, "chromium");
    if (await exists(direct)) return direct;
    for (const entry of await readdir(store).catch(() => [])) {
      if (!entry.startsWith("chromium-")) continue;
      const path = join(store, entry, "chrome-linux", "chrome");
      if (await exists(path)) return path;
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

const exists = (path) => access(path).then(() => true, () => false);

function skip(reason) {
  console.log(`ПРОПУЩЕНО: ${reason}`);
  console.log("Задайте SMOKE_CHROMIUM=/путь/к/chrome, если браузер лежит не там.");
  process.exit(0);
}

/** Waits for the server to answer, rather than sleeping and hoping. */
async function waitForServer(timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`сервер не поднялся за ${timeoutMs / 1000} с`);
}

const chromium = await findChromium();
if (!chromium) skip("Chromium не найден");

let playwright;
try {
  playwright = await import("playwright-core");
} catch {
  skip("playwright-core не установлен (npm ci)");
}

if (!(await exists("dist/server/index.js"))) {
  console.error("Нет сборки: сначала `npm run build`.");
  process.exit(1);
}

const PORT = await freePort();
const ORIGIN = `http://127.0.0.1:${PORT}`;

// The binary is started directly rather than through npx: killing npx leaves
// the server it spawned behind, and a stray server is what poisons the next run.
const server = spawn("node_modules/.bin/vinext", ["start", "--port", String(PORT)], {
  stdio: "ignore",
  detached: true,
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
});
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  // Its own process group, so nothing it started outlives it either.
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", stop);

let browser;
try {
  await waitForServer();

  browser = await playwright.chromium.launch({ executablePath: chromium });
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });

  const failures = [];
  page.on("pageerror", (error) => failures.push(`ошибка страницы: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`консоль: ${message.text()}`);
  });

  await page.goto(ORIGIN, { waitUntil: "networkidle" });

  // The third course opens once the second is finished, so the second course's
  // results are seeded rather than played through.
  await page.evaluate(() => {
    localStorage.clear();
    for (let id = 1; id <= 105; id += 1) localStorage.setItem(`shifahiya-p2-lesson-${id}`, "10");
  });
  await page.reload({ waitUntil: "networkidle" });

  await page.getByRole("tab", { name: /Часть 3/ }).click();
  const list = page.locator(".lesson-list");
  await list.getByRole("button", { name: /Начать урок/ }).first().click();
  await page.waitForSelector(".study-view", { timeout: 15_000 });

  // Words, then one question on each, then the text.
  const cards = await page.locator(".repeat-badge").innerText();
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
    score: localStorage.getItem("shifahiya-p3-lesson-1"),
    cards: Object.keys(JSON.parse(localStorage.getItem("shifahiya-card-progress-v1") ?? "{}"))
      .filter((key) => key.startsWith("p3-")).length,
  }));
  if (stored.score === null) failures.push("результат урока не сохранился");
  if (!stored.cards) failures.push("карточки третьей части не попали в коробку повторения");

  if (failures.length) {
    console.error("Прогон не прошёл:");
    for (const failure of failures) console.error(`  · ${failure}`);
    process.exit(1);
  }

  console.log(
    `Урок третьей части пройден целиком: ${cards}, ` +
      `фрагментов ${fragments}, счёт ${stored.score}, карточек ${stored.cards}. Ошибок нет.`,
  );
} catch (error) {
  console.error(`Прогон оборвался: ${String(error.message).split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stop();
}
