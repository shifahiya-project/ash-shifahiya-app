import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { examSummaries } from "../content/exams.ts";
import { midtermExam } from "../content/exams/midterm.ts";
import { finalExam } from "../content/exams/final.ts";
import { examPassMark, examReadiness, isExamPassed } from "../app/lesson-access.ts";
import { lessonSummaries } from "../content/manifest.ts";

const contentDirectory = new URL("../content/", import.meta.url);
const papers = { midterm: midtermExam, final: finalExam };

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

function skeleton(text) {
  return text.replace(/[ً-ْٰـ]/g, "");
}

function arabicWords(text) {
  return skeleton(text).match(/[ء-ي]+/g) ?? [];
}

/** Grammar names the paper may use even though no lesson teaches them as words. */
const ALLOWED = new Set(
  [
    "فاعل", "مفعول", "فعال", "به", "مبتدأ", "خبر", "رفع", "نصب", "جر", "وزن",
    "نعت", "إضافة", "معرفة", "نكرة", "وحدة", "ف", "ع", "ل", "ال", "و",
  ].map(skeleton),
);

test("each paper is the size it declares", () => {
  for (const summary of examSummaries) {
    const exam = papers[summary.id];
    assert.ok(exam, `no paper for ${summary.id}`);
    assert.equal(exam.id, summary.id);
    assert.equal(exam.afterLesson, summary.afterLesson);
    assert.equal(exam.questions.length, summary.questionCount, `${summary.id}: question count`);
    const grammar = exam.questions.filter((question) => question.area === "grammar");
    assert.equal(grammar.length, summary.grammarCount, `${summary.id}: grammar count`);
  }
});

// The shape the exams were asked for: a hundred questions with twenty on
// grammar, and a hundred and fifty where grammar stays within a quarter.
test("grammar keeps to its share", () => {
  assert.equal(midtermExam.questions.length, 100);
  assert.equal(midtermExam.questions.filter((q) => q.area === "grammar").length, 20);

  assert.equal(finalExam.questions.length, 150);
  const finalGrammar = finalExam.questions.filter((q) => q.area === "grammar").length;
  assert.ok(finalGrammar > 0, "the final paper needs grammar too");
  assert.ok(
    finalGrammar <= finalExam.questions.length * 0.25,
    `grammar is ${finalGrammar} of ${finalExam.questions.length}, over a quarter`,
  );
});

test("the pass mark is three quarters and one answer more", () => {
  assert.equal(examPassMark(100), 76);
  assert.equal(examPassMark(150), 114);
  const [midterm] = examSummaries;
  assert.equal(isExamPassed(midterm, 75), false);
  assert.equal(isExamPassed(midterm, 76), true);
  assert.equal(isExamPassed(midterm, undefined), false);
});

test("every question is answerable and asked once", () => {
  for (const exam of Object.values(papers)) {
    const prompts = new Set();
    for (const question of exam.questions) {
      assert.ok(question.options.includes(question.answer), `${exam.id}: «${question.prompt}»`);
      assert.equal(
        new Set(question.options).size,
        question.options.length,
        `${exam.id}: repeated option in «${question.prompt}»`,
      );
      assert.ok(question.options.length >= 3, `${exam.id}: «${question.prompt}» needs more options`);
      assert.ok(question.explanation.length > 0, `${exam.id}: «${question.prompt}» has no explanation`);
      assert.ok(["ar", "ru"].includes(question.promptLang));
      assert.ok(!prompts.has(question.prompt), `${exam.id}: «${question.prompt}» is asked twice`);
      prompts.add(question.prompt);
    }
  }
});

// The paper may only ask about what the course has taught by that point.
test("no paper reaches past its own half of the course", () => {
  const strip = (word) => {
    const withoutConjunction = word.startsWith("و") ? word.slice(1) : word;
    return withoutConjunction.startsWith("ال") ? withoutConjunction.slice(2) : withoutConjunction;
  };

  for (const exam of Object.values(papers)) {
    const words = new Set();
    // A word is stored both as written and without its article, so that a
    // lesson teaching الْخَمِيسِ answers for خَمِيسٌ as well.
    const seen = { add: (word) => { words.add(word); words.add(strip(word)); }, has: (word) => words.has(word) };
    for (const lesson of lessons.filter((item) => item.id <= exam.afterLesson)) {
      for (const deck of lesson.decks) {
        for (const word of deck.words) for (const part of arabicWords(word.arabic)) seen.add(part);
      }
      for (const question of lesson.questions) {
        for (const source of [question.prompt, question.answer, ...question.options]) {
          for (const word of arabicWords(source)) seen.add(word);
        }
      }
      for (const rule of lesson.grammar?.rules ?? []) {
        for (const source of [rule.term ?? "", rule.pattern ?? "", rule.explanation, rule.title]) {
          for (const word of arabicWords(source)) seen.add(word);
        }
        for (const example of rule.examples) for (const word of arabicWords(example.arabic)) seen.add(word);
      }
      for (const question of lesson.grammar?.questions ?? []) {
        for (const source of [question.prompt, question.answer, question.explanation, ...question.options]) {
          for (const word of arabicWords(source)) seen.add(word);
        }
      }
    }

    const known = (word) =>
      word.length === 1 || [word, strip(word)].some((form) => seen.has(form) || ALLOWED.has(form));

    const used = new Set();
    for (const question of exam.questions) {
      for (const source of [question.prompt, question.answer, question.explanation, ...question.options]) {
        for (const word of arabicWords(source)) used.add(word);
      }
    }
    assert.deepEqual([...used].filter((word) => !known(word)), [], `${exam.id} asks about untaught words`);
  }
});

