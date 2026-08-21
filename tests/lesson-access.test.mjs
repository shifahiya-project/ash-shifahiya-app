import assert from "node:assert/strict";
import test from "node:test";

import {
  grammarPassMark,
  isGrammarPassed,
  isLessonComplete,
  unlockedLessonIds,
} from "../app/lesson-access.ts";

const summaries = Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }));

const nothing = { scores: {}, grammarScores: {}, sessions: {}, cards: {} };

function session(lessonId) {
  return {
    view: "learn",
    lessonId,
    partIndex: 0,
    deckIndex: 0,
    round: 1,
    cardIndex: 0,
    questionIndex: 0,
    score: 0,
    mistakes: [],
    updatedAt: 1,
  };
}

function card(lessonId, wordIndex = 0, direction = "ar-ru") {
  return [
    `lesson-${lessonId}-deck-0-word-${wordIndex}-${direction}`,
    { box: 1, nextReview: "2026-01-02", lastReviewed: "2026-01-01", correct: 1, wrong: 0 },
  ];
}

test("a new learner starts with the first lesson only", () => {
  const open = unlockedLessonIds(summaries, nothing);
  assert.deepEqual([...open], [1]);
});

test("finishing a lesson opens the next one and nothing further", () => {
  const open = unlockedLessonIds(summaries, { ...nothing, scores: { 1: 20 } });
  assert.deepEqual([...open].sort((a, b) => a - b), [1, 2]);
});

test("a lesson in progress does not open the one after it", () => {
  const open = unlockedLessonIds(summaries, { ...nothing, scores: { 1: 20 }, sessions: { 2: session(2) } });
  assert.ok(open.has(2));
  assert.ok(!open.has(3));
});

test("the whole finished run stays open, so a repeat is always possible", () => {
  const open = unlockedLessonIds(summaries, { ...nothing, scores: { 1: 20, 2: 20, 3: 20 } });
  for (const id of [1, 2, 3, 4]) assert.ok(open.has(id), `lesson ${id} should be open`);
  assert.ok(!open.has(5));
});

// The gate arrived after learners had already been roaming the course freely,
// and it must not take ground away from them.
test("a learner who skipped ahead keeps everything they reached", () => {
  const open = unlockedLessonIds(summaries, { ...nothing, scores: { 7: 30 } });
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(open.has(id), `lesson ${id} should stay open`);
  assert.ok(!open.has(9));
});

test("an unfinished lesson far ahead still counts as reached", () => {
  const open = unlockedLessonIds(summaries, { ...nothing, sessions: { 6: session(6) } });
  for (const id of [1, 2, 3, 4, 5, 6]) assert.ok(open.has(id), `lesson ${id} should stay open`);
  // Lesson six is where they stopped; seven waits until they finish it.
  assert.ok(!open.has(7));
});

test("review cards alone prove a lesson was studied", () => {
  const cards = Object.fromEntries([card(4), card(4, 1, "ru-ar")]);
  const open = unlockedLessonIds(summaries, { ...nothing, cards });
  for (const id of [1, 2, 3, 4]) assert.ok(open.has(id), `lesson ${id} should stay open`);
  assert.ok(!open.has(5));
});

test("ids need not run in a single unbroken sequence", () => {
  const sparse = [{ id: 1 }, { id: 5 }, { id: 9 }];
  const open = unlockedLessonIds(sparse, { ...nothing, scores: { 1: 10 } });
  assert.deepEqual([...open].sort((a, b) => a - b), [1, 5]);
});

// Grammar is part of the lesson, not an extra: the next lesson builds on it.
// The rule as it stands when the blocks are shown; app/features.ts decides
// whether they are, and tests/features.test.mjs covers the other position.
test("a lesson that teaches grammar is not finished until that block is done", () => {
  const teaching = [{ id: 1, grammarQuestionCount: 8 }, { id: 2 }, { id: 3 }];
  const cardsOnly = { ...nothing, scores: { 1: 26 } };
  assert.ok(!isLessonComplete(teaching[0], cardsOnly, true));
  assert.ok(!unlockedLessonIds(teaching, cardsOnly, true).has(2));

  const done = { ...nothing, scores: { 1: 26 }, grammarScores: { 1: 8 } };
  assert.ok(isLessonComplete(teaching[0], done, true));
  assert.ok(unlockedLessonIds(teaching, done, true).has(2));
});

// Walking through the block is not the same as understanding the rule.
test("the grammar block needs three quarters right to count", () => {
  assert.equal(grammarPassMark(8), 6);
  assert.equal(grammarPassMark(6), 5);
  assert.equal(grammarPassMark(4), 3);

  const teaching = [{ id: 1, grammarQuestionCount: 8 }, { id: 2 }, { id: 3 }];
  const weak = { ...nothing, scores: { 1: 26 }, grammarScores: { 1: 5 } };
  assert.ok(!isGrammarPassed(teaching[0], weak, true));
  assert.ok(!isLessonComplete(teaching[0], weak, true));
  assert.ok(!unlockedLessonIds(teaching, weak, true).has(2));

  const exact = { ...nothing, scores: { 1: 26 }, grammarScores: { 1: 6 } };
  assert.ok(isGrammarPassed(teaching[0], exact, true));
  assert.ok(unlockedLessonIds(teaching, exact, true).has(2));
});

test("a lesson without a grammar block is unaffected by the pass mark", () => {
  const plain = [{ id: 1 }, { id: 2 }];
  const done = { ...nothing, scores: { 1: 26 } };
  assert.ok(isGrammarPassed(plain[0], done));
  assert.ok(isLessonComplete(plain[0], done));
});

test("a weak attempt still never closes a lesson the learner reached", () => {
  const teaching = [{ id: 1, grammarQuestionCount: 8 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const before = { ...nothing, scores: { 1: 26, 2: 26, 3: 26 }, grammarScores: { 1: 2 } };
  const open = unlockedLessonIds(teaching, before);
  for (const id of [1, 2, 3, 4]) assert.ok(open.has(id), `lesson ${id} should stay open`);
});

test("a grammar block added later never closes a lesson the learner reached", () => {
  const teaching = [{ id: 1, grammarQuestionCount: 8 }, { id: 2 }, { id: 3 }, { id: 4 }];
  // Someone who finished the first three lessons before lesson one had grammar.
  const before = { ...nothing, scores: { 1: 26, 2: 26, 3: 26 } };
  const open = unlockedLessonIds(teaching, before);
  for (const id of [1, 2, 3, 4]) assert.ok(open.has(id), `lesson ${id} should stay open`);
});
