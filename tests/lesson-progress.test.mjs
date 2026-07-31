import assert from "node:assert/strict";
import test from "node:test";

import { cardPhaseProgress } from "../app/lesson-progress.ts";

/** Decks of deliberately different sizes — the case the old formula got wrong. */
const lesson = {
  id: 1,
  arabicTitle: "",
  title: "",
  description: "",
  tags: [],
  questions: [],
  decks: [2, 8, 3].map((size) => ({
    title: "",
    words: Array.from({ length: size }, (_, index) => ({
      arabic: `a${index}`,
      russian: `r${index}`,
    })),
  })),
};

/** Every card of the lesson, in the order the learner meets them. */
function walk() {
  const steps = [];
  lesson.decks.forEach((deck, deckIndex) => {
    for (const round of [1, 2]) {
      for (let cardIndex = 0; cardIndex < deck.words.length; cardIndex += 1) {
        steps.push({ deckIndex, round, cardIndex });
      }
    }
  });
  return steps;
}

test("progress runs from zero to one across the whole lesson", () => {
  const steps = walk();
  assert.equal(cardPhaseProgress(lesson.decks, 0, 1, 0, 0), 0);
  const last = steps.at(-1);
  assert.equal(cardPhaseProgress(lesson.decks, last.deckIndex, last.round, last.cardIndex, 1), 1);
});

test("progress never goes backwards, including at deck boundaries", () => {
  let previous = -1;
  for (const step of walk()) {
    const value = cardPhaseProgress(lesson.decks, step.deckIndex, step.round, step.cardIndex, 1);
    assert.ok(
      value > previous,
      `deck ${step.deckIndex} round ${step.round} card ${step.cardIndex}: ${value} after ${previous}`,
    );
    previous = value;
  }
});

test("every card advances the bar by the same amount", () => {
  const steps = walk();
  const values = steps.map((step) =>
    cardPhaseProgress(lesson.decks, step.deckIndex, step.round, step.cardIndex, 1),
  );
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const expected = 1 / steps.length;
  for (const delta of deltas) {
    assert.ok(
      Math.abs(delta - expected) < 1e-9,
      `a card moved the bar by ${delta} instead of ${expected}`,
    );
  }
});

test("a lesson without words does not divide by zero", () => {
  assert.equal(cardPhaseProgress([], 0, 1, 0, 0), 0);
});
