import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { lessonParts } from "../content/lesson-parts.ts";

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

/** Strips the vowel marks, leaving the consonant skeleton a root shows through. */
function skeleton(text) {
  return text.replace(/[ً-ْٰـ]/g, "");
}

function arabicWords(text) {
  return skeleton(text).match(/[ء-ي]+/g) ?? [];
}

/**
 * Terms are the language the rules are written in, not vocabulary the lesson
 * teaches, so they are allowed ahead of the course. Every one of them is listed
 * here on purpose: the exception has to stay small and reviewable.
 */
const GRAMMAR_TERMS = new Set(
  ["مبتدأ", "خبر", "رفع", "و", "جملة", "اسمية", "فعلية"].map(skeleton),
);

test("the grammar block is taught as the lesson's last part", () => {
  assert.ok(withGrammar.length > 0, "expected at least one lesson with a grammar block");
  for (const lesson of withGrammar) {
    const parts = lessonParts(lesson);
    const last = parts.at(-1);
    assert.equal(last.kind, "grammar", `lesson ${lesson.id}`);
    assert.equal(last.questionEnd, lesson.grammar.questions.length, `lesson ${lesson.id}`);
    assert.equal(last.index, parts.length - 1, `lesson ${lesson.id}`);
    // Everything before it still teaches the lesson's own words.
    for (const part of parts.slice(0, -1)) assert.equal(part.kind, "cards", `lesson ${lesson.id}`);
  }
});

test("a lesson without a grammar block keeps the parts it had", () => {
  for (const lesson of lessons.filter((item) => !item.grammar)) {
    for (const part of lessonParts(lesson)) assert.equal(part.kind, "cards", `lesson ${lesson.id}`);
  }
});

test("grammar questions are answerable and unambiguous", () => {
  for (const lesson of withGrammar) {
    const { questions, rules } = lesson.grammar;
    assert.ok(questions.length >= 4, `lesson ${lesson.id} needs practice, not only theory`);
    assert.ok(rules.length > 0, `lesson ${lesson.id} needs at least one rule`);
    for (const rule of rules) {
      assert.ok(["nahw", "sarf"].includes(rule.kind), `lesson ${lesson.id}: ${rule.kind}`);
      assert.ok(rule.examples.length > 0, `lesson ${lesson.id}: ${rule.title} has no examples`);
    }
    for (const question of questions) {
      assert.ok(question.options.includes(question.answer), `lesson ${lesson.id}: ${question.prompt}`);
      assert.equal(
        new Set(question.options).size,
        question.options.length,
        `lesson ${lesson.id}: repeated option in «${question.prompt}»`,
      );
      assert.ok(question.explanation.length > 0, `lesson ${lesson.id}: ${question.prompt}`);
    }
  }
});

// The promise the block makes to the learner: it explains what they have
// already met, and never quizzes them on a word from a lesson still ahead.
test("a grammar block uses only words the learner has already met", () => {
  const seen = new Set();
  for (const lesson of lessons) {
    for (const deck of lesson.decks) {
      for (const word of deck.words) for (const part of arabicWords(word.arabic)) seen.add(part);
    }

    if (!lesson.grammar) continue;

    const used = new Set();
    for (const rule of lesson.grammar.rules) {
      for (const source of [rule.term ?? "", rule.pattern ?? "", rule.explanation]) {
        for (const word of arabicWords(source)) used.add(word);
      }
      for (const example of rule.examples) {
        for (const word of arabicWords(example.arabic)) used.add(word);
        for (const word of arabicWords(example.note ?? "")) used.add(word);
      }
    }
    for (const question of lesson.grammar.questions) {
      for (const source of [question.prompt, question.answer, question.explanation, ...question.options]) {
        for (const word of arabicWords(source)) used.add(word);
      }
    }

    // The conjunction و is a word of its own, written joined to the next one.
    const known = (word) =>
      seen.has(word) ||
      GRAMMAR_TERMS.has(word) ||
      (word.startsWith("و") && (seen.has(word.slice(1)) || GRAMMAR_TERMS.has(word.slice(1))));

    const unknown = [...used].filter((word) => !known(word));
    assert.deepEqual(unknown, [], `lesson ${lesson.id} reaches for words it has not taught`);
  }
});
