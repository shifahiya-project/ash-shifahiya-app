import assert from "node:assert/strict";
import test from "node:test";
import { nextPopulatedDeck } from "../app/lesson-navigation.ts";
import { lessonEightyTwo } from "../content/lesson-82.ts";
import { lessonEightySix } from "../content/lesson-86.ts";
import { expandLessonQuestions } from "../content/questions.ts";
import { lessonParts } from "../content/lesson-parts.ts";

test("lesson 82 reaches its second-half questions after its last populated deck", () => {
  const lesson = expandLessonQuestions(lessonEightyTwo);
  const part = lessonParts(lesson)[1];
  assert.equal(lesson.decks[part.deckEnd - 1].words.length, 0);
  assert.equal(nextPopulatedDeck(lesson, 8, part.deckEnd), null);
  assert.equal(part.questionEnd - part.questionStart, 76);
  assert.ok(lesson.questions[part.questionStart]);
});

test("empty decks between words are skipped without changing review card addresses", () => {
  assert.equal(lessonEightySix.decks[4].words.length, 0);
  assert.equal(nextPopulatedDeck(lessonEightySix, 4, lessonEightySix.decks.length), 5);
});

test("navigation stops at the current part boundary", () => {
  assert.equal(nextPopulatedDeck(lessonEightySix, 4, 5), null);
});
