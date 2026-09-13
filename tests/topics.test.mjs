import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { TOPICS, TOPIC_SUMMARIES, summarize, topicById } from "../content/topics/catalog.ts";
import { isDrill, stepUnits, topicAtoms, topicDrills, topicUnits } from "../content/topics/types.ts";
import { examPassMark } from "../app/lesson-access.ts";
import { buildTask, countInWords, dueFor, taskSeed } from "../app/topic-drills.ts";
import {
  LAST_TOPIC_BOX,
  TOPIC_INTERVALS,
  cardKey,
  demoteTopicCard,
  dueCardCount,
  dueUnitIds,
  gradeFromRecall,
  isMastered,
  modeFor,
  nextTopicCard,
  resetTopicCard,
  topicDate,
  topicProgress,
} from "../app/topic-schedule.ts";

const zakat = topicById("zakat");

// ——— Материал темы ———

test("a topic is a book section broken into steps, and every unit says where it came from", () => {
  assert.ok(zakat, "пилотная тема на месте");
  const [from, to] = zakat.source.pages.split("–").map(Number);
  assert.ok(from < to);

  for (const step of zakat.steps) {
    assert.ok(step.pages, `${step.id}: страницы книги обязательны`);
    assert.ok(step.brief.length >= 2, `${step.id}: без тезисов шаг ничего не держит`);
    assert.ok(step.atoms.length >= 1);

    // The text stays in the learner's own book, so the pages are the only way
    // back to it: a unit that cannot be checked against the source is a unit
    // the learner has to take on trust.
    for (const unit of stepUnits(step)) {
      assert.ok(unit.page >= from && unit.page <= to, `${unit.id}: страница ${unit.page} вне раздела`);
    }
  }
});

test("every unit of a topic has its own address", () => {
  for (const topic of TOPICS) {
    const ids = topicUnits(topic).map((unit) => unit.id);
    assert.equal(new Set(ids).size, ids.length, `${topic.id}: повторяющийся id карточки`);
  }
});

test("a fact asks and answers, a list comes with the items it is checked by", () => {
  for (const atom of topicAtoms(zakat)) {
    assert.match(atom.question, /\S/);
    assert.match(atom.answer, /\S/);
    if (atom.kind === "list") {
      assert.ok(atom.items && atom.items.length >= 2, `${atom.id}: список короче двух пунктов`);
    } else {
      assert.equal(atom.items, undefined, `${atom.id}: пункты есть только у списка`);
    }
  }
});

test("hand-written options are alternatives, never a second right answer", () => {
  for (const atom of topicAtoms(zakat)) {
    if (!atom.options) continue;
    assert.ok(atom.options.length >= 2, `${atom.id}: одного неверного варианта мало`);
    assert.equal(new Set(atom.options).size, atom.options.length, `${atom.id}: варианты повторяются`);
    assert.ok(!atom.options.includes(atom.answer), `${atom.id}: ответ среди неверных вариантов`);
    assert.equal(atom.kind, "fact", `${atom.id}: у списка вариантов быть не может`);
  }
});

test("the exam is the book's own review list, answered from the atoms themselves", () => {
  const ids = new Set(topicAtoms(zakat).map((atom) => atom.id));
  assert.equal(zakat.exam.questions.length, 27, "все вопросы раздела");

  const numbers = zakat.exam.questions.map((question) => Number(question.id));
  assert.deepEqual(numbers, Array.from({ length: 27 }, (_, index) => index + 1), "нумерация книги");

  for (const question of zakat.exam.questions) {
    assert.ok(question.atoms.length >= 1, `вопрос ${question.id} ни на что не опирается`);
    for (const atom of question.atoms) {
      assert.ok(ids.has(atom), `вопрос ${question.id} ссылается на несуществующий факт ${atom}`);
    }
  }

  // Three quarters and one answer more, the same line the course's exams draw.
  assert.equal(examPassMark(27), 22);
});

test("the summary is counted off the topic rather than typed beside it", () => {
  const summary = summarize(zakat);
  assert.equal(summary.steps, zakat.steps.length);
  assert.equal(summary.facts, topicAtoms(zakat).length);
  assert.equal(summary.drills, topicDrills(zakat).length);
  assert.equal(summary.unitIds.length, summary.facts + summary.drills);
  assert.deepEqual(TOPIC_SUMMARIES.map((item) => item.id), TOPICS.map((item) => item.id));
});

// ——— Расписание ———

