import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { part11Summaries } from "../content/part11/manifest.ts";
import { part11Glossary } from "../content/part11/glossary.ts";
import { textCourseQuestions, textCourseNeedsMetWords } from "../content/text-course-questions.ts";
import { isPart11Open, part11CardId, part11LessonIdsInCards, unlockedPart11Ids } from "../app/part11-access.ts";
import { normalizeProgress, mergeProgress } from "../app/merge-progress.ts";
import { prepareNasafi } from "../scripts/import-part11.mjs";

const directory = new URL("../content/part11/", import.meta.url);
const files = (await readdir(directory)).filter((file) => /^lesson-\d+\.ts$/u.test(file)).sort();
const lessons = await Promise.all(files.map(async (file) => Object.values(await import(new URL(file, directory).href))[0]));

test("Nasafi imports all 94 lessons, 592 words and 3000 aligned fragments", () => {
  assert.equal(lessons.length, 94);
  assert.equal(lessons.reduce((n, lesson) => n + lesson.words.length, 0), 592);
  assert.equal(lessons.reduce((n, lesson) => n + lesson.fragments.length, 0), 3000);
  const words = [];
  for (const [index, lesson] of lessons.entries()) {
    assert.equal(lesson.id, index + 1);
    assert.equal(lesson.book, "Тафсир ан-Насафи");
    assert.ok(lesson.title && lesson.section && lesson.chapter);
    const summary = part11Summaries[index];
    assert.deepEqual(summary, {
      id: lesson.id, book: lesson.book, section: lesson.section, chapter: lesson.chapter,
      arabicTitle: lesson.arabicTitle, title: lesson.title,
      wordCount: lesson.words.length, fragmentCount: lesson.fragments.length,
    });
    for (const fragment of lesson.fragments) {
      assert.match(fragment.arabic, /[ء-ي]/u);
      assert.match(fragment.russian, /[а-яё]/iu);
    }
    words.push(...lesson.words.map((word) => ({ lesson: lesson.id, ...word })));
  }
  assert.deepEqual(part11Glossary, words);
  assert.deepEqual(lessons.filter((lesson) => !lesson.words.length).map((lesson) => lesson.id), [23, 29, 63, 66]);
});

test("every Arabic string matches the supplied archives, including absent vowels and combining order", async () => {
  // These hashes were captured directly from the uploaded JSON files, outside
  // the importer. Updating a lesson must not silently rewrite its source text.
  const expected = JSON.parse(await readFile(new URL("./fixtures/nasafi-arabic-sha256.json", import.meta.url), "utf8"));
  for (const [index, lesson] of lessons.entries()) {
    const strings = [lesson.arabicTitle, ...lesson.words.map((word) => word.arabic), ...lesson.fragments.map((line) => line.arabic)];
    const actual = createHash("sha256").update(JSON.stringify(strings)).digest("hex");
    assert.equal(actual, expected[index], `урок ${lesson.id}: арабский изменён`);
  }
  const fragments = lessons.flatMap((lesson) => lesson.fragments);
  assert.equal(fragments.filter((line) => !/[\u064b-\u0652]/u.test(line.arabic)).length, 81);
  assert.equal(fragments.filter((line) => line.arabic !== line.arabic.normalize("NFC")).length, 1718);
});

test("Qur'anic ayat are distinct from commentary, headings and poetry", () => {
  const fragments = lessons.flatMap((lesson) => lesson.fragments);
  assert.equal(fragments.filter((line) => line.ayah).length, 1140);
  assert.equal(fragments.filter((line) => line.heading).length, 9);
  assert.equal(fragments.filter((line) => line.verse).length, 0);
  assert.equal(fragments.filter((line) => !line.ayah && !line.heading).length, 1851);
});

