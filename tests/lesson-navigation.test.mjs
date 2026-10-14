import assert from "node:assert/strict";
import test from "node:test";
import { nextPopulatedDeck } from "../app/lesson-navigation.ts";
import { lessonEightyTwo } from "../content/lesson-82.ts";
import { lessonEightySix } from "../content/lesson-86.ts";
import { expandLessonQuestions } from "../content/questions.ts";
import { lessonParts } from "../content/lesson-parts.ts";
import { questionsForSavedSession } from "../content/session-questions.ts";
import { preAuditDeckCounts, preAuditQuestionCounts } from "../content/pre-audit-question-counts.ts";

test("an old lesson 82 session reaches its second-half questions after its last populated deck", () => {
  const lesson = questionsForSavedSession(expandLessonQuestions(lessonEightyTwo),
    preAuditQuestionCounts[82], preAuditDeckCounts[82]);
  const part = lessonParts(lesson)[1];
  assert.equal(lesson.decks.length, preAuditDeckCounts[82]);
  assert.equal(lesson.questions.length, preAuditQuestionCounts[82]);
  assert.equal(lesson.decks[part.deckEnd - 1].words.length, 0);
  assert.equal(nextPopulatedDeck(lesson, 8, part.deckEnd), null);
  assert.equal(part.questionEnd - part.questionStart, 76);
  assert.ok(lesson.questions[part.questionStart]);
});

test("a fresh lesson 82 run visits its added deck before starting the expanded paper", () => {
  const lesson = expandLessonQuestions(lessonEightyTwo);
  const part = lessonParts(lesson).filter(({ kind }) => kind === "cards").at(-1);
  const addedDeck = preAuditDeckCounts[82];
  assert.ok(lesson.questions.length > preAuditQuestionCounts[82]);
  assert.equal(lesson.decks[addedDeck - 1].words.length, 0,
    "the empty original deck retains its persistent index");
  assert.ok(lesson.decks[addedDeck].words.length > 0);
  assert.ok(part.deckStart <= addedDeck && addedDeck < part.deckEnd);
  assert.equal(nextPopulatedDeck(lesson, addedDeck - 1, part.deckEnd), addedDeck,
    "fresh navigation crosses the empty old deck to the vocabulary supplement");
  assert.equal(nextPopulatedDeck(lesson, addedDeck + 1, part.deckEnd), null);
  assert.equal(part.questionEnd, lesson.questions.length);
  assert.ok(lesson.questions[part.questionStart]);
  assert.equal(lesson.questions[part.questionEnd - 1].prompt, lessonEightyTwo.questions.at(-1).prompt);
});

test("empty decks between words are skipped without changing review card addresses", () => {
  assert.equal(lessonEightySix.decks[4].words.length, 0);
  assert.equal(nextPopulatedDeck(lessonEightySix, 4, lessonEightySix.decks.length), 5);
});

test("navigation stops at the current part boundary", () => {
  assert.equal(nextPopulatedDeck(lessonEightySix, 4, 5), null);
});
