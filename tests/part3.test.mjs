import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { part3Questions } from "../content/part3/questions.ts";
import { PART3_AUTHOR, PART3_BOOK, part3Summaries } from "../content/part3/manifest.ts";
import { isPart3Open, part3CardId, part3LessonIdsInCards, unlockedPart3Ids } from "../app/part3-access.ts";

const directory = new URL("../content/part3/", import.meta.url);

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

test("every lesson brings words and the text they belong to", () => {
  assert.ok(lessons.length > 0);
  for (const lesson of lessons) {
    assert.ok(lesson.words.length > 0, `урок ${lesson.id}: нет слов`);
    assert.ok(lesson.fragments.length > 0, `урок ${lesson.id}: нет текста`);
    assert.ok(lesson.title.length > 0, `урок ${lesson.id}: без названия`);
    assert.ok(lesson.section.length > 0, `урок ${lesson.id}: не указан раздел книги`);
    assert.match(lesson.arabicTitle, /[ء-ي]/, `урок ${lesson.id}: без арабского названия`);

    for (const line of lesson.fragments) {
      assert.match(line.arabic, /[ء-ي]/, `урок ${lesson.id}: фрагмент без арабского`);
      assert.match(line.russian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: фрагмент без перевода`);
    }
  }
});

// Книга идёт подряд, а прогресс ученика хранится по номеру урока: нумерация
// обязана быть сплошной, а бабы — не разрываться на куски.
test("the lessons are numbered without gaps and the chapters hold together", () => {
  lessons.forEach((lesson, index) => {
    assert.equal(lesson.id, index + 1, `урок на месте ${index + 1} имеет номер ${lesson.id}`);
  });

  const chapters = [];
  for (const lesson of lessons) if (chapters.at(-1) !== lesson.section) chapters.push(lesson.section);
  assert.equal(new Set(chapters).size, chapters.length, `баб разорван: ${chapters.join(" · ")}`);
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

// Словарь этой книги примеров не даёт, и выдумывать их курс не стал: слово
// спрашивается по значению, а в предложении встречается целиком — на чтении.
test("a word is asked by its meaning, and the text is never cut up for a gap", () => {
  for (const lesson of lessons) {
    const questions = part3Questions(lesson);
    assert.equal(questions.length, lesson.words.length, `урок ${lesson.id}`);

    questions.forEach((question, index) => {
      const word = lesson.words[index];
      assert.equal(question.prompt, word.arabic, `урок ${lesson.id}: спрошено не слово урока`);
      assert.equal(question.promptLang, "ar");
      assert.equal(question.answer, word.russian, `урок ${lesson.id}: ${word.arabic}`);
    });
  }
});

test("a question is answerable, and only one answer fits", () => {
  for (const lesson of lessons) {
    for (const question of part3Questions(lesson)) {
      assert.ok(question.options.includes(question.answer), `урок ${lesson.id}: «${question.prompt}»`);
      assert.equal(question.options.length, 3, `урок ${lesson.id}: «${question.prompt}»`);
      assert.equal(
        new Set(question.options).size,
        3,
        `урок ${lesson.id}: повтор варианта в «${question.prompt}»`,
      );
      assert.ok(question.explanation.length > 0, `урок ${lesson.id}: «${question.prompt}» без разбора`);

      // Вариант, отличающийся от ответа только огласовками, — второй верный ответ.
      const wrong = question.options.filter((option) => option !== question.answer);
      for (const option of wrong) {
        if (!/[ء-ي]/.test(option)) continue;
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
    assert.deepEqual(part3Questions(lesson), part3Questions(lesson), `урок ${lesson.id}`);
  }
});

test("the manifest agrees with the lessons", () => {
  assert.equal(part3Summaries.length, lessons.length);
  assert.ok(PART3_BOOK.length > 0);
  assert.ok(PART3_AUTHOR.length > 0);
  for (const lesson of lessons) {
    const summary = part3Summaries.find((item) => item.id === lesson.id);
    assert.ok(summary, `урок ${lesson.id} отсутствует в манифесте`);
    assert.equal(summary.title, lesson.title);
    assert.equal(summary.arabicTitle, lesson.arabicTitle);
    assert.equal(summary.section, lesson.section);
    assert.equal(summary.wordCount, lesson.words.length);
    assert.equal(summary.fragmentCount, lesson.fragments.length);
  }
});

// Третий курс ждёт второй целиком: научный текст читают после того, как
// рассказы читаются свободно. Одного урока второй части для этого мало.
test("the third course waits for the whole second one", () => {
  const shelf = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(isPart3Open(shelf, {}), false);
  assert.equal(isPart3Open(shelf, { 1: 30, 2: 20 }), false);
  assert.equal(isPart3Open(shelf, { 1: 30, 2: 20, 3: 10 }), true);
  // Пустая полка не «пройдена» — иначе курс открылся бы сам собой.
  assert.equal(isPart3Open([], {}), false);
});

// И, как первые два курса, никогда не отнимает уже пройденное.
test("the third course runs in order and never takes ground back", () => {
  const empty = { part3Scores: {}, part3Sessions: {}, cards: {} };
  assert.equal(unlockedPart3Ids(part3Summaries, empty, false).size, 0);

  const opened = unlockedPart3Ids(part3Summaries, empty, true);
  assert.equal(opened.has(1), true, "первый урок должен открыться");
  assert.equal(opened.has(2), false, "второй ждёт первого");

  const oneDone = { ...empty, part3Scores: { 1: 30 } };
  const next = unlockedPart3Ids(part3Summaries, oneDone, true);
  assert.equal(next.has(2), true);
  assert.equal(next.has(3), false);

  const roaming = { ...empty, cards: { [part3CardId(5, 0, "ar-ru")]: {} } };
  const kept = unlockedPart3Ids(part3Summaries, roaming, true);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(kept.has(id), true, `урок ${id} закрылся`);
});

test("a third-course card says which lesson it came from", () => {
  assert.equal(part3CardId(7, 12, "ru-ar"), "p3-lesson-7-word-12-ru-ar");
  const cards = {
    "p3-lesson-3-word-0-ar-ru": {},
    "p3-lesson-9-word-4-ru-ar": {},
    // Карточки первых двух курсов живут в той же коробке и сюда не попадают.
    "p2-lesson-3-word-0-ar-ru": {},
    "lesson-3-deck-0-word-0-ar-ru": {},
  };
  assert.deepEqual(part3LessonIdsInCards(cards).sort((a, b) => a - b), [3, 9]);
});

// Арабский учебного курса даётся с полной огласовкой. Здесь она пришла из
// выгрузки, поэтому её проверяют машинно, а не на глаз.
test("the Arabic of the course is vowelled", () => {
  const harakat = /[ً-ْ]/;
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      assert.match(word.arabic, harakat, `урок ${lesson.id}: ${word.arabic} без огласовок`);
    }
    for (const line of lesson.fragments) {
      assert.match(line.arabic, harakat, `урок ${lesson.id}: фрагмент без огласовок`);
    }
  }
});

// Прогресс третьего курса ездит между устройствами и хранится под своими
// ключами — иначе слияние или бэкап молча теряли бы её.
test("the third course is carried by the store, the merge and the backup", async () => {
  const store = await readFile(new URL("../app/progress-store.ts", import.meta.url), "utf8");
  const merge = await readFile(new URL("../app/merge-progress.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(store, /shifahiya-p3-lesson-\$\{id\}/);
  assert.match(store, /shifahiya-p3-session-\$\{id\}/);
  assert.match(store, /finishPart3Lesson/);
  assert.match(merge, /part3Scores: mergeScores/);
  assert.match(merge, /part3Sessions: mergeReadingSessions/);
  assert.match(page, /part3Scores: payload\.part3Scores \?\? \{\}/);
});
