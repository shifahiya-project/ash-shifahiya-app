import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import {
  GRAMMAR_ENABLED,
  READING_ENABLED,
  hasVisibleReading,
  visibleDueReadings,
  visibleExamQuestions,
  visibleExamSummary,
  visiblePartCount,
  visibleParts,
} from "../app/features.ts";
import { isGrammarPassed, isLessonComplete, examPassMark } from "../app/lesson-access.ts";
import { lessonParts } from "../content/lesson-parts.ts";
import { lessonSummaries } from "../content/manifest.ts";
import { readingByLesson, readingSummaries } from "../content/reading-manifest.ts";
import { examSummaries } from "../content/exams.ts";
import { midtermExam } from "../content/exams/midterm.ts";
import { finalExam } from "../content/exams/final.ts";

const contentDirectory = new URL("../content/", import.meta.url);

async function loadLessons() {
  const files = (await readdir(contentDirectory))
    .filter((file) => /^lesson-\d+\.ts$/.test(file))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  return Promise.all(
    files.map(async (file) => {
      const loaded = await import(new URL(file, contentDirectory).href);
      return Object.values(loaded)[0];
    }),
  );
}

const lessons = await loadLessons();
const withGrammar = lessons.filter((lesson) => lesson.grammar);

// Hiding grammar is a switch, not a deletion: the blocks stay in the content
// whichever way the switch is thrown.
test("the grammar blocks are still in the course", () => {
  assert.ok(withGrammar.length >= 35, `only ${withGrammar.length} lessons carry a block`);
  for (const lesson of withGrammar) {
    assert.ok(lesson.grammar.rules.length > 0, `lesson ${lesson.id}`);
    assert.ok(lesson.grammar.questions.length >= 4, `lesson ${lesson.id}`);
  }
  // And the exam papers keep every grammar question they were written with.
  assert.equal(midtermExam.questions.filter((question) => question.area === "grammar").length, 20);
  assert.equal(finalExam.questions.filter((question) => question.area === "grammar").length, 36);
});

test("with grammar off a lesson ends with its own words", () => {
  for (const lesson of withGrammar) {
    const parts = lessonParts(lesson);
    assert.equal(parts.at(-1).kind, "grammar", `lesson ${lesson.id}: the block is still the last part`);
    assert.equal(visibleParts(parts, true).length, parts.length);

    const shown = visibleParts(parts, false);
    assert.equal(shown.length, parts.length - 1, `lesson ${lesson.id}`);
    assert.ok(shown.every((part) => part.kind === "cards"), `lesson ${lesson.id}`);
  }
});

test("with grammar off a lesson card claims one part fewer", () => {
  const carrying = lessonSummaries.filter((summary) => summary.grammarQuestionCount > 0);
  assert.ok(carrying.length > 0);
  for (const summary of carrying) {
    assert.equal(visiblePartCount(summary, true), summary.partCount);
    assert.equal(visiblePartCount(summary, false), summary.partCount - 1);
  }
  // A lesson without a block is untouched either way.
  for (const summary of lessonSummaries.filter((item) => item.grammarQuestionCount === 0)) {
    assert.equal(visiblePartCount(summary, false), summary.partCount);
  }
});

// Nobody may be held at a block they cannot see.
test("with grammar off a lesson is finished on its own score", () => {
  const summary = { id: 1, grammarQuestionCount: 8 };
  const started = { scores: { 1: 26 }, grammarScores: {}, sessions: {}, cards: {} };

  assert.equal(isGrammarPassed(summary, started), !GRAMMAR_ENABLED ? true : false);
  assert.equal(isLessonComplete(summary, started), !GRAMMAR_ENABLED);
  // A lesson never touched is still unfinished, switch or no switch.
  assert.equal(isLessonComplete(summary, { ...started, scores: {} }), false);
});

test("with grammar off the exams ask only about vocabulary", () => {
  for (const [id, paper] of Object.entries({ midterm: midtermExam, final: finalExam })) {
    const declared = examSummaries.find((summary) => summary.id === id);

    assert.equal(visibleExamQuestions(paper, true).length, paper.questions.length);
    assert.equal(visibleExamSummary(declared, true).questionCount, declared.questionCount);

    const served = visibleExamQuestions(paper, false);
    const shown = visibleExamSummary(declared, false);
    assert.ok(served.every((question) => question.area === "vocab"), `${id}`);
    assert.equal(served.length, declared.questionCount - declared.grammarCount, `${id}`);
    assert.equal(shown.questionCount, served.length, `${id}: the card must match the paper`);
    assert.equal(shown.grammarCount, 0);
    // Three quarters and one more answer, of the shorter paper.
    assert.equal(examPassMark(shown.questionCount), Math.ceil(served.length * 0.75) + 1);
  }
});

test("the switch is one constant, and it is off", () => {
  assert.equal(GRAMMAR_ENABLED, false);
  // Everything below reads that one value rather than deciding for itself.
  assert.equal(visibleParts(lessonParts(withGrammar[0])).length, lessonParts(withGrammar[0]).length - 1);
  assert.equal(visibleExamSummary(examSummaries[0]).grammarCount, 0);
});

test("the reading layer is hidden, and nothing of it is lost", () => {
  assert.equal(READING_ENABLED, false);

  // The texts, the manifest and the schedule all stay on disk. Hiding is a
  // decision about what the learner is shown, not about what the repository
  // keeps: the translations are being corrected, not abandoned.
  assert.equal(readingSummaries.length, 25);
  assert.ok(readingByLesson.has(36));

  // But no lesson offers its text, and nothing is ever due.
  for (const summary of lessonSummaries) {
    assert.equal(hasVisibleReading(summary.id, readingByLesson), false);
  }
  assert.deepEqual(visibleDueReadings([36, 40, 52]), []);

  // Turned back on, every one of them returns exactly where it was.
  assert.equal(hasVisibleReading(36, readingByLesson, true), true);
  assert.equal(hasVisibleReading(37, readingByLesson, true), false);
  assert.deepEqual(visibleDueReadings([36, 40, 52], true), [36, 40, 52]);
});
