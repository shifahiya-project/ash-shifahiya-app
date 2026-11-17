import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { PART4_REVISION, part4LegacySummaries } from "../content/part4/revision.ts";
import { part4ReviewLessons } from "../content/part4/review-map.ts";

const directory = new URL("../content/part4/", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [source, audit, addresses] = await Promise.all([
  readJson("../docs/audits/fiqh-source-index-2026-11-17.json"),
  readJson("../docs/audits/fiqh-source-2026-11-17.json"),
  readJson("../content/part4/review-addresses.json"),
]);
const files = (await readdir(directory)).filter((file) => /^lesson-\d+\.ts$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const lessons = await Promise.all(files.map(async (file) =>
  Object.values(await import(new URL(file, directory).href))[0]));
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

// The fixture was produced directly from the checked, cleaned author exports,
// independently of the TypeScript importer. Each hash includes every source ID,
// both language fields and their order, so count-only checks cannot hide a loss.
test("all 159 lessons preserve every source fragment and glossary entry in order", () => {
  assert.equal(source.revision, PART4_REVISION);
  assert.equal(lessons.length, 159);
  assert.equal(source.lessons.length, 159);
  assert.deepEqual(source.sourceSha256, audit.sourceSha256);
  for (const [index, lesson] of lessons.entries()) {
    const expected = source.lessons[index];
    assert.equal(lesson.id, index + 1);
    assert.equal(lesson.revision, PART4_REVISION);
    for (const field of ["title", "arabicTitle", "section"]) {
      assert.equal(lesson[field], expected[field], `lesson ${lesson.id}: ${field}`);
    }
    assert.equal(lesson.words.length, expected.wordCount, `lesson ${lesson.id}: glossary count`);
    assert.equal(lesson.fragments.length, expected.fragmentCount, `lesson ${lesson.id}: reading count`);
    assert.equal(sha256(lesson.fragments.map((line) => [line.sourceId,
      line.heading ? "heading" : "pair", line.arabic, line.russian, line.headingLevel ?? null])),
    expected.readingSha256, `lesson ${lesson.id}: complete reading differs from the source`);
    assert.equal(sha256(lesson.words.map((word) => [word.source.id, word.arabic, word.russian,
      word.kind, word.source.contextId, word.source.contextKind, word.source.contextSourceId,
      word.source.oldLesson, word.source.origin])), expected.glossarySha256,
    `lesson ${lesson.id}: complete glossary differs from the source`);
  }
});

test("the complete edition has 4485 pairs, 183 headings and all 907 words", () => {
  const fragments = lessons.flatMap((lesson) => lesson.fragments);
  const headings = fragments.filter((line) => line.heading);
  assert.equal(fragments.length, 4668);
  assert.equal(headings.length, 183);
  assert.equal(fragments.length - headings.length, 4485);
  assert.equal(new Set(fragments.map((line) => line.sourceId)).size, 4668);
  assert.equal(lessons.reduce((total, lesson) => total + lesson.words.length, 0), 907);
  assert.deepEqual(lessons.filter((lesson) => lesson.words.length === 0).map((lesson) => lesson.id),
    audit.wordlessLessons);
  const sections = lessons.filter((lesson, index) => index === 0
    || lessons[index - 1].section !== lesson.section).map((lesson) => lesson.section);
  assert.deepEqual(sections, audit.books.map((book) => book.ru));
});

test("all 737 dictionary contexts belong to the same new lesson as their word", () => {
  const contexts = new Set();
  for (const lesson of lessons) {
    const fragments = new Map(lesson.fragments.map((line) => [line.sourceId, line]));
    for (const word of lesson.words) {
      const source = word.source;
      assert.ok(source && /^tfq-vocab-(?:new-)?\d+$/.test(source.id), `lesson ${lesson.id}: missing word ID`);
      const context = fragments.get(source.contextId);
      assert.ok(context, `${source.id}: context ${source.contextId} outside lesson ${lesson.id}`);
      assert.equal(source.contextKind, context.heading ? "heading" : "pair");
      assert.equal(source.contextSourceId,
        context.heading ? null : Number(context.sourceId.slice(2)));
      contexts.add(source.contextId);
    }
  }
  assert.equal(contexts.size, 737);
});

test("four Russian-only source headings survive without invented Arabic", () => {
  const headings = lessons.flatMap((lesson) => lesson.fragments
    .filter((line) => line.arabic === "").map((line) => ({
      lesson: lesson.id, block: Number(line.sourceId.split("-")[2]), russian: line.russian,
    })));
  assert.deepEqual(headings, audit.russianOnlyHeadings);
  assert.equal(headings.length, 4);
  for (const lesson of lessons) {
    for (const line of lesson.fragments) {
      if (!line.arabic) assert.equal(line.heading, true);
      assert.doesNotMatch(line.arabic, /[а-яё]/iu, `${line.sourceId}: inline Russian note`);
    }
  }
});

test("review addresses retain identities and never recycle the 923 historical slots", () => {
  assert.equal(addresses.revision, PART4_REVISION);
  assert.equal(addresses.baselineCommit, source.baselineCommit);
  assert.deepEqual(part4LegacySummaries.map((lesson) => lesson.wordCount), source.legacyWordCounts);
  assert.equal(source.legacyWordCounts.reduce((total, count) => total + count, 0), 923);
  const fresh = new Set(source.freshSourceIds);
  assert.equal(fresh.size, 53);
  assert.ok(fresh.has("tfq-vocab-0516"));
  assert.ok(fresh.has("tfq-vocab-0557"));
  const seen = new Set();
  const sourceIds = new Set();
  let retained = 0;
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      const id = word.source.id;
      sourceIds.add(id);
      assert.deepEqual({ lessonId: word.reviewLessonId, index: word.reviewIndex },
        addresses.addresses[id], `${id}: stable identity changed`);
      const address = `${word.reviewLessonId}-${word.reviewIndex}`;
      assert.equal(seen.has(address), false, `${id}: review address collision`);
      seen.add(address);
      assert.equal(part4ReviewLessons[address], lesson.id, `${id}: review opens the wrong lesson`);
      const legacyCount = source.legacyWordCounts[word.reviewLessonId - 1] ?? 0;
      if (fresh.has(id)) {
        assert.ok(word.reviewIndex >= legacyCount, `${id}: new meaning reused a historical slot`);
      } else {
        assert.ok(word.reviewIndex < legacyCount, `${id}: existing word lost its historical slot`);
        retained += 1;
      }
    }
  }
  assert.equal(retained, 854);
  assert.equal(seen.size, 907);
  assert.equal(sourceIds.size, 907);
  assert.deepEqual([...sourceIds].sort(), Object.keys(addresses.addresses).sort());
  assert.deepEqual([...seen].sort(), Object.keys(part4ReviewLessons).sort());
});
