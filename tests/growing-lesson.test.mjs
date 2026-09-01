// A lesson can grow after learners have already passed it. Nothing they earned
// may be taken away by that, and nothing may ask them to walk it again.
import assert from "node:assert/strict";
import test from "node:test";

import { PART_THRESHOLD, lessonParts, partIndexFor } from "../content/lesson-parts.ts";
import { isLessonComplete, unlockedLessonIds } from "../app/lesson-access.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

function lessonOf(id, decks, questions, grammar = 0) {
  return {
    id,
    arabicTitle: "",
    title: "",
    description: "",
    tags: [],
    decks: decks.map((size) => ({
      title: "",
      words: Array.from({ length: size }, (_, i) => ({ arabic: `a${i}`, russian: `r${i}` })),
    })),
    questions: Array.from({ length: questions }, (_, i) => ({
      prompt: `p${i}`,
      promptLang: "ar",
      answer: `a${i}`,
      options: [`a${i}`],
      explanation: "",
    })),
    ...(grammar ? { grammar: { title: "", intro: "", rules: [], questions: [] } } : {}),
  };
}

const summary = (id) => ({ id, grammarQuestionCount: 0 });

test("a lesson that grows stays passed", () => {
  // The score was earned when the lesson was small; the lesson is now large.
  const progress = normalizeProgress({ scores: { 30: 26 } });
  assert.equal(isLessonComplete(summary(30), progress), true);
});

test("growing a lesson does not re-lock what came after it", () => {
  const progress = normalizeProgress({ scores: { 30: 26, 31: 40 } });
  const summaries = Array.from({ length: 34 }, (_, i) => summary(i + 1));
  const open = unlockedLessonIds(summaries, progress);
  assert.ok(open.has(31), "the lesson after a passed one must stay open");
  assert.ok(open.has(32), "the next one must still unlock");
});

test("the total a score was earned out of travels with the score", () => {
  // The phone finished the short version, the laptop the grown one.
  const phone = normalizeProgress({ scores: { 30: 26 }, scoreTotals: { 30: 56 } });
  const laptop = normalizeProgress({ scores: { 30: 80 }, scoreTotals: { 30: 96 } });

  for (const merged of [mergeProgress(phone, laptop), mergeProgress(laptop, phone)]) {
    assert.equal(merged.scores[30], 80);
    assert.equal(merged.scoreTotals[30], 96, "the winning score keeps its own denominator");
  }
});

test("a score without a recorded total survives the merge", () => {
  const old = normalizeProgress({ scores: { 30: 26 } });
  const fresh = normalizeProgress({ scores: { 31: 40 }, scoreTotals: { 31: 80 } });
  const merged = mergeProgress(old, fresh);
  assert.equal(merged.scores[30], 26);
  assert.equal(merged.scoreTotals[30], undefined, "an unknown total stays unknown, not invented");
  assert.equal(merged.scoreTotals[31], 80);
});

test("a session parked in a whole lesson resumes in the part that holds it", () => {
  // Parked at question 200 back when the lesson was one part; it is two now.
  const grown = lessonOf(30, [40, 40], PART_THRESHOLD * 2);
  const parts = lessonParts(grown);
  assert.equal(parts.filter((part) => part.kind === "cards").length, 2);

  const late = { view: "practice", questionIndex: PART_THRESHOLD + 10, deckIndex: 1 };
  assert.equal(partIndexFor(parts, late, 0), 1, "a late question belongs to the second part");

  const early = { view: "practice", questionIndex: 3, deckIndex: 0 };
  assert.equal(partIndexFor(parts, early, 0), 0);
});

test("a session parked in the cards resumes by its deck", () => {
  const grown = lessonOf(30, [40, 40], PART_THRESHOLD * 2);
  const parts = lessonParts(grown);
  assert.equal(partIndexFor(parts, { view: "learn", questionIndex: 0, deckIndex: 1 }, 0), 1);
  assert.equal(partIndexFor(parts, { view: "learn", questionIndex: 0, deckIndex: 0 }, 0), 0);
});

test("a position past the end falls back rather than crashing", () => {
  const small = lessonOf(30, [4, 4], 10);
  const parts = lessonParts(small);
  const beyond = { view: "practice", questionIndex: 999, deckIndex: 9 };
  assert.equal(partIndexFor(parts, beyond, 0), 0);
});

test("appending decks leaves the card ids of earlier words untouched", () => {
  // Review cards are addressed by deck and word index, so anything added has
  // to go on the end: inserting in the middle would silently reassign boxes.
  const before = lessonOf(30, [4, 4], 10);
  const after = lessonOf(30, [4, 4, 8], 26);
  const idsOf = (lesson) =>
    lesson.decks.flatMap((deck, d) => deck.words.map((_, w) => `lesson-30-deck-${d}-word-${w}-ar-ru`));
  const old = idsOf(before);
  assert.deepEqual(idsOf(after).slice(0, old.length), old);
});
