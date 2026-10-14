import assert from "node:assert/strict";
import test from "node:test";
import { readdir } from "node:fs/promises";
import { expandLessonQuestions } from "../content/questions.ts";
import { questionsForSavedSession } from "../content/session-questions.ts";
import { preAuditDeckCounts, preAuditQuestionCounts } from "../content/pre-audit-question-counts.ts";
import { lessonParts, partIndexFor } from "../content/lesson-parts.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";
import { isLessonComplete, unlockedLessonIds } from "../app/lesson-access.ts";

function version(words) {
  return expandLessonQuestions({
    id: 1, title: "", arabicTitle: "", description: "", tags: [],
    decks: words.map((deck) => ({ title: "", words: deck })),
    questions: [{
      prompt: "هُمْ كَبِيرٌ", promptLang: "ar", answer: "هُمْ كِبَارٌ",
      options: ["هُمْ كِبَارٌ", "هُوَ كَبِيرٌ", "هُمْ صِغَارٌ"], explanation: "Согласование",
    }],
  });
}
const originalWords = [
  { arabic: "كَبِيرٌ", russian: "большой" },
  { arabic: "صَغِيرٌ", russian: "маленький" },
];
const original = version([originalWords]);
const updated = version([originalWords, [
  { arabic: "طَوِيلٌ", russian: "высокий / длинный" },
  { arabic: "قَصِيرٌ", russian: "невысокий / короткий" },
]]);

test("an unfinished paper keeps its closing correction at the saved index", () => {
  const resumed = questionsForSavedSession(updated, original.questions.length);
  const content = (questions) => questions.map(({ prompt, promptLang, answer }) => ({ prompt, promptLang, answer }));
  assert.deepEqual(content(resumed.questions), content(original.questions));
  assert.deepEqual(resumed.questions.at(-1), original.questions.at(-1));
  assert.equal(updated.questions.length, original.questions.length + 4,
    "a fresh run still offers the added vocabulary");
  assert.equal(questionsForSavedSession(updated), updated);
});

test("corrected wording also reaches a previously saved paper", () => {
  const corrected = { ...updated, questions: updated.questions.map((q, i) =>
    i === 0 ? { ...q, explanation: "Исправленное объяснение" } : q) };
  const resumed = questionsForSavedSession(corrected, original.questions.length);
  assert.equal(resumed.questions[0].explanation, "Исправленное объяснение");
  assert.equal(resumed.questions.at(-1).prompt, original.questions.at(-1).prompt);
});

test("invalid saved sizes never truncate the current paper", () => {
  for (const count of [0, -1, NaN, 1.5, updated.questions.length + 1]) {
    assert.equal(questionsForSavedSession(updated, count), updated);
  }
  for (const count of [0, -1, NaN, 1.5, updated.decks.length + 1]) {
    assert.equal(questionsForSavedSession(updated, undefined, count), updated);
  }
});

test("an unfinished second half keeps its decks and never repeats first-half answers", () => {
  const deck = (prefix, count) => Array.from({ length: count }, (_, i) => ({
    arabic: `${prefix}${i}`, russian: `${prefix}-meaning-${i}`,
  }));
  const old = version([deck("a", 40), deck("b", 40)]);
  const grown = version([...old.decks.map(({ words }) => words), deck("c", 60)]);
  const originalParts = lessonParts(old);
  const savedPosition = { view: "learn", questionIndex: 80, deckIndex: 1 };
  assert.equal(partIndexFor(lessonParts(grown), savedPosition, 1), 0,
    "appending a large deck moves the old second deck into today's first half");

  const resumed = questionsForSavedSession(grown, old.questions.length, old.decks.length);
  const restoredParts = lessonParts(resumed);
  assert.deepEqual(restoredParts, originalParts);
  assert.equal(partIndexFor(restoredParts, savedPosition, 1), 1);
  assert.equal(restoredParts[1].questionStart, savedPosition.questionIndex,
    "the second half resumes after the already-answered prefix");
  assert.deepEqual(resumed.decks, old.decks);
  assert.equal(questionsForSavedSession(grown), grown,
    "a fresh retake still teaches every added deck");
});

