import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { part2VocabularyQuestions } from "../content/part2/vocabulary-questions.ts";

const directory = new URL("../content/part2/", import.meta.url);
const lessons = await Promise.all((await readdir(directory))
  .filter((file) => /^lesson-\d+\.ts$/.test(file))
  .map(async (file) => Object.values(await import(new URL(file, directory).href))[0]));

const normalize = (text) => text.replace(/[ـً-ْٰ]/g, "").replace(/[آأإٱ]/g, "ا")
  .toLowerCase().replace(/\s+/g, " ").trim();
const meanings = (text) => text.split(/[/,;]/).map(normalize).filter(Boolean);

test("every second-course word is recalled in both directions, without its context", () => {
  for (const lesson of lessons) {
    const questions = part2VocabularyQuestions(lesson);
    assert.equal(questions.length, lesson.words.length * 2, `lesson ${lesson.id}`);
    lesson.words.forEach((word, index) => {
      const [forward, reverse] = questions.slice(index * 2, index * 2 + 2);
      assert.equal(forward.prompt, word.arabic);
      assert.equal(forward.promptLang, "ar");
      assert.equal(forward.answer, word.russian);
      assert.equal(reverse.prompt, word.russian);
      assert.equal(reverse.promptLang, "ru");
      assert.equal(reverse.answer, word.arabic);
      assert.equal(forward.explanation, `${word.arabic} — ${word.russian}.`);
      assert.equal(reverse.explanation, forward.explanation);
    });
  }
});

test("all 105 lesson glossaries provide three distinct, lesson-local options in both directions", () => {
  assert.equal(lessons.length, 105);
  for (const lesson of lessons) {
    for (const question of part2VocabularyQuestions(lesson)) {
      assert.equal(question.options.length, 3, `lesson ${lesson.id}: ${question.prompt}`);
      assert.equal(new Set(question.options.map(normalize)).size, 3);
      assert.ok(question.options.includes(question.answer));
      const field = question.promptLang === "ar" ? "russian" : "arabic";
      for (const option of question.options) {
        assert.ok(lesson.words.some((word) => word[field] === option));
      }
      const correctMeanings = meanings(question.promptLang === "ar" ? question.answer : question.prompt);
      for (const option of question.options.filter((value) => value !== question.answer)) {
        const glosses = question.promptLang === "ar" ? [option]
          : lesson.words.filter((word) => word.arabic === option).map((word) => word.russian);
        for (const gloss of glosses) {
          assert.equal(meanings(gloss).some((meaning) => correctMeanings.includes(meaning)), false,
            `lesson ${lesson.id}: ${question.prompt} also accepts ${option}`);
        }
      }
    }
  }
});

test("question generation is deterministic and does not modify a lesson", () => {
  const lesson = lessons[0];
  const before = structuredClone(lesson);
  assert.deepEqual(part2VocabularyQuestions(lesson), part2VocabularyQuestions(lesson));
  assert.deepEqual(lesson, before);
});

test("synonyms and alternative glosses of the same Arabic form never become wrong answers", () => {
  const makeWord = (arabic, russian) => ({
    arabic, russian, kind: "noun", contextArabic: "unused context", contextRussian: "unused translation",
  });
  const words = [
    makeWord("كِتَابٌ", "книга"),
    makeWord("كِتَاب", "письмо"),
    makeWord("مُؤَلَّفٌ", "книга / сочинение"),
    makeWord("قَلَمٌ", "ручка"),
    makeWord("بَيْتٌ", "дом"),
    makeWord("شَجَرَةٌ", "дерево"),
  ];
  const [forward, reverse] = part2VocabularyQuestions({ words });
  assert.ok(!forward.options.includes("письмо"));
  assert.ok(!forward.options.includes("книга / сочинение"));
  assert.ok(!reverse.options.includes("مُؤَلَّفٌ"));
  assert.equal(forward.options.length, 3);
  assert.equal(reverse.options.length, 3);
});

test("empty and tiny glossaries never receive fabricated words or lose a direction", () => {
  assert.deepEqual(part2VocabularyQuestions({ words: [] }), []);
  const questions = part2VocabularyQuestions({ words: [{ arabic: "كِتَابٌ", russian: "книга", kind: "noun" }] });
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].options, ["книга"]);
  assert.deepEqual(questions[1].options, ["كِتَابٌ"]);
});
