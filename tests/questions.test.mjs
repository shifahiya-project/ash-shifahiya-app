import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { buildOptions, expandLessonQuestions } from "../content/questions.ts";
import { lessonSummaries } from "../content/manifest.ts";

// The app loads lessons through a Vite glob, which Node cannot resolve, so the
// tests read the lesson files straight off disk.
async function loadLessons() {
  const directory = new URL("../content/", import.meta.url);
  const files = (await readdir(directory))
    .filter((file) => /^lesson-\d+\.ts$/.test(file))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  return Promise.all(
    files.map(async (file) => {
      const loaded = await import(new URL(file, directory).href);
      return Object.values(loaded)[0];
    }),
  );
}

const rawLessons = await loadLessons();
const expanded = rawLessons.map(expandLessonQuestions);

function wordsOf(lesson) {
  return lesson.decks.flatMap((deck) => deck.words);
}

/** Questions the generator produced, i.e. everything the author did not write. */
function generatedQuestions(lesson, source) {
  const authored = new Set(source.questions.map((question) => question.prompt));
  return lesson.questions.filter((question) => !authored.has(question.prompt));
}

test("every lesson is topped up to two questions per word", () => {
  expanded.forEach((lesson, index) => {
    const target = wordsOf(rawLessons[index]).length * 2;
    assert.equal(
      lesson.questions.length,
      Math.max(target, rawLessons[index].questions.length),
      `lesson ${lesson.id}`,
    );
    assert.match(lesson.description, new RegExp(`\\b${target} задани`), `lesson ${lesson.id}`);
    assert.match(
      lesson.description,
      new RegExp(`\\b${wordsOf(rawLessons[index]).length} форм`),
      `lesson ${lesson.id}`,
    );
  });
});

test("a description states the counts even when the source forgot them", () => {
  const lesson = expandLessonQuestions({
    id: 0,
    arabicTitle: "",
    title: "",
    description: "Все формы урока · 2 круга повторения",
    tags: [],
    decks: [{ title: "", words: [{ arabic: "ا", russian: "а" }, { arabic: "ب", russian: "б" }] }],
    questions: [],
  });
  assert.equal(lesson.description, "Все формы урока · 2 круга повторения · 4 задания");
});

test("the authored correction question stays last", () => {
  expanded.forEach((lesson, index) => {
    const authoredLast = rawLessons[index].questions.at(-1);
    assert.deepEqual(lesson.questions.at(-1), authoredLast, `lesson ${lesson.id}`);
  });
});

test("every question offers three distinct options including the answer", () => {
  for (const lesson of expanded) {
    for (const question of lesson.questions) {
      assert.equal(new Set(question.options).size, question.options.length, `lesson ${lesson.id}`);
      assert.ok(question.options.includes(question.answer), `lesson ${lesson.id}`);
      assert.ok(question.options.length >= 2, `lesson ${lesson.id}`);
    }
  }
});