test("the boxes grow and the last one holds", () => {
  assert.deepEqual(TOPIC_INTERVALS, [0, 1, 3, 7, 16, 35, 90]);
  for (let index = 1; index < TOPIC_INTERVALS.length; index += 1) {
    assert.ok(TOPIC_INTERVALS[index] > TOPIC_INTERVALS[index - 1], "интервалы только растут");
  }

  const day = new Date("2026-09-13T09:00:00");
  let card = nextTopicCard(undefined, "good", day);
  assert.equal(card.box, 1);
  assert.equal(card.nextReview, topicDate(1, day));
  assert.equal(card.reps, 1);

  // Recalling with effort holds the interval instead of stretching it.
  const held = nextTopicCard(card, "hard", day);
  assert.equal(held.box, 1);
  assert.equal(held.nextReview, topicDate(1, day));
  assert.equal(held.reps, 2);

  for (let index = 0; index < 20; index += 1) card = nextTopicCard(card, "good", day);
  assert.equal(card.box, LAST_TOPIC_BOX);
  assert.equal(card.nextReview, topicDate(90, day));
  assert.ok(isMastered(card));
});

test("forgetting sends a card back to today and is counted", () => {
  const day = new Date("2026-09-13T09:00:00");
  const known = { box: 4, nextReview: "2026-09-29", lastSeen: "2026-09-13", reps: 8, lapses: 0 };

  const lost = nextTopicCard(known, "again", day);
  assert.equal(lost.box, 0);
  assert.equal(lost.nextReview, topicDate(0, day), "вернётся сегодня же");
  assert.equal(lost.lapses, 1);

  // A card that never got anywhere has nothing to lapse from.
  assert.equal(nextTopicCard(undefined, "again", day).lapses, 0);
});

test("the exam's middle answer is one box back, not the beginning", () => {
  const day = new Date("2026-09-13T09:00:00");
  const known = { box: 4, nextReview: "2026-09-29", lastSeen: "2026-09-13", reps: 8, lapses: 0 };

  const demoted = demoteTopicCard(known, day);
  assert.equal(demoted.box, 3);
  assert.equal(demoted.nextReview, topicDate(7, day));
  assert.equal(demoted.lapses, 0, "оценка «частично» не считается потерей");
  assert.equal(demoteTopicCard(undefined, day).box, 0, "ниже нуля опускать некуда");

  const reset = resetTopicCard(known, day);
  assert.equal(reset.box, 0);
  assert.equal(reset.nextReview, topicDate(0, day));
  assert.equal(reset.lapses, 1);
  assert.equal(reset.reps, known.reps, "возврат в начало — не ответ, счётчик не растёт");
});

test("the queue is for coming back, not for meeting things the first time", () => {
  const ids = ["a", "b", "c"];
  const cards = {
    [cardKey("zakat", "a")]: { box: 1, nextReview: "2026-09-13", lastSeen: "2026-09-12", reps: 1, lapses: 0 },
    [cardKey("zakat", "b")]: { box: 3, nextReview: "2026-09-30", lastSeen: "2026-09-13", reps: 5, lapses: 2 },
  };

  assert.deepEqual(dueUnitIds(cards, "zakat", ids, "2026-09-13"), ["a"]);
  assert.deepEqual(dueUnitIds(cards, "zakat", ids, "2026-10-01"), ["a", "b"]);
  assert.equal(dueCardCount(cards, "2026-09-13"), 1);

  const progress = topicProgress(cards, "zakat", ids, "2026-09-13");
  assert.deepEqual(progress, { total: 3, seen: 2, due: 1, mastered: 0, shaky: 1 });

  // Another topic's cards are another topic's business.
  assert.deepEqual(dueUnitIds(cards, "namaz", ids, "2026-09-13"), []);
});

test("how a unit is asked follows the box it is in", () => {
  const withOptions = topicAtoms(zakat).find((atom) => atom.options);
  const withoutOptions = topicAtoms(zakat).find((atom) => atom.kind === "fact" && !atom.options);
  const list = topicAtoms(zakat).find((atom) => atom.kind === "list");
  const drill = topicDrills(zakat)[0];
  const box = (value) => ({ box: value, nextReview: "2026-09-13", lastSeen: "2026-09-13", reps: 1, lapses: 0 });

  // Recognition is a foothold for the first day, not a way of passing later.
  assert.equal(modeFor(withOptions, undefined), "choice");
  assert.equal(modeFor(withOptions, box(0)), "choice");
  assert.equal(modeFor(withOptions, box(1)), "recall");
  assert.equal(modeFor(withoutOptions, undefined), "recall");
  // An enumeration is its own answer: choosing between four of them checks nothing.
  assert.equal(modeFor(list, undefined), "list");
  assert.equal(modeFor(list, box(3)), "list");
  assert.equal(modeFor(drill, box(5)), "drill");
});

