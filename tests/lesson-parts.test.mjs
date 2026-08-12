import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { expandLessonQuestions } from "../content/questions.ts";
import { PART_THRESHOLD, lessonParts } from "../content/lesson-parts.ts";

async function loadLessons() {
  const directory = new URL("../content/", import.meta.url);
  const files = (await readdir(directory))
    .filter((file) => /^lesson-\d+\.ts$/.test(file))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  return Promise.all(
    files.map(async (file) => {
      const loaded = await import(new URL(file, directory).href);
      return expandLessonQuestions(Object.values(loaded)[0]);
    }),
  );
}

const lessons = await loadLessons();

function lessonOf(decks, questions) {
  return {
    id: 1,
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
  };
}

test("a lesson at or under the threshold stays whole", () => {
  const parts = lessonParts(lessonOf([10, 10, 10], PART_THRESHOLD));
  assert.equal(parts.length, 1);
  assert.equal(parts[0].deckEnd, 3);
  assert.equal(parts[0].questionEnd, PART_THRESHOLD);
});

test("a longer lesson is cut in two", () => {
  const parts = lessonParts(lessonOf([10, 10, 10], PART_THRESHOLD + 1));
  assert.equal(parts.length, 2);
});

test("the cut falls on the deck boundary nearest the middle", () => {
  // 3 + 4 + 5 words → 6 + 8 + 10 cards. Half of 24 is 12: cutting after the
  // first deck leaves 6, after the second leaves 14, so the second wins.
  const parts = lessonParts(lessonOf([3, 4, 5], 200));
  assert.equal(parts[0].deckStart, 0);
  assert.equal(parts[0].deckEnd, 2);
  assert.equal(parts[1].deckStart, 2);
  assert.equal(parts[1].deckEnd, 3);
});

// The invariants below are about the cards pass. A grammar part carries no
// decks and indexes its own questions, so it is looked at separately.
const cardsParts = (lesson) => lessonParts(lesson).filter((part) => part.kind === "cards");

test("parts cover every deck and every question exactly once", () => {
  for (const lesson of lessons) {
    const parts = cardsParts(lesson);
    assert.equal(parts[0].deckStart, 0, `lesson ${lesson.id}`);
    assert.equal(parts[0].questionStart, 0, `lesson ${lesson.id}`);
    assert.equal(parts.at(-1).deckEnd, lesson.decks.length, `lesson ${lesson.id}`);
    assert.equal(parts.at(-1).questionEnd, lesson.questions.length, `lesson ${lesson.id}`);
    parts.slice(1).forEach((part, index) => {
      assert.equal(part.deckStart, parts[index].deckEnd, `lesson ${lesson.id}: deck gap`);
      assert.equal(part.questionStart, parts[index].questionEnd, `lesson ${lesson.id}: question gap`);
    });
  }
});

test("no part is empty and none exceeds the threshold on its own", () => {
  for (const lesson of lessons) {
    for (const part of cardsParts(lesson)) {
      assert.ok(part.deckEnd > part.deckStart, `lesson ${lesson.id}: empty deck range`);
      assert.ok(part.questionEnd > part.questionStart, `lesson ${lesson.id}: empty question range`);
      assert.ok(
        part.questionEnd - part.questionStart <= PART_THRESHOLD,
        `lesson ${lesson.id} part ${part.index + 1}: ${part.questionEnd - part.questionStart} questions`,
      );
    }
  }
});

test("the closing correction question stays in the last part", () => {
  for (const lesson of lessons) {
    assert.equal(cardsParts(lesson).at(-1).questionEnd, lesson.questions.length, `lesson ${lesson.id}`);
  }
});

test("every lesson over the threshold is split, and no other is", () => {
  for (const lesson of lessons) {
    const expected = lesson.questions.length > PART_THRESHOLD && lesson.decks.length >= 2 ? 2 : 1;
    assert.equal(cardsParts(lesson).length, expected, `lesson ${lesson.id}`);
  }
});

test("the grammar block adds one part on top of the cards", () => {
  for (const lesson of lessons) {
    const parts = lessonParts(lesson);
    assert.equal(parts.length, cardsParts(lesson).length + (lesson.grammar ? 1 : 0), `lesson ${lesson.id}`);
    parts.forEach((part, index) => assert.equal(part.index, index, `lesson ${lesson.id}: index`));
  }
});
