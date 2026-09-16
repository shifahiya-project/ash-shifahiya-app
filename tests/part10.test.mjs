import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { textCourseNeedsMetWords, textCourseQuestions } from "../content/text-course-questions.ts";
import { part10Summaries } from "../content/part10/manifest.ts";
import { part10Glossary } from "../content/part10/glossary.ts";
import { isPart10Open, part10CardId, part10LessonIdsInCards, unlockedPart10Ids } from "../app/part10-access.ts";

const directory = new URL("../content/part10/", import.meta.url);

async function loadLessons() {
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

const lessons = await loadLessons();

function skeleton(text) {
  return text.replace(/[ً-ْٰـ]/g, "").replace(/[^ء-ي]/g, "");
}

/** The words of every lesson before this one, as the app hands them over. */
function metBefore(lesson) {
  return textCourseNeedsMetWords(lesson)
    ? part10Glossary.filter((entry) => entry.lesson < lesson.id)
    : [];
}

test("every lesson carries a text, and its words when it brings any", () => {
  assert.ok(lessons.length > 0);
  for (const lesson of lessons) {
    assert.ok(lesson.fragments.length > 0, `урок ${lesson.id}: нет текста`);
    assert.ok(lesson.title.length > 0, `урок ${lesson.id}: без названия`);
    assert.ok(lesson.book.length > 0, `урок ${lesson.id}: не указана книга`);
    assert.ok(lesson.section === undefined || lesson.section.length > 0, `урок ${lesson.id}: пустой раздел`);
    assert.ok(lesson.chapter === undefined || lesson.chapter.length > 0, `урок ${lesson.id}: пустая глава`);
    assert.match(lesson.arabicTitle, /[ء-ي]/, `урок ${lesson.id}: без арабского названия`);

    for (const line of lesson.fragments) {
      assert.match(line.arabic, /[ء-ي]/, `урок ${lesson.id}: фрагмент без арабского`);
      assert.match(line.russian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: фрагмент без перевода`);
    }
  }
});

// Unlike most of the courses before it, every lesson of this book brings
// something new: the مَتْن is short and each hadith carries its own words. The
// rule that a lesson may bring nothing is still the course's own — it is
// checked where such lessons exist.
test("every lesson of this book brings words of its own", () => {
  for (const lesson of lessons) {
    assert.ok(lesson.words.length > 0, `урок ${lesson.id}: нет слов`);
  }
});

// Each book is imported on its own and numbered after the one before it. A
// learner's progress is stored under the lesson number, so a book has to hold
// one unbroken run of them, the numbering itself must have no gaps, and a
// كِتَاب must not be torn into pieces either.
test("the books lie one after another, numbered without gaps", () => {
  lessons.forEach((lesson, index) => {
    assert.equal(lesson.id, index + 1, `урок на месте ${index + 1} имеет номер ${lesson.id}`);
  });

  const shelf = [];
  for (const lesson of lessons) if (shelf.at(-1) !== lesson.book) shelf.push(lesson.book);
  assert.equal(new Set(shelf).size, shelf.length, `книга разорвана на куски: ${shelf.join(" · ")}`);

  // A section heads a run of the list, so it has to be one unbroken run — but
  // two books of one course may divide themselves into parts of the same name
  // («Виды сообщения» in one, «Виды сообщений» in the other are near enough to
  // collide one day), so the run is keyed by the book as well. A chapter heads
  // nothing and may come round again, so nothing is asserted of it.
  const chapters = [];
  for (const lesson of lessons) {
    const named = `${lesson.book} · ${lesson.section ?? "—"}`;
    if (chapters.at(-1) !== named) chapters.push(named);
  }
  assert.equal(new Set(chapters).size, chapters.length, `раздел разорван: ${chapters.join(" · ")}`);
});

test("every word carries its meaning and a kind the course knows", () => {
  const kinds = new Set([
    "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
  ]);
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      assert.match(word.arabic, /[ء-ي]/, `урок ${lesson.id}: ${word.russian}`);
      assert.match(word.russian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: ${word.arabic}`);
      assert.ok(kinds.has(word.kind), `урок ${lesson.id}: неизвестный тип ${word.kind}`);
    }
  }
});

test("a word is asked by its meaning, and the text is never cut up for a gap", () => {
  for (const lesson of lessons) {
    const questions = textCourseQuestions(lesson, metBefore(lesson));
    assert.equal(questions.length, lesson.words.length, `урок ${lesson.id}`);

    questions.forEach((question, index) => {
      const word = lesson.words[index];
      assert.equal(question.prompt, word.arabic, `урок ${lesson.id}: спрошено не слово урока`);
      assert.equal(question.promptLang, "ar");
      assert.equal(question.answer, word.russian, `урок ${lesson.id}: ${word.arabic}`);
    });
  }
});

// Fourteen lessons of this course bring one or two words, and out of those
// alone a question could offer no choice at all. The wrong answers then come
// from the words already met — never from the ones ahead.
test("a question always offers three answers, even in a lesson of one word", () => {
  for (const lesson of lessons) {
    const met = metBefore(lesson);
    // Everything a wrong answer is allowed to be: a meaning from this lesson,
    // or one the learner has already been taught.
    const allowed = new Set([
      ...lesson.words.map((word) => word.russian),
      ...met.map((word) => word.russian),
    ]);

    for (const question of textCourseQuestions(lesson, met)) {
      assert.equal(question.options.length, 3, `урок ${lesson.id}: «${question.prompt}»`);
      assert.equal(
        new Set(question.options).size,
        3,
        `урок ${lesson.id}: повтор варианта в «${question.prompt}»`,
      );
      assert.ok(question.options.includes(question.answer), `урок ${lesson.id}: «${question.prompt}»`);
      assert.ok(question.explanation.length > 0, `урок ${lesson.id}: «${question.prompt}» без разбора`);

      for (const option of question.options) {
        assert.ok(
          allowed.has(option),
          `урок ${lesson.id}: вариант «${option}» не из пройденного`,
        );
      }

      // An option differing from the answer only in vowel marks is a second
      // right answer. Only an Arabic option can be that: a Russian gloss may
      // quote an Arabic particle — «соединение предложений союзом وَ» against
      // «отказ от соединения предложений союзом وَ» — and the two are opposite
      // in meaning however alike their Arabic looks.
      const wrong = question.options.filter((option) => option !== question.answer);
      for (const option of wrong) {
        if (!/[ء-ي]/.test(option) || /[а-яА-ЯёЁ]/.test(option)) continue;
        assert.notEqual(
          skeleton(option),
          skeleton(question.answer),
          `урок ${lesson.id}: «${option}» неотличим от ответа`,
        );
      }
    }
  }
});

test("the same paper comes out every time", () => {
  for (const lesson of lessons) {
    const met = metBefore(lesson);
    assert.deepEqual(
      textCourseQuestions(lesson, met),
      textCourseQuestions(lesson, met),
      `урок ${lesson.id}`,
    );
  }
});

test("the manifest agrees with the lessons", () => {
  assert.equal(part10Summaries.length, lessons.length);
  for (const lesson of lessons) {
    const summary = part10Summaries.find((item) => item.id === lesson.id);
    assert.ok(summary, `урок ${lesson.id} отсутствует в манифесте`);
    assert.equal(summary.title, lesson.title);
    assert.equal(summary.arabicTitle, lesson.arabicTitle);
    assert.equal(summary.book, lesson.book);
    assert.equal(summary.section, lesson.section);
    assert.equal(summary.chapter, lesson.chapter);
    assert.equal(summary.wordCount, lesson.words.length);
    assert.equal(summary.fragmentCount, lesson.fragments.length);
  }
});

test("the glossary holds the whole course in lesson order", () => {
  const words = lessons.flatMap((lesson) =>
    lesson.words.map((word) => ({ lesson: lesson.id, ...word })),
  );
  assert.deepEqual(part10Glossary, words);
});

// The tenth course waits for the whole ninth one — the chain every course
// here follows. The Forty Hadith come last of the reading: the nine courses
// before them teach the language and the sciences that weigh a report, and this
// is the مَتْن those sciences are about.
test("the tenth course waits for the whole ninth one", () => {
  const shelf = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(isPart10Open(shelf, {}), false);
  assert.equal(isPart10Open(shelf, { 1: 30, 2: 20 }), false);
  assert.equal(isPart10Open(shelf, { 1: 30, 2: 20, 3: 10 }), true);
  // An empty shelf is not "finished" — the course would then open by itself.
  assert.equal(isPart10Open([], {}), false);
});

test("the tenth course runs in order and never takes ground back", () => {
  const empty = { part10Scores: {}, part10Sessions: {}, cards: {} };
  assert.equal(unlockedPart10Ids(part10Summaries, empty, false).size, 0);

  const opened = unlockedPart10Ids(part10Summaries, empty, true);
  assert.equal(opened.has(1), true, "первый урок должен открыться");
  assert.equal(opened.has(2), false, "второй ждёт первого");

  const oneDone = { ...empty, part10Scores: { 1: 29 } };
  const next = unlockedPart10Ids(part10Summaries, oneDone, true);
  assert.equal(next.has(2), true);
  assert.equal(next.has(3), false);

  const roaming = { ...empty, cards: { [part10CardId(5, 0, "ar-ru")]: {} } };
  const kept = unlockedPart10Ids(part10Summaries, roaming, true);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(kept.has(id), true, `урок ${id} закрылся`);
});

test("a tenth-course card says which lesson it came from", () => {
  assert.equal(part10CardId(7, 12, "ru-ar"), "p10-lesson-7-word-12-ru-ar");
  const cards = {
    "p10-lesson-3-word-0-ar-ru": {},
    "p10-lesson-9-word-4-ru-ar": {},
    // The nine courses before this one share the box and do not belong here.
    // The two-digit prefix is new, so the neighbours it could be confused with
    // are named in full: none of them is a prefix of «p10».
    "p9-lesson-3-word-0-ar-ru": {},
    "p8-lesson-3-word-0-ar-ru": {},
    "p7-lesson-3-word-0-ar-ru": {},
    "p6-lesson-3-word-0-ar-ru": {},
    "p5-lesson-3-word-0-ar-ru": {},
    "p4-lesson-3-word-0-ar-ru": {},
    "p3-lesson-3-word-0-ar-ru": {},
    "p2-lesson-3-word-0-ar-ru": {},
    "lesson-3-deck-0-word-0-ar-ru": {},
  };
  assert.deepEqual(part10LessonIdsInCards(cards).sort((a, b) => a - b), [3, 9]);
});

// «p10» is the first two-digit prefix in the box, and a card of it must not be
// read as a card of any single-digit course — nor the other way round. Nothing
// in the matcher is loose today, and this is what keeps it so.
test("a two-digit prefix is not confused with a one-digit one", async () => {
  const matchers = await Promise.all(
    [3, 4, 5, 6, 7, 8, 9].map(async (n) => {
      const mod = await import(`../app/part${n}-access.ts`);
      return [n, mod[`part${n}LessonIdsInCards`]];
    }),
  );

  const tenth = { [part10CardId(7, 0, "ar-ru")]: {} };
  for (const [n, of] of matchers) {
    assert.deepEqual(of(tenth), [], `часть ${n} приняла карточку десятой за свою`);
  }

  for (const [n, of] of matchers) {
    const theirs = { [`p${n}-lesson-7-word-0-ar-ru`]: {} };
    assert.deepEqual(of(theirs), [7], `часть ${n} не узнала свою карточку`);
    assert.deepEqual(part10LessonIdsInCards(theirs), [], `десятая приняла карточку части ${n} за свою`);
  }
});

// A teaching course gives its Arabic fully vowelled. Here the vowels came from
// the export, so they are checked by machine rather than by eye — and here that
// mattered: the book first arrived at 83%, with the function words bare, and was
// sent back. The corrected export is at a hundred percent, every word of every
// lesson, and the bar stays where the courses before it hold it.
//
// A single-letter token carries no vowels anywhere, so it is not counted as a
// word — the same rule the fifth course needed.
const VOWELLED_SHARE = 0.85;
// The longest fragment of this book is 40 words: a hadith is a saying, and the
// commentary explains it a clause at a time. Much beyond a paragraph is read as
// a page instead.
const MAX_FRAGMENT_WORDS = 180;

/** True where a line holds a word long enough to be vowelled at all. */
const hasWords = (arabic) =>
  arabic.split(/\s+/).some((token) => token.replace(/[^ء-ي]/g, "").length >= 2);

test("the Arabic of the course is vowelled", () => {
  const harakat = /[ً-ْ]/;
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      assert.match(word.arabic, harakat, `урок ${lesson.id}: ${word.arabic} без огласовок`);
    }
    for (const line of lesson.fragments) {
      if (!hasWords(line.arabic)) continue;
      assert.match(line.arabic, harakat, `урок ${lesson.id}: фрагмент без огласовок`);
    }

    // The tatweel «ـ» that separates an example's number from its text is a
    // stroke of the pen, not a word, and single-letter list labels carry no
    // vowels anywhere: neither belongs in the count.
    const words = lesson.fragments.flatMap((line) =>
      line.arabic
        .split(/\s+/)
        .filter((token) => token.replace(/[^ء-ي]/g, "").replace(/ـ/g, "").length >= 2),
    );
    const vowelled = words.filter((token) => harakat.test(token)).length;
    assert.ok(
      vowelled / words.length >= VOWELLED_SHARE,
      `урок ${lesson.id}: огласовано ${Math.round((vowelled / words.length) * 100)}% слов текста`,
    );
  }
});