test("no distractor repeats a meaning the answer already carries", () => {
  const meanings = (value) =>
    new Set(
      value
        .split(/[/,;]/)
        .map((part) => part.toLowerCase().replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );

  for (const [index, lesson] of expanded.entries()) {
    for (const question of generatedQuestions(lesson, rawLessons[index])) {
      const answerMeanings = meanings(question.answer);
      for (const option of question.options) {
        if (option === question.answer) continue;
        for (const meaning of meanings(option)) {
          assert.ok(
            !answerMeanings.has(meaning),
            `lesson ${lesson.id}: "${option}" is also a correct answer for "${question.prompt}"`,
          );
        }
      }
    }
  }
});

// The regression this suite exists for: distractors used to be the first two
// words of the lesson for every generated question, so the option list itself
// gave the answer away.
test("distractors vary across a lesson instead of repeating two words", () => {
  for (const [index, lesson] of expanded.entries()) {
    const generated = generatedQuestions(lesson, rawLessons[index]);
    if (generated.length < 8) continue;

    const distractors = new Set();
    for (const question of generated) {
      for (const option of question.options) {
        if (option !== question.answer) distractors.add(option);
      }
    }
    assert.ok(
      distractors.size >= Math.min(10, generated.length / 2),
      `lesson ${lesson.id}: only ${distractors.size} distinct distractors across ${generated.length} generated questions`,
    );
  }
});

test("no single option dominates a lesson's generated questions", () => {
  for (const [index, lesson] of expanded.entries()) {
    const generated = generatedQuestions(lesson, rawLessons[index]);
    if (generated.length < 12) continue;

    const uses = new Map();
    for (const question of generated) {
      for (const option of question.options) {
        if (option !== question.answer) uses.set(option, (uses.get(option) ?? 0) + 1);
      }
    }
    const [worst, count] = [...uses.entries()].sort((a, b) => b[1] - a[1])[0];
    assert.ok(
      count <= generated.length * 0.5,
      `lesson ${lesson.id}: "${worst}" appears in ${count} of ${generated.length} generated questions`,
    );
  }
});

// Correcting old vowel errors made six pairs of existing cards identical.
// Keep their coordinates for saved review progress; do not permit new duplicates.
test("only the preserved old cards repeat an Arabic form, with the same meaning", () => {
  const preservedPairs = new Set([
    "34:3:5:8:2", "34:4:5:7:2", "72:2:0:9:6",
    "94:2:11:5:0", "94:2:13:5:2", "94:2:14:5:3",
  ]);
  const foundPairs = new Set();
  for (const lesson of rawLessons) {
    const seen = new Map();
    lesson.decks.forEach((deck, deckIndex) => deck.words.forEach((word, wordIndex) => {
      const previous = seen.get(word.arabic);
      if (previous) {
        const key = `${lesson.id}:${previous.deckIndex}:${previous.wordIndex}:${deckIndex}:${wordIndex}`;
        assert.ok(preservedPairs.has(key), `unexpected repeated card ${key}: ${word.arabic}`);
        assert.equal(word.russian, previous.word.russian, `ambiguous repeated card ${key}`);
        foundPairs.add(key);
      } else {
        seen.set(word.arabic, { word, deckIndex, wordIndex });
      }
    }));
  }
  assert.deepEqual(foundPairs, preservedPairs);
});

test("Arabic synonyms cannot become wrong answers for their shared Russian meaning", () => {
  const lesson = expandLessonQuestions({
    id: 0, title: "", arabicTitle: "", description: "", tags: [], questions: [],
    decks: [{ title: "", words: [
      { arabic: "ذَلِكَ", russian: "тот" },
      { arabic: "ذَاكَ", russian: "тот" },
      { arabic: "هَذَا", russian: "этот" },
      { arabic: "تِلْكَ", russian: "та" },
    ] }],
  });
  for (const question of lesson.questions.filter((q) => q.promptLang === "ru" && q.prompt === "тот")) {
    assert.equal(question.options.length, 3);
    for (const alternative of ["ذَلِكَ", "ذَاكَ"]) {
      if (alternative !== question.answer) assert.ok(!question.options.includes(alternative));
    }
  }
});

test("no generated Russian prompt offers an Arabic synonym as a wrong answer", () => {
  const glosses = (value) => value.split(/[/,;]/).map((s) => s.toLowerCase().replace(/\s+/g, " ").trim());
  for (const [index, lesson] of expanded.entries()) {
    const words = wordsOf(rawLessons[index]);
    for (const q of generatedQuestions(lesson, rawLessons[index]).filter((q) => q.promptLang === "ru")) {
      const wanted = glosses(q.prompt);
      for (const option of q.options.filter((value) => value !== q.answer)) {
        for (const word of words.filter((word) => word.arabic === option)) {
          assert.ok(!glosses(word.russian).some((meaning) => wanted.includes(meaning)),
            `lesson ${lesson.id}: ${option} also translates ${q.prompt}`);
        }
      }
    }
  }
});

// A stray character from another script in a gloss is invisible in review but
// reaches the learner as the answer to a card.
test("glosses are Russian, Arabic is Arabic", () => {
  const RUSSIAN_GLOSS = /^[Ѐ-ӿ\s\d.,()/«»—–\-:;!?"'ʼ]+$/;
  const ARABIC_FORM = /^[؀-ۿ\s.,()/؟،:—\-]+$/;
  for (const lesson of rawLessons) {
    for (const word of wordsOf(lesson)) {
      assert.match(word.russian, RUSSIAN_GLOSS, `lesson ${lesson.id}: gloss "${word.russian}"`);
      assert.match(word.arabic, ARABIC_FORM, `lesson ${lesson.id}: form "${word.arabic}"`);
    }
  }
});

// content/manifest.ts is generated; a stale one would show wrong counts on the
// home screen while the lesson itself is right.
test("the manifest matches the lessons", () => {
  assert.equal(lessonSummaries.length, expanded.length);
  expanded.forEach((lesson, index) => {
    const summary = lessonSummaries[index];
    assert.deepEqual(
      {
        id: summary.id,
        arabicTitle: summary.arabicTitle,
        title: summary.title,
        description: summary.description,
        tags: summary.tags,
        questionCount: summary.questionCount,
      },
      {
        id: lesson.id,
        arabicTitle: lesson.arabicTitle,
        title: lesson.title,
        description: lesson.description,
        tags: lesson.tags,
        questionCount: lesson.questions.length,
      },
      `lesson ${lesson.id}: run npm run content:manifest`,
    );
  });
});

test("generation is deterministic", () => {
  const again = rawLessons.map(expandLessonQuestions);
  assert.deepEqual(again, expanded);
});

test("buildOptions prefers candidates from the answer's own deck", () => {
  const candidates = [
    { value: "родной", deckIndex: 0 },
    { value: "чужой", deckIndex: 0 },
    { value: "далёкий", deckIndex: 0 },
    { value: "стол", deckIndex: 1 },
    { value: "стул", deckIndex: 1 },
    { value: "окно", deckIndex: 1 },
  ];
  const options = buildOptions("близкий", candidates, 0);
  assert.equal(options[0], "близкий");
  assert.equal(options.length, 3);
  for (const option of options.slice(1)) {
    assert.ok(
      ["родной", "чужой", "далёкий"].includes(option),
      `expected a deck-0 distractor, got "${option}"`,
    );
  }
});

test("buildOptions falls back to other decks when its own deck is too small", () => {
  const candidates = [
    { value: "один", deckIndex: 0 },
    { value: "два", deckIndex: 1 },
    { value: "три", deckIndex: 1 },
    { value: "четыре", deckIndex: 1 },
  ];
  const options = buildOptions("ноль", candidates, 0);
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
});
