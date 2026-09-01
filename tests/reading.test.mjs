import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { lessonSummaries } from "../content/manifest.ts";
import { READING_SOURCE, readingByLesson, readingSummaries } from "../content/reading-manifest.ts";
import { READING_INTERVALS, dueReadingIds, nextReadingProgress, readingDate } from "../app/reading-review.ts";

const readingDirectory = new URL("../content/reading/", import.meta.url);

async function loadSections() {
  const files = (await readdir(readingDirectory))
    .filter((file) => /^section-\d+\.ts$/.test(file))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  return Promise.all(
    files.map(async (file) => {
      const loaded = await import(new URL(file, readingDirectory).href);
      return Object.values(loaded)[0];
    }),
  );
}

const sections = await loadSections();
const summaryById = new Map(lessonSummaries.map((item) => [item.id, item]));

test("every text is offered from a lesson that has room for it", () => {
  assert.equal(sections.length, readingSummaries.length);
  for (const section of sections) {
    const host = summaryById.get(section.lessonId);
    assert.ok(host, `section ${section.id} points at lesson ${section.lessonId}, which does not exist`);
    // The learner meets the texts once the course is under way, and only in a
    // lesson that is not carrying a grammar block. A split lesson is fine:
    // reading is a screen beside the lesson, not a part of it.
    assert.ok(host.id >= 35 && host.id <= 96, `lesson ${host.id} is outside the reading stretch`);
    assert.equal(host.grammarQuestionCount, 0, `lesson ${host.id} already carries a grammar block`);
  }
});

test("the manifest agrees with the texts themselves", () => {
  for (const section of sections) {
    const summary = readingSummaries.find((item) => item.id === section.id);
    assert.ok(summary, `section ${section.id} is missing from the manifest`);
    assert.equal(summary.lessonId, section.lessonId);
    assert.equal(summary.textCount, section.texts.length);
    assert.equal(
      summary.sentenceCount,
      section.texts.reduce((total, text) => total + text.sentences.length, 0),
    );
    assert.equal(section.source, READING_SOURCE);
    assert.equal(readingByLesson.get(section.lessonId)?.id, section.id);
  }
  // One text per lesson: the card offers a single reading, not a list.
  assert.equal(new Set(readingSummaries.map((item) => item.lessonId)).size, readingSummaries.length);
});

test("every sentence is a pair", () => {
  for (const section of sections) {
    assert.ok(section.texts.length > 0, `section ${section.id} has no texts`);
    for (const text of section.texts) {
      assert.ok(text.title.length > 0, `section ${section.id} has an unnamed text`);
      assert.ok(text.sentences.length > 0, `«${text.title}» has no sentences`);
      for (const line of text.sentences) {
        assert.match(line.arabic, /[؀-ۿ]/, `«${text.title}»: ${line.russian} has no Arabic`);
        assert.match(line.russian, /[Ѐ-ӿ]/, `«${text.title}»: ${line.arabic} has no Russian`);
      }
    }
  }
});

// The point of this pass: reading widens what the learner can read, not what
// the course asks them to recall. Nothing here may reach the cards.
test("reading vocabulary stays out of the course", async () => {
  const store = await readFile(new URL("../app/progress-store.ts", import.meta.url), "utf8");
  assert.match(store, /READING_PROGRESS_KEY = "shifahiya-reading-v1"/);

  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  // Cards are built from lesson decks alone; the reading screen only reads.
  assert.doesNotMatch(page, /reading[\w.]*\.sentences[\s\S]{0,200}updateCards/);
  assert.match(page, /reading\.texts\.map/);
});

test("a text comes back on its own schedule", () => {
  assert.deepEqual(READING_INTERVALS, [2, 4, 7, 15, 31]);
  const day = new Date("2026-03-01T09:00:00Z");

  const first = nextReadingProgress(undefined, day);
  assert.equal(first.box, 0);
  assert.equal(first.reads, 1);
  assert.equal(first.lastRead, "2026-03-01");
  assert.equal(first.nextReview, "2026-03-03");

  const second = nextReadingProgress(first, new Date("2026-03-03T09:00:00Z"));
  assert.equal(second.box, 1);
  assert.equal(second.reads, 2);
  assert.equal(second.nextReview, "2026-03-07");

  // Reading it again never shortens the interval, and the last step holds.
  let item = second;
  for (let step = 0; step < 6; step += 1) item = nextReadingProgress(item, day);
  assert.equal(item.box, READING_INTERVALS.length - 1);
  assert.equal(item.nextReview, readingDate(31, day));
  assert.equal(item.reads, 8);
});

test("only the texts that are due are asked for", () => {
  const readings = {
    36: { box: 0, nextReview: "2026-03-01", lastRead: "2026-02-27", reads: 1 },
    40: { box: 2, nextReview: "2026-03-20", lastRead: "2026-03-13", reads: 3 },
    52: { box: 1, nextReview: "2026-03-02", lastRead: "2026-02-26", reads: 2 },
  };
  assert.deepEqual(dueReadingIds(readings, "2026-03-02"), [36, 52]);
  assert.deepEqual(dueReadingIds(readings, "2026-02-28"), []);
  assert.deepEqual(dueReadingIds({}, "2026-03-02"), []);
});