test("a fragment stays a paragraph, not a page", () => {
  for (const lesson of lessons) {
    for (const line of lesson.fragments) {
      const words = line.arabic.split(/\s+/).filter((token) => /[ء-ي]/.test(token)).length;
      assert.ok(
        words <= MAX_FRAGMENT_WORDS,
        `урок ${lesson.id}: фрагмент в ${words} слов — это уже страница`,
      );
    }
  }
});

// The book prints headings inside a lesson. They are kept as headings — read
// differently, and set apart on screen — rather than passed off as sentences of
// the argument, which is what dropping the mark would do.
test("a heading inside a lesson stays a heading", async () => {
  const headings = lessons.flatMap((lesson) => lesson.fragments.filter((line) => line.heading));
  assert.ok(headings.length > 0, "в этой книге заголовки внутри уроков есть");
  for (const line of headings) {
    assert.equal(line.heading, true);
    assert.match(line.arabic, /[ء-ي]/);
    assert.match(line.russian, /[а-яА-ЯёЁ]/);
  }

  // And the reading screen does something with the mark, rather than storing it.
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /line\.heading \? "is-heading"/);
});

// The tenth course's progress travels between devices and is stored under
// keys of its own; otherwise a merge or a backup would drop it in silence.
test("the tenth course is carried by the store, the merge and the backup", async () => {
  const store = await readFile(new URL("../app/progress-store.ts", import.meta.url), "utf8");
  const merge = await readFile(new URL("../app/merge-progress.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(store, /shifahiya-p10-lesson-\$\{id\}/);
  assert.match(store, /shifahiya-p10-session-\$\{id\}/);
  assert.match(store, /finishPart10Lesson/);
  assert.match(merge, /part10Scores: mergeScores/);
  assert.match(merge, /part10Sessions: mergeReadingSessions/);
  assert.match(page, /part10Scores: payload\.part10Scores \?\? \{\}/);
});
