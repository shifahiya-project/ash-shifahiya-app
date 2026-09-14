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
const hajj = topicById("hajj");
const mirath = topicById("mirath");
const taharah = topicById("taharah-quduri");

// ——— Материал темы ———

test("a topic is a book section broken into steps, and every unit says where it came from", () => {
  assert.ok(zakat && hajj, "обе темы на месте");

  for (const topic of TOPICS) {
    const [from, to] = topic.source.pages.split("–").map(Number);
    assert.ok(from < to, `${topic.id}: страницы раздела`);

    for (const step of topic.steps) {
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
  }
});

test("every unit of a topic has its own address", () => {
  for (const topic of TOPICS) {
    const ids = topicUnits(topic).map((unit) => unit.id);
    assert.equal(new Set(ids).size, ids.length, `${topic.id}: повторяющийся id карточки`);
  }
});

test("a fact asks and answers, a list comes with the items it is checked by", () => {
  for (const atom of TOPICS.flatMap(topicAtoms)) {
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
  for (const atom of TOPICS.flatMap(topicAtoms)) {
    if (!atom.options) continue;
    assert.ok(atom.options.length >= 2, `${atom.id}: одного неверного варианта мало`);
    assert.equal(new Set(atom.options).size, atom.options.length, `${atom.id}: варианты повторяются`);
    assert.ok(!atom.options.includes(atom.answer), `${atom.id}: ответ среди неверных вариантов`);
    assert.equal(atom.kind, "fact", `${atom.id}: у списка вариантов быть не может`);
  }
});

test("the exam is the book's own review list, answered from the atoms themselves", () => {
  for (const topic of TOPICS) {
    const ids = new Set(topicAtoms(topic).map((atom) => atom.id));
    const numbers = topic.exam.questions.map((question) => Number(question.id));
    assert.deepEqual(
      numbers,
      Array.from({ length: numbers.length }, (_, index) => index + 1),
      `${topic.id}: нумерация книги`,
    );

    for (const question of topic.exam.questions) {
      assert.ok(question.atoms.length >= 1, `вопрос ${question.id} ни на что не опирается`);
      for (const atom of question.atoms) {
        assert.ok(ids.has(atom), `${topic.id}, вопрос ${question.id}: нет факта ${atom}`);
      }
    }
  }

  // Все вопросы раздела, сколько бы их ни было в книге.
  assert.equal(zakat.exam.questions.length, 27);
  assert.equal(hajj.exam.questions.length, 70);

  // Three quarters and one answer more, the same line the course's exams draw.
  assert.equal(examPassMark(27), 22);
  assert.equal(examPassMark(70), 54);
});

test("the summary is counted off the topic rather than typed beside it", () => {
  for (const topic of TOPICS) {
    const summary = summarize(topic);
    assert.equal(summary.steps, topic.steps.length);
    assert.equal(summary.facts, topicAtoms(topic).length);
    assert.equal(summary.drills, topicDrills(topic).length);
    assert.equal(summary.unitIds.length, summary.facts + summary.drills);
  }
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
const hajjDrills = Object.fromEntries(topicDrills(hajj).map((drill) => [drill.id, drill]));
const mirathDrills = Object.fromEntries(topicDrills(mirath).map((drill) => [drill.id, drill]));

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

test("sorting offers every bucket it has, or it teaches answering without reading", () => {
  for (const topic of TOPICS) {
    for (const drill of topicDrills(topic).filter((item) => item.kind === "sort")) {
      assert.ok(drill.buckets.length >= 2, `${drill.id}: одной кучки мало`);
      for (const bucket of drill.buckets.keys()) {
        assert.ok(
          drill.items.some((item) => item.bucket === bucket),
          `${drill.id}: кучка «${drill.buckets[bucket]}» пуста`,
        );
      }
      for (const item of drill.items) {
        assert.ok(item.bucket < drill.buckets.length, `${drill.id}: у «${item.label}» несуществующая кучка`);
      }

      // Задание, где все ответы совпадают, учит отвечать не читая; задание,
      // тихо потерявшее третью кучку, учит, что кучек две.
      const expected = Math.min(drill.buckets.length, drill.size);
      for (let seed = 1; seed <= 80; seed += 1) {
        const task = buildTask(drill, seed);
        assert.equal(task.kind, "sort");
        assert.equal(task.items.length, drill.size);
        assert.equal(new Set(task.items.map((item) => item.label)).size, drill.size, "повтор в задании");
        assert.equal(
          new Set(task.items.map((item) => item.bucket)).size,
          expected,
          `${drill.id}: в задании не все кучки`,
        );
      }
    }
  }
});

test("the order drill asks a window of the rite, and never one already solved", () => {
  const drill = hajjDrills["drill-order"];
  assert.equal(new Set(drill.items).size, drill.items.length, "шаг обряда повторяется");
  assert.equal(drill.items[0], "Одевание ихрама в микате");
  assert.equal(drill.items.at(-1), "Прощальный таваф");

  const windows = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const task = buildTask(drill, seed);
    assert.equal(task.kind, "order");
    assert.equal(task.answer.length, drill.size);

    // Окно — подряд идущие шаги обряда, а не любая их выборка.
    const start = drill.items.indexOf(task.answer[0]);
    assert.deepEqual(task.answer, drill.items.slice(start, start + drill.size));
    assert.deepEqual([...task.items].sort(), [...task.answer].sort(), "предложены не те шаги");
    assert.notDeepEqual(task.items, task.answer, "задание пришло уже решённым");
    windows.add(start);
  }
  assert.ok(windows.size > 3, "окно почти не двигается по обряду");
});

test("the pilgrimage sorts the way the book answers its own question 4", () => {
  const drill = hajjDrills["drill-fard-wajib"];
  const bucket = Object.fromEntries(drill.items.map((item) => [item.label, drill.buckets[item.bucket]]));
  assert.equal(bucket["Одевание ихрама"], "Фард");
  assert.equal(bucket["Стояние на Арафате"], "Фард");
  assert.equal(bucket["Совершение таваф аз-зияра"], "Фард");
  assert.equal(bucket["Бросание камней"], "Ваджиб");
  assert.equal(bucket["Бег между холмами Сафа и Марва"], "Ваджиб");
  assert.equal(bucket["Стояние в Муздалифе после утренней молитвы"], "Ваджиб");
  assert.equal(bucket["Прощальный таваф для прибывшего издалека"], "Ваджиб");
  assert.equal(bucket["Таваф прибытия"], "Сунна");
  // Стояние на Арафате — фард, а стояние до захода солнца — ваджиб: ровно та
  // пара, ради которой разбор и заведён.
  assert.equal(bucket["Стояние в Арафате до захода солнца"], "Ваджиб");

  const atoms = Object.fromEntries(topicAtoms(hajj).map((atom) => [atom.id, atom]));
  assert.equal(atoms.fardy.items.length, 3);
  assert.equal(atoms.vadzhiby.items.length, 11);
  assert.equal(atoms.sunnaty.items.length, 7);
});

test("the ladder of expiations keeps its three rungs", () => {
  const drill = hajjDrills["drill-kaffara"];
  const bucket = Object.fromEntries(drill.items.map((item) => [item.label, drill.buckets[item.bucket]]));
  assert.deepEqual(drill.buckets, ["Жертвоприношение", "Садака фитр", "Горсть пшеницы"]);
  // Одно и то же нарушение, три меры времени — три разных искупления.
  assert.equal(bucket["Шитая одежда в течение дня или ночи"], "Жертвоприношение");
  assert.equal(bucket["Шитая одежда меньше дня, но больше часа"], "Садака фитр");
  assert.equal(bucket["Шитая одежда меньше часа"], "Горсть пшеницы");
  // И то же самое по площади ткани.
  assert.equal(bucket["Благовониями обработано больше квадратной пяди одежды"], "Жертвоприношение");
  assert.equal(bucket["Благовониями обработана ровно квадратная пядь одежды"], "Садака фитр");
  assert.equal(bucket["Благовониями обработано меньше квадратной пяди одежды"], "Горсть пшеницы");
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

test("a topic can be written a chapter at a time, and the book is named on its screen", () => {
  // Адрес карточки — `тема:единица`, а не её место в списке, поэтому дописанная
  // глава ничего не сдвигает у того, кто уже начал тему.
  assert.ok(mirath, "третья тема на месте");
  // Что именно разобрано, тема говорит сама — формулировка меняется с каждой
  // дописанной главой, поэтому проверяется не она, а что раздел назван и что
  // издание с оговорками есть у каждой темы.
  assert.ok(mirath.source.section.trim(), "не сказано, какая часть книги разобрана");
  assert.match(mirath.source.note ?? "", /Казань/, "издание не названо");
  for (const topic of TOPICS) {
    assert.ok(topic.source.note, `${topic.id}: издание и оговорки некому показать`);
  }

  // Понятия и наследники разбираются кучками и порядками, а расчёты пришли
  // вместе с третьей главой — до неё в теме не было ни одного.
  const kinds = new Set(topicDrills(mirath).map((drill) => drill.kind));
  assert.deepEqual([...kinds].sort(), ["estate", "order", "sort"]);
  for (const drill of topicDrills(mirath)) {
    if (drill.kind === "estate") assert.ok(drill.page >= 97, `${drill.id}: расчёты начинаются с третьей главы`);
  }
});

test("очищение по аль-Кудури спрашивается всем контрольным списком книги", () => {
  assert.ok(taharah, "четвёртая тема на месте");

  // Книга закрывает раздел своим списком вопросов, и зачёт взят из него целиком.
  assert.equal(taharah.exam.questions.length, 101);
  assert.equal(examPassMark(101), 77);

  // Расчётов этот раздел не даёт: его таблицы — это разбор по кучкам (объём
  // вычерпывания, виды нечистоты) и порядок действий.
  const kinds = new Set(topicDrills(taharah).map((drill) => drill.kind));
  assert.deepEqual([...kinds].sort(), ["order", "sort"]);

  // Занятие отсылает к своим же страницам: здесь ни один вопрос не написан по
  // соседней главе, и расхождение значило бы опечатку в странице.
  for (const step of taharah.steps) {
    const [from, to] = step.pages.split("–").map(Number);
    for (const unit of stepUnits(step)) {
      assert.ok(unit.page >= from && unit.page <= (to ?? from), `${unit.id}: страница ${unit.page} вне занятия ${step.pages}`);
    }
  }

  // Общее правило о помёте съедобных птиц и список тяжёлой нечистоты стоят на
  // одной странице, и курица с гусем попадают в оба: правило, не назвавшее их
  // исключением, учит неверному ответу на собственный список темы.
  const heavy = topicAtoms(taharah).find((atom) => atom.id === "tq-heavy-najasa");
  const pure = topicAtoms(taharah).find((atom) => atom.id === "tq-clean-bird-droppings");
  assert.match(heavy.items.join(" "), /курицы/);
  assert.match(pure.answer, /курицы/, "исключение из правила не названо");
});

/**
 * Раздел наследства сверяется с собственными примерами книги: там, где она
 * сама довела расчёт до рублей, тренажёр обязан дать те же рубли. Случай
 * задаётся набором наследников, а сумма выбирается генератором, поэтому
 * сверяется доля от суммы — в ней и сидит вся арифметика.
 */
function estateMoney(heirs, label, total) {
  const drill = {
    id: "t",
    kind: "estate",
    title: "t",
    currency: "₽",
    cases: [{ heirs, note: "" }],
    values: [1],
    page: 97,
  };
  for (let seed = 1; seed <= 300; seed += 1) {
    const task = buildTask(drill, seed);
    const who = task.prompt.match(/Сколько наследует (.+?)(?: — каждый из них)?\?/)[1];
    if (who !== label) continue;
    const generated = Number(task.prompt.match(/имевшего ([\d\s  ]+)/)[1].replace(/\D/g, ""));
    assert.ok(Number.isInteger(task.answer), `${label}: ответ обязан быть целыми деньгами`);
    // Генератор выбирает сумму сам, поэтому доля пересчитывается на сумму книги.
    const scaled = (task.answer * total) / generated;
    assert.ok(Math.abs(scaled - Math.round(scaled)) < 1e-6, `${label}: доля от суммы книги вышла не целой`);
    return Math.round(scaled);
  }
  throw new Error(`${label}: генератор ни разу не спросил об этом наследнике`);
}

const WIFE = { label: "жена", count: 1, fard: [1, 8], spouse: true };

test("the estate drill divides an estate the way the book divides it", () => {
  // с. 102, пример 3: 120 000 между женой, отцом, матерью и сыном.
  const first = [
    WIFE,
    { label: "отец", count: 1, fard: [1, 6] },
    { label: "мать", count: 1, fard: [1, 6] },
    { label: "сын", count: 1, residue: 2 },
  ];
  assert.equal(estateMoney(first, "жена", 120000), 15000);
  assert.equal(estateMoney(first, "отец", 120000), 20000);
  assert.equal(estateMoney(first, "мать", 120000), 20000);
  assert.equal(estateMoney(first, "сын", 120000), 65000);

  // с. 103, пример 4: 90 000 между мужем, матерью и родным братом — вопрос 97.
  const second = [
    { label: "муж", count: 1, fard: [1, 2], spouse: true },
    { label: "мать", count: 1, fard: [1, 3] },
    { label: "родной брат", count: 1, residue: 2 },
  ];
  assert.equal(estateMoney(second, "муж", 90000), 45000);
  assert.equal(estateMoney(second, "мать", 90000), 30000);
  assert.equal(estateMoney(second, "родной брат", 90000), 15000);
});

test("a residue between heirs of both sexes goes two to one, and the barred get nothing", () => {
  // с. 103, пример 5: 400 000 — вопрос 94 самой книги, с недопущенной внучкой.
  const heirs = [
    WIFE,
    { label: "два сына", count: 2, residue: 2 },
    { label: "дочь", count: 1, residue: 1 },
    { label: "дочь сына", count: 1, blocked: "не допущена сыновьями" },
  ];
  assert.equal(estateMoney(heirs, "жена", 400000), 50000);
  assert.equal(estateMoney(heirs, "два сына", 400000), 140000, "каждому сыну — доля двух дочерей");
  assert.equal(estateMoney(heirs, "дочь", 400000), 70000);
  assert.equal(estateMoney(heirs, "дочь сына", 400000), 0, "недопущенная не получает ничего");
});

test("the shares overrunning the base reduce every heir alike", () => {
  // с. 107, пример 1: 700 000 между мужем и двумя родными сёстрами — основа 6, новая 7.
  const sisters = [
    { label: "муж", count: 1, fard: [1, 2], spouse: true },
    { label: "две родные сестры", count: 2, fard: [2, 3] },
  ];
  assert.equal(estateMoney(sisters, "муж", 700000), 300000);
  assert.equal(estateMoney(sisters, "две родные сестры", 700000), 200000);

  // с. 109, пример 3: 270 000 — основа 24, новая 27; вопрос 95 книги с одной женой.
  const family = [
    WIFE,
    { label: "отец", count: 1, fard: [1, 6] },
    { label: "мать", count: 1, fard: [1, 6] },
    { label: "две дочери", count: 2, fard: [2, 3] },
  ];
  assert.equal(estateMoney(family, "жена", 270000), 30000);
  assert.equal(estateMoney(family, "отец", 270000), 40000, "остатка уже нет, отцу только его шестая");
  assert.equal(estateMoney(family, "мать", 270000), 40000);
  assert.equal(estateMoney(family, "две дочери", 270000), 80000);
});

test("a remainder with no residuary heir is returned, and never to a spouse", () => {
  // с. 111, пример 1: 800 000 между дочерью и матерью — основа 6, новая 4.
  const pair = [
    { label: "дочь", count: 1, fard: [1, 2] },
    { label: "мать", count: 1, fard: [1, 6] },
  ];
  assert.equal(estateMoney(pair, "дочь", 800000), 600000);
  assert.equal(estateMoney(pair, "мать", 800000), 200000);

  // с. 112, пример 2: тот же случай с мужем — вопрос 96. Муж берёт свою четверть
  // от всего, и только остальное приращивается: супруг в радде не участвует.
  const withHusband = [...pair, { label: "муж", count: 1, fard: [1, 4], spouse: true }];
  assert.equal(estateMoney(withHusband, "муж", 800000), 200000);
  assert.equal(estateMoney(withHusband, "дочь", 800000), 450000);
  assert.equal(estateMoney(withHusband, "мать", 800000), 150000);
});

test("every estate case of the topic pays out in whole money, whatever the seed", () => {
  for (const drill of topicDrills(mirath).filter((item) => item.kind === "estate")) {
    for (let seed = 1; seed <= 120; seed += 1) {
      const task = buildTask(drill, seed);
      assert.ok(Number.isInteger(task.answer), `${drill.id}: доля вышла не целой при сиде ${seed}`);
      assert.ok(task.answer >= 0, `${drill.id}: отрицательная доля при сиде ${seed}`);
      assert.match(task.prompt, /Сколько наследует /);
      assert.ok(task.note.includes("Основа долей"), `${drill.id}: разбор не называет основу долей`);
    }
  }
});

test("a task about a row of several people asks for one of them, in Russian that parses", () => {
  for (const drill of topicDrills(mirath).filter((item) => item.kind === "estate")) {
    for (const item of drill.cases) {
      for (const heir of item.heirs) {
        if (heir.count > 1) {
          assert.ok(heir.each, `${drill.id}: «${heir.label}» — не сказано, как назвать одного из них`);
          assert.match(heir.each, /^кажд(ый|ая) из /, `${drill.id}: «${heir.each}» не называет одного человека`);
        }
      }
    }
    // Собранная фраза не должна досказывать род за строку: «три жены — каждый
    // из них» и читалось бы как вопрос про долю всей группы, и было бы неверно
    // по-русски, а ответ здесь — доля одного человека.
    for (let seed = 1; seed <= 80; seed += 1) {
      const task = buildTask(drill, seed);
      assert.doesNotMatch(task.prompt, /— каждый из них/, `${drill.id}: род досказан за строку`);
      assert.doesNotMatch(task.note, /каждому\./, `${drill.id}: разбор досказывает род за строку`);
    }
  }
});

test("the donkey case leaves the full brother with nothing, as the hanafis hold", () => {
  const heirs = [
    { label: "муж", count: 1, fard: [1, 2], spouse: true },
    { label: "мать", count: 1, fard: [1, 6] },
    { label: "два единоутробных брата", count: 2, fard: [1, 3] },
    { label: "родной брат", count: 1, residue: 2 },
  ];
  assert.equal(estateMoney(heirs, "родной брат", 600000), 0);
  assert.equal(estateMoney(heirs, "муж", 600000), 300000);
  assert.equal(estateMoney(heirs, "мать", 600000), 100000);
  assert.equal(estateMoney(heirs, "два единоутробных брата", 600000), 100000);
});

test("the madhhabs are sorted by what each of them actually says", () => {
  const drill = mirathDrills["drill-madhhab"];
  assert.deepEqual(drill.buckets, ["Ханафиты", "Маликиты", "Шафииты", "Ханбалиты"]);
  // По одному ответу на мазхаб: разногласие здесь не в самом убийстве, а в его видах.
  assert.equal(drill.items.length, drill.buckets.length);
  assert.equal(new Set(drill.items.map((item) => item.bucket)).size, drill.buckets.length);
  assert.equal(drill.size, drill.buckets.length, "иначе мазхаб выпадет из задания");

  const bucket = Object.fromEntries(drill.items.map((item) => [drill.buckets[item.bucket], item.label]));
  assert.match(bucket["Ханафиты"], /кысас|каффара/);
  assert.match(bucket["Шафииты"], /любой вид/i);
  assert.match(bucket["Ханбалиты"], /кроме правомерного/);
});

test("what is paid out of the estate keeps its order", () => {
  const actions = mirathDrills["drill-order-actions"].items;
  assert.equal(actions.length, 4);
  assert.match(actions[0], /похорон/i);
  assert.match(actions[1], /долг/i);
  assert.match(actions[2], /завещани/i);
  assert.match(actions[3], /Наследование/);

  const debts = mirathDrills["drill-order-debts"].items;
  assert.equal(debts.length, 4);
  assert.match(debts[1], /Всевышним/, "долг перед Аллахом — второй вид");
  assert.match(debts[3], /предсмертной болезни/);
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