test("a list is graded by what actually came back", () => {
  assert.equal(gradeFromRecall(6, 6), "good");
  assert.equal(gradeFromRecall(3, 6), "hard");
  assert.equal(gradeFromRecall(2, 6), "again");
  assert.equal(gradeFromRecall(0, 8), "again");
  assert.equal(gradeFromRecall(5, 9), "hard");
});

// ——— Расчёты ———

const drills = Object.fromEntries(topicDrills(zakat).map((drill) => [drill.id, drill]));

test("the tables answer the book's own questions", () => {
  // Вопросы 11–13 раздела, слово в слово из книги.
  assert.match(dueFor(drills["drill-camels"], 26), /годовалая верблюдица/);
  assert.match(dueFor(drills["drill-camels"], 37), /двухгодовалая верблюдица/);
  assert.match(dueFor(drills["drill-cows"], 25), /Закята нет/, "нисаб коров — тридцать");
  assert.match(dueFor(drills["drill-cows"], 35), /годовалая корова/);

  assert.match(dueFor(drills["drill-sheep"], 35), /Закята нет/, "нисаб овец — сорок");
  assert.equal(dueFor(drills["drill-sheep"], 90), "Одна овца.");
  assert.equal(dueFor(drills["drill-sheep"], 190), "Две овцы.");
  assert.equal(dueFor(drills["drill-sheep"], 300), "Три овцы.");
  assert.equal(dueFor(drills["drill-sheep"], 600), "Шесть овец.", "после четырёхсот — с каждой сотни");

  // Границы ступеней: порог принадлежит той ступени, которую он открывает.
  assert.equal(dueFor(drills["drill-sheep"], 39), "Закята нет: нисаб не достигнут.");
  assert.equal(dueFor(drills["drill-sheep"], 40), "Одна овца.");
  assert.equal(dueFor(drills["drill-sheep"], 120), "Одна овца.");
  assert.equal(dueFor(drills["drill-sheep"], 121), "Две овцы.");
  assert.equal(dueFor(drills["drill-sheep"], 400), "Четыре овцы.");
  assert.equal(dueFor(drills["drill-sheep"], 499), "Четыре овцы.");
  assert.equal(countInWords(2, ["овца", "овцы", "овец"]), "Две овцы");
});

test("a table drill is generated, checkable and never without its right answer", () => {
  for (const id of ["drill-camels", "drill-cows", "drill-sheep"]) {
    const drill = drills[id];
    assert.deepEqual(
      drill.steps.map((step) => step.from),
      [...drill.steps.map((step) => step.from)].sort((a, b) => a - b),
      `${id}: ступени должны идти по возрастанию`,
    );

    const seen = new Set();
    for (let seed = 1; seed <= 60; seed += 1) {
      const task = buildTask(drill, seed);
      assert.equal(task.kind, "choice");
      assert.ok(task.options.includes(task.answer), `${id}: верный ответ выпал из вариантов`);
      assert.equal(new Set(task.options).size, task.options.length, `${id}: варианты повторяются`);
      assert.ok(task.options.length >= 3, `${id}: меньше трёх вариантов`);
      assert.match(task.prompt, /\d/, `${id}: в задании нет числа`);
      seen.add(task.prompt);
    }
    assert.ok(seen.size > 10, `${id}: задание почти не меняется от раза к разу`);
  }
});

test("the same seed gives the same task, which is what makes it checkable", () => {
  for (const drill of topicDrills(zakat)) {
    const seed = taskSeed(drill.id, "2026-09-13", 2);
    assert.deepEqual(buildTask(drill, seed), buildTask(drill, seed));
  }
  assert.notEqual(taskSeed("drill-sheep", "2026-09-13", 0), taskSeed("drill-sheep", "2026-09-14", 0));
  assert.notEqual(taskSeed("drill-sheep", "2026-09-13", 0), taskSeed("drill-sheep", "2026-09-13", 1));
});

