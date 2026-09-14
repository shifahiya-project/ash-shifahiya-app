import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { textCourseNeedsMetWords, textCourseQuestions } from "../content/text-course-questions.ts";
import { part8Summaries } from "../content/part8/manifest.ts";
import { part8Glossary } from "../content/part8/glossary.ts";
import { isPart8Open, part8CardId, part8LessonIdsInCards, unlockedPart8Ids } from "../app/part8-access.ts";

const directory = new URL("../content/part8/", import.meta.url);

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
    ? part8Glossary.filter((entry) => entry.lesson < lesson.id)
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

// The glossary of this course is cumulative against all seven courses before
// it, so a lesson deep into the book can meet nothing new. Such a lesson is its
// text and is read, not drilled — and that is normal, not a hole in the data.
// Four here bring none: no cards, no questions, and the lesson opens on reading.
test("a lesson may bring no new words, and it is then all text", () => {
  const wordless = lessons.filter((lesson) => lesson.words.length === 0);
  assert.ok(wordless.length > 0, "в этой книге такой урок есть — проверка потеряла бы смысл");
  for (const lesson of wordless) {
    assert.ok(lesson.fragments.length > 0, `урок ${lesson.id}: ни слов, ни текста`);
    assert.equal(textCourseQuestions(lesson, metBefore(lesson)).length, 0, `урок ${lesson.id}`);
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

// Fifteen lessons of the second book bring one or two words, and out of those
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
  assert.equal(part8Summaries.length, lessons.length);
  for (const lesson of lessons) {
    const summary = part8Summaries.find((item) => item.id === lesson.id);
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
  assert.deepEqual(part8Glossary, words);
});

// The eighth course waits for the whole seventh one — the chain every course
// here follows. Hadith science comes after logic because it is where both meet
// the transmitted: مُصْطَلَح weighs the chain a report came down.
test("the eighth course waits for the whole seventh one", () => {
  const shelf = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(isPart8Open(shelf, {}), false);
  assert.equal(isPart8Open(shelf, { 1: 30, 2: 20 }), false);
  assert.equal(isPart8Open(shelf, { 1: 30, 2: 20, 3: 10 }), true);
  // An empty shelf is not "finished" — the course would then open by itself.
  assert.equal(isPart8Open([], {}), false);
});

test("the eighth course runs in order and never takes ground back", () => {
  const empty = { part8Scores: {}, part8Sessions: {}, cards: {} };
  assert.equal(unlockedPart8Ids(part8Summaries, empty, false).size, 0);

  const opened = unlockedPart8Ids(part8Summaries, empty, true);
  assert.equal(opened.has(1), true, "первый урок должен открыться");
  assert.equal(opened.has(2), false, "второй ждёт первого");

  const oneDone = { ...empty, part8Scores: { 1: 29 } };
  const next = unlockedPart8Ids(part8Summaries, oneDone, true);
  assert.equal(next.has(2), true);
  assert.equal(next.has(3), false);

  const roaming = { ...empty, cards: { [part8CardId(5, 0, "ar-ru")]: {} } };
  const kept = unlockedPart8Ids(part8Summaries, roaming, true);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(kept.has(id), true, `урок ${id} закрылся`);
});

test("a eighth-course card says which lesson it came from", () => {
  assert.equal(part8CardId(7, 12, "ru-ar"), "p8-lesson-7-word-12-ru-ar");
  const cards = {
    "p8-lesson-3-word-0-ar-ru": {},
    "p8-lesson-9-word-4-ru-ar": {},
    // The seven courses before this one share the box and do not belong here.
    "p7-lesson-3-word-0-ar-ru": {},
    "p6-lesson-3-word-0-ar-ru": {},
    "p5-lesson-3-word-0-ar-ru": {},
    "p4-lesson-3-word-0-ar-ru": {},
    "p3-lesson-3-word-0-ar-ru": {},
    "p2-lesson-3-word-0-ar-ru": {},
    "lesson-3-deck-0-word-0-ar-ru": {},
  };
  assert.deepEqual(part8LessonIdsInCards(cards).sort((a, b) => a - b), [3, 9]);
});

// A teaching course gives its Arabic fully vowelled. Here the vowels came from
// the export, so they are checked by machine rather than by eye. Both books came
// in at 99.7% and better; what is left bare is a source reference the book
// prints unvowelled — «[البقرة: ٢]», «اهـ» — and the bar stays where the courses
// before it hold it.
//
// A single-letter token carries no vowels anywhere, so it is not counted as a
// word — the same rule the fifth course needed.
const VOWELLED_SHARE = 0.85;
// The longest fragment of these books is 158 words: the second one argues in
// paragraphs. Much beyond that is read as a page instead.
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

// «Тавдихат» is a commentary on a poem: a بَيْت, then the prose unfolding it,
// all the way through. The line being explained is not one more sentence of the
// explanation, and a reader who cannot tell the مَتْن from the شَرْح has lost the
// shape of the book — so the mark is kept, and the screen uses it.
test("a line of verse stays a line of verse", async () => {
  const verses = lessons.flatMap((lesson) => lesson.fragments.filter((line) => line.verse));
  assert.ok(verses.length > 0, "в первой книге этой части стихи есть");
  for (const line of verses) {
    assert.equal(line.verse, true);
    assert.match(line.arabic, /[ء-ي]/);
    assert.match(line.russian, /[а-яА-ЯёЁ]/);
    assert.notEqual(line.heading, true, "стих — не заголовок");
  }

  // Every lesson of the commentary carries at least one: the poem is its spine.
  const commentary = lessons.filter((lesson) => lesson.book === "Тавдихат");
  for (const lesson of commentary) {
    assert.ok(
      lesson.fragments.some((line) => line.verse),
      `урок ${lesson.id}: комментарий без бейта, который он разбирает`,
    );
  }

  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /line\.verse \? "is-verse"/);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.reading-line\.is-verse/);
});

// The eighth course's progress travels between devices and is stored under
// keys of its own; otherwise a merge or a backup would drop it in silence.
test("the eighth course is carried by the store, the merge and the backup", async () => {
  const store = await readFile(new URL("../app/progress-store.ts", import.meta.url), "utf8");
  const merge = await readFile(new URL("../app/merge-progress.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(store, /shifahiya-p8-lesson-\$\{id\}/);
  assert.match(store, /shifahiya-p8-session-\$\{id\}/);
  assert.match(store, /finishPart8Lesson/);
  assert.match(merge, /part8Scores: mergeScores/);
  assert.match(merge, /part8Sessions: mergeReadingSessions/);
  assert.match(page, /part8Scores: payload\.part8Scores \?\? \{\}/);
});
