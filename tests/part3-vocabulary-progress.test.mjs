import assert from "node:assert/strict";
import test from "node:test";
import { activeTextWordIndexes, textCourseSessionWordIndexes } from "../app/part3-vocabulary.ts";
import { part3LegacyWordCounts } from "../content/part3/legacy-word-counts.ts";
import { textCourseQuestions } from "../content/text-course-questions.ts";
import { part3CardId, unlockedPart3Ids } from "../app/part3-access.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

const originalCount = part3LegacyWordCounts[1];
const word = (index) => ({
  arabic: `كَلِمَةٌ ${index}`, russian: `значение ${index}`, kind: "noun",
});
const lesson = () => ({
  id: 1, book: "Book", title: "Lesson", arabicTitle: "دَرْسٌ", fragments: [],
  words: Array.from({ length: originalCount + 2 }, (_, index) => ({
    ...word(index), ...(index === 1 ? { retired: true } : {}),
  })),
});
const session = (overrides = {}) => ({
  lessonId: 1, view: "practice", index: 7, score: 5, mistakes: ["old answer"], updatedAt: 100,
  ...overrides,
});

test("new attempts exclude retired positions and include appended vocabulary", () => {
  const loaded = lesson();
  const before = structuredClone(loaded);
  const indexes = textCourseSessionWordIndexes(3, loaded);
  assert.deepEqual(indexes, activeTextWordIndexes(loaded));
  assert.equal(indexes.length, originalCount + 1);
  assert.equal(indexes.includes(1), false);
  assert.deepEqual(indexes.slice(-2), [originalCount, originalCount + 1]);
  const questions = textCourseQuestions({ ...loaded, words: indexes.map((index) => loaded.words[index]) });
  assert.equal(questions.length, indexes.length);
  assert.equal(questions.some((question) => question.prompt === loaded.words[1].arabic), false);
  assert.equal(questions.at(-1).prompt, loaded.words.at(-1).arabic);
  assert.deepEqual(loaded, before, "selecting vocabulary never rewrites the lesson");
});

test("legacy sessions keep their original card and paper sequence at every stage", () => {
  const loaded = lesson();
  for (const view of ["learn", "practice", "reading"]) {
    const saved = session({ view });
    const before = structuredClone(saved);
    const indexes = textCourseSessionWordIndexes(3, loaded, saved);
    assert.deepEqual(indexes, Array.from({ length: originalCount }, (_, index) => index));
    const questions = textCourseQuestions({ ...loaded, words: indexes.map((index) => loaded.words[index]) });
    assert.equal(questions.length, originalCount);
    assert.equal(questions[1].prompt, loaded.words[1].arabic, "a retired word cannot shift an unfinished paper");
    assert.equal(questions[saved.index].prompt, loaded.words[saved.index].arabic);
    assert.deepEqual(saved, before, "resuming retains the saved score, mistakes and position");
  }
});

test("an explicit snapshot survives later additions and retirements without sharing its array", () => {
  const loaded = lesson();
  const saved = session({ wordIndexes: textCourseSessionWordIndexes(3, loaded) });
  const before = structuredClone(saved);
  loaded.words[2].retired = true;
  loaded.words.push(word(loaded.words.length));
  const resumed = textCourseSessionWordIndexes(3, loaded, saved);
  assert.deepEqual(resumed, before.wordIndexes);
  assert.equal(resumed.includes(2), true);
  assert.equal(resumed.includes(loaded.words.length - 1), false);
  resumed.push(999);
  assert.deepEqual(saved, before, "the UI cannot mutate a stored snapshot by retaining its array");
  assert.deepEqual(textCourseSessionWordIndexes(3, loaded, session({ wordIndexes: [] })), []);
});

test("filtering a retired word never renumbers the following review addresses", () => {
  const loaded = lesson();
  const indexes = activeTextWordIndexes(loaded);
  const addresses = indexes.flatMap((index) => [
    part3CardId(loaded.id, index, "ar-ru"), part3CardId(loaded.id, index, "ru-ar"),
  ]);
  assert.equal(addresses.includes("p3-lesson-1-word-1-ar-ru"), false);
  assert.equal(addresses[2], "p3-lesson-1-word-2-ar-ru");
  assert.equal(addresses[3], "p3-lesson-1-word-2-ru-ar");
  assert.equal(addresses.at(-2), `p3-lesson-1-word-${originalCount + 1}-ar-ru`);
});

test("other text courses retain their complete sequence and do not adopt third-course snapshots", () => {
  const loaded = lesson();
  const all = loaded.words.map((_, index) => index);
  for (const courseId of [4, 5, 6, 7, 8, 9, 10, 11]) {
    assert.deepEqual(textCourseSessionWordIndexes(courseId, loaded), all);
    assert.deepEqual(textCourseSessionWordIndexes(courseId, loaded, session()), all);
    assert.deepEqual(textCourseSessionWordIndexes(courseId, loaded, session({ wordIndexes: [4, 2] })), all);
  }
});

class FakeStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}
const events = new EventTarget();
globalThis.window = {
  localStorage: new FakeStorage(),
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
};
const { progressStore } = await import("../app/progress-store.ts");

test("snapshots survive sync and backups while existing card histories and completion stay intact", () => {
  const indexes = textCourseSessionWordIndexes(3, lesson());
  const saved = session({ wordIndexes: indexes, updatedAt: 200 });
  const retiredId = part3CardId(1, 1, "ar-ru");
  const activeId = part3CardId(1, 2, "ar-ru");
  const cards = {
    [retiredId]: { box: 4, nextReview: "2026-11-08", lastReviewed: "2026-11-01", correct: 7, wrong: 1 },
    [activeId]: { box: 3, nextReview: "2026-11-09", lastReviewed: "2026-11-02", correct: 5, wrong: 2 },
  };
  const before = normalizeProgress({ part3Scores: { 1: originalCount }, cards });
  const merged = mergeProgress(
    { ...before, part3Sessions: { 1: session() } },
    normalizeProgress({ part3Sessions: { 1: saved } }),
  );
  assert.deepEqual(merged.part3Sessions[1], saved);
  progressStore.replaceAll(merged);
  progressStore.savePart3Session({ ...saved, wordIndexes: [...indexes] });
  const backup = JSON.parse(JSON.stringify(progressStore.getSnapshot()));
  progressStore.replaceAll(normalizeProgress({}));
  progressStore.replaceAll(normalizeProgress(backup));
  assert.deepEqual(progressStore.getSnapshot().part3Sessions[1].wordIndexes, indexes);
  progressStore.finishPart3Lesson(1, 1);
  const after = progressStore.getSnapshot();
  assert.deepEqual(after.cards, cards, "retiring vocabulary must not erase its stored boxes");
  assert.equal(after.part3Scores[1], originalCount, "the historical completed score cannot be lowered");
  assert.deepEqual([...unlockedPart3Ids([{ id: 1 }, { id: 2 }, { id: 3 }], after, true)], [1, 2]);
});