test("legacy session metadata reconstructs every pre-audit paper from the preserved deck prefix", async () => {
  const files = (await readdir(new URL("../content/", import.meta.url)))
    .filter((file) => /^lesson-\d+\.ts$/.test(file));
  assert.equal(files.length, 100);
  for (const file of files) {
    const authored = Object.values(await import(new URL(`../content/${file}`, import.meta.url)))[0];
    const questionCount = preAuditQuestionCounts[authored.id];
    const deckCount = preAuditDeckCounts[authored.id];
    assert.ok(Number.isInteger(deckCount) && deckCount <= authored.decks.length, file);
    const originalDecks = authored.decks.slice(0, deckCount);
    assert.equal(originalDecks.reduce((sum, deck) => sum + deck.words.length * 2, 0), questionCount,
      `${file}: the old word positions and counts must remain intact`);
    const current = expandLessonQuestions(authored);
    const resumed = questionsForSavedSession(current, questionCount, deckCount);
    const oldPaper = expandLessonQuestions({ ...authored, decks: originalDecks });
    const identities = (lesson) => lesson.questions.map(({ prompt, promptLang, answer }) => ({ prompt, promptLang, answer }));
    assert.deepEqual(identities(resumed), identities(oldPaper), file);
    assert.deepEqual(lessonParts(resumed), lessonParts(oldPaper), file);
  }
});

test("resuming the last old question does not require newly inserted questions", () => {
  const resumed = questionsForSavedSession(updated, original.questions.length);
  const position = { view: "practice", deckIndex: 0, questionIndex: original.questions.length - 1 };
  const parts = lessonParts(resumed);
  const part = parts[partIndexFor(parts, position)];
  assert.equal(position.questionIndex, part.questionEnd - 1);
  assert.equal(resumed.questions.length, original.questions.length,
    "the result keeps the denominator the learner actually answered");
});

test("saved paper size, completed lessons and review boxes survive backup and sync", () => {
  const card = { box: 5, nextReview: "2026-11-15", lastReviewed: "2026-10-12", correct: 14, wrong: 2 };
  const saved = normalizeProgress({
    scores: { 1: 4 }, scoreTotals: { 1: original.questions.length },
    cards: { "lesson-1-deck-0-word-0-ar-ru": card },
    sessions: { 2: { lessonId: 2, view: "practice", partIndex: 0, deckIndex: 0,
      round: 2, cardIndex: 1, questionIndex: 3, questionCount: 28, deckCount: 2,
      answered: { option: "Old spelling", correct: true }, score: 2, mistakes: [] } },
  });
  const restored = normalizeProgress(JSON.parse(JSON.stringify(saved)));
  const merged = mergeProgress(restored, normalizeProgress({}));
  assert.deepEqual(merged.cards, saved.cards);
  assert.deepEqual(merged.sessions, saved.sessions);
  assert.deepEqual(merged.scoreTotals, saved.scoreTotals);
  assert.deepEqual(merged.scores, saved.scores);
  assert.equal(isLessonComplete({ id: 1 }, merged), true);
  assert.ok(unlockedLessonIds([{ id: 1 }, { id: 2 }], merged).has(2));
});

test("the stored session keeps its already-counted answer through backup and replacement", async () => {
  const items = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    },
  };
  const { progressStore, ACTIVE_SESSION_KEY, lessonSessionKey } = await import("../app/progress-store.ts");
  const session = {
    lessonId: 1, view: "practice", partIndex: 0, deckIndex: 0, round: 1,
    cardIndex: 0, questionIndex: 2, questionCount: 28, deckCount: 2,
    score: 3, mistakes: [], answered: { option: "Old spelling", correct: true }, updatedAt: 100,
  };
  progressStore.saveSession(session);
  for (const key of [ACTIVE_SESSION_KEY, lessonSessionKey(1)]) {
    assert.deepEqual(JSON.parse(items.get(key)), session);
  }
  const backup = JSON.parse(JSON.stringify(progressStore.getSnapshot()));
  progressStore.replaceAll(mergeProgress(normalizeProgress({}), normalizeProgress(backup)));
  assert.deepEqual(progressStore.getSnapshot().sessions[1], session);
  assert.equal(progressStore.getSnapshot().sessions[1].score, 3,
    "the answer is already included, so restoring it must not award it again");

  const fresher = {
    ...session, questionIndex: 8, questionCount: 46, deckCount: 3,
    score: 7, answered: undefined, updatedAt: 200,
  };
  progressStore.replaceAll(mergeProgress(progressStore.getSnapshot(),
    normalizeProgress({ sessions: { 1: fresher } })));
  assert.deepEqual(JSON.parse(items.get(ACTIVE_SESSION_KEY)), JSON.parse(JSON.stringify(fresher)),
    "a stale active copy must not override the newer session pulled from another device");
  assert.deepEqual(progressStore.getSnapshot().sessions[1], JSON.parse(JSON.stringify(fresher)));

  items.set(ACTIVE_SESSION_KEY, JSON.stringify(session));
  progressStore.updateStats((stats) => stats);
  assert.equal(progressStore.getSnapshot().sessions[1].questionIndex, 8,
    "a newer per-lesson save must also win when old storage still contains a stale active copy");
});