// What the exams are for: recognising the language in use. A lone pronoun or a
// bare possessive ending is not a question — those belong inside constructions.
test("nothing is asked that is too small to be a question", () => {
  const TRIVIAL = new Set(
    [
      "هو", "هي", "هم", "هن", "أنت", "أنتم", "أنتن", "أنا", "نحن", "أنتما", "هما",
      "ه", "ها", "هما", "هم", "كم", "ك", "ي", "نا",
    ].map(skeleton),
  );
  const TRIVIAL_RU = new Set([
    "он", "она", "они", "ты", "вы", "я", "мы", "его", "её", "их", "твой", "мой", "наш", "ваш",
  ]);

  for (const exam of Object.values(papers)) {
    for (const question of exam.questions) {
      const arabic = question.promptLang === "ar" ? question.prompt : question.answer;
      const russian = question.promptLang === "ar" ? question.answer : question.prompt;
      const words = arabicWords(arabic);
      assert.ok(
        !(words.length === 1 && TRIVIAL.has(words[0])),
        `${exam.id}: «${question.prompt}» asks about a bare pronoun`,
      );
      assert.ok(
        !TRIVIAL_RU.has(russian.trim().toLowerCase().replace(/[.!?]$/, "")),
        `${exam.id}: «${question.prompt}» asks about a bare pronoun`,
      );
    }
  }
});

// Words alone would make a thin paper: the course teaches phrases and whole
// sentences, and that is what the exam mostly asks about.
test("vocabulary is mostly expressions, not single words", () => {
  for (const exam of Object.values(papers)) {
    const vocab = exam.questions.filter((question) => question.area === "vocab");
    const expressions = vocab.filter((question) => {
      const arabic = question.promptLang === "ar" ? question.prompt : question.answer;
      return arabic.trim().split(/\s+/).length > 1;
    });
    assert.ok(
      expressions.length >= vocab.length * 0.7,
      `${exam.id}: only ${expressions.length} of ${vocab.length} vocabulary questions are expressions`,
    );
  }
});

test("no word mixes Arabic and Cyrillic letters", () => {
  for (const exam of Object.values(papers)) {
    for (const question of exam.questions) {
      for (const source of [question.prompt, question.answer, question.explanation, ...question.options]) {
        for (const word of source.match(/[\p{L}؀-ۿ]+/gu) ?? []) {
          assert.ok(
            !(/[؀-ۿ]/.test(word) && /[Ѐ-ӿ]/.test(word)),
            `${exam.id}: «${word}» mixes scripts inside one word`,
          );
        }
      }
    }
  }
});

test("an exam opens only when the lessons behind it are finished", () => {
  const [midterm] = examSummaries;
  const complete = (upTo) => ({
    scores: Object.fromEntries(lessonSummaries.filter((s) => s.id <= upTo).map((s) => [s.id, s.questionCount])),
    grammarScores: Object.fromEntries(
      lessonSummaries
        .filter((s) => s.id <= upTo && s.grammarQuestionCount > 0)
        .map((s) => [s.id, s.grammarQuestionCount]),
    ),
    sessions: {},
    cards: {},
  });

  assert.equal(examReadiness(midterm, lessonSummaries, complete(49)).open, false);
  const ready = examReadiness(midterm, lessonSummaries, complete(50));
  assert.equal(ready.open, true);
  assert.equal(ready.total, 50);
  assert.equal(ready.done, 50);

  // A lesson whose grammar block is still owed does not count as finished.
  const withGrammarLeft = complete(50);
  const grammarLesson = lessonSummaries.find((s) => s.id <= 50 && s.grammarQuestionCount > 0);
  delete withGrammarLeft.grammarScores[grammarLesson.id];
  assert.equal(examReadiness(midterm, lessonSummaries, withGrammarLeft).open, false);
});
