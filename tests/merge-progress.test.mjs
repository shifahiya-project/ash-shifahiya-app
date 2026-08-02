import assert from "node:assert/strict";
import test from "node:test";

import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

function card(overrides = {}) {
  return { box: 1, nextReview: "2026-01-02", lastReviewed: "2026-01-01", correct: 1, wrong: 0, ...overrides };
}

function progress(overrides = {}) {
  return normalizeProgress(overrides);
}

test("a lesson keeps its best score, whichever device holds it", () => {
  const merged = mergeProgress(
    progress({ scores: { 1: 12, 2: 30 } }),
    progress({ scores: { 1: 40, 3: 7 } }),
  );
  assert.deepEqual(merged.scores, { 1: 40, 2: 30, 3: 7 });
});

test("a card answered later wins, even when the other side is further along", () => {
  // The phone pushed the card to box 4 last week; the laptop got it wrong
  // yesterday and dropped it to 0. Yesterday is the truth.
  const phone = progress({ cards: { a: card({ box: 4, lastReviewed: "2026-01-01" }) } });
  const laptop = progress({ cards: { a: card({ box: 0, lastReviewed: "2026-01-08" }) } });
  assert.equal(mergeProgress(phone, laptop).cards.a.box, 0);
  assert.equal(mergeProgress(laptop, phone).cards.a.box, 0);
});

test("cards only one side has are kept", () => {
  const merged = mergeProgress(
    progress({ cards: { a: card() } }),
    progress({ cards: { b: card({ box: 3 }) } }),
  );
  assert.deepEqual(Object.keys(merged.cards).sort(), ["a", "b"]);
  assert.equal(merged.cards.b.box, 3);
});

test("the later save decides where an unfinished lesson stands", () => {
  const early = progress({ sessions: { 5: session({ questionIndex: 2, updatedAt: 100 }) } });
  const late = progress({ sessions: { 5: session({ questionIndex: 40, updatedAt: 200 }) } });
  assert.equal(mergeProgress(early, late).sessions[5].questionIndex, 40);
  assert.equal(mergeProgress(late, early).sessions[5].questionIndex, 40);
});

test("a session without a timestamp loses to one that has it", () => {
  const old = progress({ sessions: { 5: session({ questionIndex: 90, updatedAt: undefined }) } });
  const fresh = progress({ sessions: { 5: session({ questionIndex: 3, updatedAt: 1 }) } });
  assert.equal(mergeProgress(old, fresh).sessions[5].questionIndex, 3);
});

test("a day studied on either device counts, without duplicates", () => {
  const merged = mergeProgress(
    progress({ stats: { activeDates: ["2026-01-02", "2026-01-01"], totalSeconds: 600, masteredPhrases: ["a"] } }),
    progress({ stats: { activeDates: ["2026-01-02", "2026-01-03"], totalSeconds: 900, masteredPhrases: ["b"] } }),
  );
  assert.deepEqual(merged.stats.activeDates, ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.deepEqual(merged.stats.masteredPhrases.sort(), ["a", "b"]);
});

test("time studied is not double-counted", () => {
  // Both devices count the same session from their own clock; adding them
  // would invent an hour the learner never spent.
  const merged = mergeProgress(
    progress({ stats: { activeDates: [], totalSeconds: 3600, masteredPhrases: [] } }),
    progress({ stats: { activeDates: [], totalSeconds: 3000, masteredPhrases: [] } }),
  );
  assert.equal(merged.stats.totalSeconds, 3600);
});

test("merging is order-independent", () => {
  const a = progress({
    scores: { 1: 10, 4: 2 },
    sessions: { 5: session({ questionIndex: 2, updatedAt: 100 }) },
    cards: { x: card({ box: 2, lastReviewed: "2026-01-05" }), y: card() },
    stats: { activeDates: ["2026-01-01"], totalSeconds: 60, masteredPhrases: ["a"] },
  });
  const b = progress({
    scores: { 1: 30, 2: 5 },
    sessions: { 5: session({ questionIndex: 9, updatedAt: 300 }), 6: session({ updatedAt: 50 }) },
    cards: { x: card({ box: 5, lastReviewed: "2026-01-04" }), z: card({ box: 1 }) },
    stats: { activeDates: ["2026-01-02"], totalSeconds: 120, masteredPhrases: ["b"] },
  });
  assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a));
});

test("merging an empty side changes nothing", () => {
  const mine = progress({
    scores: { 1: 10 },
    cards: { x: card() },
    stats: { activeDates: ["2026-01-01"], totalSeconds: 60, masteredPhrases: [] },
  });
  assert.deepEqual(mergeProgress(mine, progress()), mine);
  assert.deepEqual(mergeProgress(progress(), mine), mine);
});

test("normalizeProgress fills in what an old backup lacks", () => {
  const filled = normalizeProgress({ scores: { 1: 5 } });
  assert.deepEqual(filled.cards, {});
  assert.deepEqual(filled.sessions, {});
  assert.deepEqual(filled.stats, { activeDates: [], totalSeconds: 0, masteredPhrases: [] });
  assert.deepEqual(normalizeProgress(null).scores, {});
});

function session(overrides = {}) {
  return {
    view: "practice",
    lessonId: 5,
    partIndex: 0,
    deckIndex: 0,
    round: 1,
    cardIndex: 0,
    questionIndex: 0,
    score: 0,
    mistakes: [],
    updatedAt: 1,
    ...overrides,
  };
}
