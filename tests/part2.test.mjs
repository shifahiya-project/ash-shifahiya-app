import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { BLANK, part2Questions } from "../content/part2/questions.ts";
import { part2Summaries } from "../content/part2/manifest.ts";
import { part2CardId, part2LessonIdsInCards, unlockedPart2Ids } from "../app/part2-access.ts";

const directory = new URL("../content/part2/", import.meta.url);

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
    assert.ok(lesson.stories.length > 0, `урок ${lesson.id}: нет текста`);
    assert.ok(lesson.book.length > 0, `урок ${lesson.id}: не указана книга`);

    for (const story of lesson.stories) {
      assert.ok(story.title.length > 0, `урок ${lesson.id}: рассказ без названия`);
      assert.ok(story.sentences.length > 0, `урок ${lesson.id}: «${story.title}» без предложений`);
      for (const line of story.sentences) {
        assert.match(line.arabic, /[ء-ي]/, `урок ${lesson.id}: строка без арабского`);
        assert.match(line.russian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: строка без перевода`);
      }
    }
  }
});

// Каждая книга загружается своим импортом и нумеруется вслед за предыдущей.
// Прогресс ученика хранится по номеру урока, поэтому книга обязана занимать
// сплошной кусок нумерации, а сама нумерация — идти без дыр.
test("the books lie one after another, numbered without gaps", () => {
  lessons.forEach((lesson, index) => {
    assert.equal(lesson.id, index + 1, `урок на месте ${index + 1} имеет номер ${lesson.id}`);
  });

  const shelf = [];
  for (const lesson of lessons) if (shelf.at(-1) !== lesson.book) shelf.push(lesson.book);
  assert.equal(new Set(shelf).size, shelf.length, `книга разорвана на куски: ${shelf.join(" · ")}`);
});

test("every word carries its meaning and the sentence it lives in", () => {
  const kinds = new Set(["verb", "noun", "masdar", "participle", "adj", "adverb", "expression"]);
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      assert.match(word.arabic, /[ء-ي]/, `урок ${lesson.id}: ${word.russian}`);
      assert.match(word.russian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: ${word.arabic}`);
      assert.ok(kinds.has(word.kind), `урок ${lesson.id}: неизвестный тип ${word.kind}`);
      assert.match(word.contextArabic, /[ء-ي]/, `урок ${lesson.id}: ${word.arabic} без контекста`);
      assert.match(word.contextRussian, /[а-яА-ЯёЁ]/, `урок ${lesson.id}: ${word.arabic} без перевода контекста`);
      // Форма для пропуска обязана стоять в самой фразе — иначе пропуск не встанет.
      if (word.contextForm) {
        assert.ok(
          word.contextArabic.includes(word.contextForm),
          `урок ${lesson.id}: ${word.contextForm} не найдена во фразе`,
        );
      }
    }
  }
});

test("each new word is asked about exactly once", () => {
  for (const lesson of lessons) {
    const questions = part2Questions(lesson);
    assert.equal(questions.length, lesson.words.length, `урок ${lesson.id}`);
  }
});

test("a question is answerable, and only one answer fits", () => {
  for (const lesson of lessons) {
    for (const question of part2Questions(lesson)) {
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

// Задание с пропуском — основная форма: слово проверяется там, где оно стоит.
test("a gap question hides the word and nothing else", () => {
  let gaps = 0;
  for (const lesson of lessons) {
    for (const question of part2Questions(lesson)) {
      if (!question.prompt.includes(BLANK)) continue;
      gaps += 1;
      const word = lesson.words.find((item) => item.contextForm === question.answer);
      assert.ok(word, `урок ${lesson.id}: ответ «${question.answer}» не из слов урока`);
      assert.equal(
        question.prompt,
        word.contextArabic.replace(word.contextForm, BLANK),
        `урок ${lesson.id}: пропуск встал не на место`,
      );
      assert.ok(!question.prompt.includes(question.answer), `урок ${lesson.id}: ответ виден в вопросе`);
      // Прочерк вместо всей фразы спрашивать не о чем.
      assert.match(
        question.prompt.replace(BLANK, " "),
        /[ء-ي]/,
        `урок ${lesson.id}: от фразы остался один пропуск`,
      );
    }
  }
  assert.ok(gaps > lessons.length * 10, `заданий с пропуском всего ${gaps} — слишком мало`);
});

test("the same paper comes out every time", () => {
  for (const lesson of lessons) {
    assert.deepEqual(part2Questions(lesson), part2Questions(lesson), `урок ${lesson.id}`);
  }
});

test("the manifest agrees with the lessons", () => {
  assert.equal(part2Summaries.length, lessons.length);
  for (const lesson of lessons) {
    const summary = part2Summaries.find((item) => item.id === lesson.id);
    assert.ok(summary, `урок ${lesson.id} отсутствует в манифесте`);
    assert.equal(summary.book, lesson.book);
    assert.equal(summary.wordCount, lesson.words.length);
    assert.equal(summary.storyCount, lesson.stories.length);
    assert.equal(
      summary.sentenceCount,
      lesson.stories.reduce((total, story) => total + story.sentences.length, 0),
    );
    assert.deepEqual(summary.storyTitles, lesson.stories.map((story) => story.title));
  }
});

// Второй курс открывается по итоговой работе первого — и, как и первый,
// никогда не отнимает уже пройденное.
test("the second course waits for the final paper, then runs in order", () => {
  const empty = { part2Scores: {}, part2Sessions: {}, cards: {} };
  assert.equal(unlockedPart2Ids(part2Summaries, empty, false).size, 0);

  const opened = unlockedPart2Ids(part2Summaries, empty, true);
  assert.equal(opened.has(1), true, "первый урок должен открыться");
  assert.equal(opened.has(2), false, "второй ждёт первого");

  const oneDone = { ...empty, part2Scores: { 1: 30 } };
  const next = unlockedPart2Ids(part2Summaries, oneDone, true);
  assert.equal(next.has(2), true);
  assert.equal(next.has(3), false);

  // Урок, начатый когда-то раньше, остаётся открытым вместе со всем до него.
  const roaming = { ...empty, cards: { [part2CardId(5, 0, "ar-ru")]: {} } };
  const kept = unlockedPart2Ids(part2Summaries, roaming, true);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(kept.has(id), true, `урок ${id} закрылся`);
});

test("a second-course card says which lesson it came from", () => {
  assert.equal(part2CardId(7, 12, "ru-ar"), "p2-lesson-7-word-12-ru-ar");
  const cards = {
    "p2-lesson-3-word-0-ar-ru": {},
    "p2-lesson-9-word-4-ru-ar": {},
    // Карточки первого курса живут в той же коробке и сюда не попадают.
    "lesson-3-deck-0-word-0-ar-ru": {},
  };
  assert.deepEqual(part2LessonIdsInCards(cards).sort((a, b) => a - b), [3, 9]);
});