test("all new words, including adverbs, have three distinct reading-oriented answers", () => {
  assert.equal(part11Glossary.filter((word) => word.kind === "adverb").length, 4);
  for (const lesson of lessons) {
    const met = textCourseNeedsMetWords(lesson) ? part11Glossary.filter((word) => word.lesson < lesson.id) : [];
    const questions = textCourseQuestions(lesson, met);
    assert.equal(questions.length, lesson.words.length);
    const allowed = new Set([...lesson.words, ...met].map((word) => word.russian));
    for (const [index, question] of questions.entries()) {
      assert.equal(question.prompt, lesson.words[index].arabic);
      assert.equal(question.answer, lesson.words[index].russian);
      assert.equal(question.promptLang, "ar");
      assert.equal(new Set(question.options).size, 3, `урок ${lesson.id}: ${question.prompt}`);
      assert.ok(question.options.includes(question.answer));
      assert.ok(question.options.every((option) => allowed.has(option)));
    }
  }
});

test("the eleventh course waits for the tenth and retains touched lessons", () => {
  const previous = [{ id: 1 }, { id: 2 }];
  assert.equal(isPart11Open(previous, { 1: 12 }), false);
  assert.equal(isPart11Open(previous, { 1: 12, 2: 0 }), true);
  assert.equal(isPart11Open([], {}), false);
  const empty = { part11Scores: {}, part11Sessions: {}, cards: {} };
  assert.deepEqual([...unlockedPart11Ids(part11Summaries, empty, true)], [1]);
  assert.equal(unlockedPart11Ids(part11Summaries, empty, false).size, 0);
  assert.deepEqual([...unlockedPart11Ids(part11Summaries, { ...empty, part11Scores: { 1: 12 } }, true)], [1, 2]);
  const cards = { [part11CardId(5, 0, "ar-ru")]: {}, "p1-lesson-8-word-0-ar-ru": {}, "p10-lesson-7-word-0-ru-ar": {} };
  assert.deepEqual(part11LessonIdsInCards(cards), [5]);
  assert.deepEqual([...unlockedPart11Ids(part11Summaries, { ...empty, cards }, true)], [1, 2, 3, 4, 5]);
});

test("old backups default the tafsir to empty and sync keeps its best scores and latest sessions", () => {
  const older = normalizeProgress({ part10Scores: { 1: 3 } });
  assert.deepEqual(older.part11Scores, {});
  assert.deepEqual(older.part11Sessions, {});
  const early = { lessonId: 1, view: "learn", index: 2, score: 0, mistakes: [], updatedAt: 10 };
  const later = { ...early, view: "reading", index: 0, score: 12, updatedAt: 20 };
  const a = normalizeProgress({ part11Scores: { 1: 12 }, part11Sessions: { 2: early } });
  const b = normalizeProgress({ part11Scores: { 1: 8, 3: 0 }, part11Sessions: { 2: later } });
  for (const merged of [mergeProgress(a, b), mergeProgress(b, a)]) {
    assert.deepEqual(merged.part11Scores, { 1: 12, 3: 0 });
    assert.deepEqual(merged.part11Sessions, { 2: later });
  }
});

test("the adapter rejects mismatched exports and unknown content instead of losing rows", () => {
  const header = { number: 1, surah: 1, name: "аль-Фатиха", firstAyah: 1, lastAyah: 1, topic: "Басмала", arabicTitle: "الفاتحة" };
  const glossary = { lessonCount: 1, entryCount: 0, lessons: [{ ...header, entries: [] }] };
  const text = { lessons: [{ id: 1, surah: 1, name: header.name, first: 1, last: 1, topic: header.topic, arabic: header.arabicTitle,
    blocks: [{ id: "one", kind: "tafsir", ar: "بسم الله", ru: "Во имя Аллаха" }] }] };
  assert.equal(prepareNasafi(glossary, text).text.lessons[0].blocks[0].ar, "بسم الله");
  const mismatch = structuredClone(text);
  mismatch.lessons[0].last = 2;
  assert.throws(() => prepareNasafi(glossary, mismatch), /не согласованы/u);
  const unknown = structuredClone(text);
  unknown.lessons[0].blocks[0].kind = "unknown";
  assert.throws(() => prepareNasafi(glossary, unknown), /неизвестный блок/u);
  const repeated = structuredClone(text);
  repeated.lessons[0].blocks.push({ ...repeated.lessons[0].blocks[0] });
  assert.throws(() => prepareNasafi(glossary, repeated), /неизвестный блок/u);
});