test("a harvest is divided into whole units, whichever way it was watered", () => {
  const drill = drills["drill-harvest"];
  for (let seed = 1; seed <= 80; seed += 1) {
    const task = buildTask(drill, seed);
    assert.equal(task.kind, "number");
    assert.ok(Number.isInteger(task.answer), `дробный ответ: ${task.answer}`);
    assert.ok(task.answer > 0);
    assert.match(task.note, /÷/);
  }
});

test("money is weighed against the nisab before any percentage is taken", () => {
  const drill = drills["drill-money"];
  let zero = 0;
  let due = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const task = buildTask(drill, seed);
    assert.equal(task.kind, "number");
    assert.ok(Number.isInteger(task.answer), `дробный ответ: ${task.answer}`);
    if (task.answer === 0) {
      zero += 1;
      assert.match(task.note, /меньше нисаба/);
      assert.match(task.answerLabel, /Закята нет/);
    } else {
      due += 1;
      assert.match(task.note, /нисаб или больше/);
    }
  }
  assert.ok(zero > 0, "ниже нисаба случай обязан встречаться — иначе порог не проверяется");
  assert.ok(due > 0);
});

test("sorting always offers both buckets, or it teaches answering without reading", () => {
  for (const id of ["drill-relatives", "drill-recipients"]) {
    const drill = drills[id];
    for (let seed = 1; seed <= 80; seed += 1) {
      const task = buildTask(drill, seed);
      assert.equal(task.kind, "sort");
      assert.equal(task.items.length, drill.size);
      assert.equal(new Set(task.items.map((item) => item.label)).size, drill.size, "повтор в задании");
      assert.equal(new Set(task.items.map((item) => item.bucket)).size, 2, `${id}: одна кучка на всё задание`);
    }
  }
});

test("the relatives drill follows the vertical of the family tree", () => {
  const byLabel = Object.fromEntries(drills["drill-relatives"].items.map((item) => [item.label, item.bucket]));
  // Вопрос 19 книги, все девять его пунктов.
  assert.equal(byLabel["Отец"], 1);
  assert.equal(byLabel["Родной брат"], 0);
  assert.equal(byLabel["Дядя по матери"], 0);
  assert.equal(byLabel["Бабушка"], 1);
  assert.equal(byLabel["Тётя по отцовской линии"], 0);
  assert.equal(byLabel["Дедушка"], 1);
  assert.equal(byLabel["Сын"], 1);
  assert.equal(byLabel["Родная сестра"], 0);
  assert.equal(byLabel["Внук"], 1);
});

// ——— Решения, а не код ———

test("memorising a topic touches nothing the course counts", async () => {
  const store = await readFile(new URL("../app/topic-store.ts", import.meta.url), "utf8");
  for (const key of ["shifahiya-card-progress", "shifahiya-lesson-", "shifahiya-learning-stats"]) {
    assert.ok(!store.includes(key), `хранилище тем трогает курсовой ключ ${key}`);
  }

  // The course screen may know how many cards are due — that is a reminder, and
  // it costs nothing. It must not know what is in them: the topics ride their
  // own route, and their content has no business in the course's entry chunk.
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes("content/topics"), "содержимое тем попало в главный экран");
  assert.ok(page.includes("./topic-schedule"), "счётчик повторений на главной пропал");
});

test("a unit of a topic is not a card of the course", () => {
  // The addresses cannot collide: the course keys its cards by lesson and word,
  // the topics by topic and unit.
  assert.equal(cardKey("zakat", "nisab-gold"), "zakat:nisab-gold");
  for (const unit of topicUnits(zakat)) {
    assert.ok(!unit.id.startsWith("lesson-"), `${unit.id} выглядит как карточка курса`);
    assert.equal(isDrill(unit), !("question" in unit));
  }
});

// ——— Разметка на сервере ———

async function renderTopics() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/topics", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the memorisation part is its own route and renders on the server", async () => {
  const response = await renderTopics();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Темы наизусть/);
  assert.match(html, /Закят/);
  // React splits interpolated text with comment markers, so the page range is
  // matched on its own rather than together with the «с.» before it.
  assert.match(html, /98–110/, "путь к книге виден с первого экрана");
  // The route carries its own title rather than inheriting the course's.
  assert.match(html, /<title>[^<]*Темы наизусть[^<]*<\/title>/i);

  // The server knows neither the learner's progress nor their date, so nothing
  // that depends on either may appear in the markup it hands over.
  assert.ok(!html.includes("к повторению:"), "серверная разметка не знает про очередь");
});
