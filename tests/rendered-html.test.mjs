import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Shifahiya course with lesson thirteen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Аш-Шифахия — арабский шаг за шагом<\/title>/i);
  assert.match(html, /13 из 100 уроков готовы/);
  assert.match(html, /Он терпеливый. Она терпеливая/);
  assert.match(html, /الدَّرْسُ الثَّالِثُ عَشَرَ/);
  assert.match(html, /56 заданий/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps lesson thirteen data and local progress support in the app", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const lessonThirteen: Lesson/);
  assert.match(page, /صَبُورٌ/);
  assert.match(page, /عُجُلٌ/);
  assert.match(page, /أَكْثَرُ الرِّجَالِ/);
  assert.match(page, /shifahiya-active-session/);
  assert.match(page, /shifahiya-lesson-\$\{item\.id\}/);
  assert.match(page, /shuffle\(currentQuestion\?\.options/);
  assert.match(page, /const targetCount = words\.length \* 2/);
  assert.match(page, /\.map\(expandLessonQuestions\)/);
});
