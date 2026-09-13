/**
 * The drills of the memorisation part: the tasks that are generated instead of
 * being stored.
 *
 * A table is not learnt when its rows can be recited — it is learnt when any
 * number can be answered from it. The book itself asks the topic this way («26
 * верблюдов — ?», «190 овец — ?»), so the same question with a different number
 * every time is not a trick of ours but the shape of the material. Generated
 * from a seed rather than at random, so a task can be shown again, tested, and
 * rendered identically wherever it is built.
 */
import { nounForm, plural, seededShuffle } from "../content/questions.ts";
import type { Drill, MoneyDrill, ShareDrill, SortDrill, StepsDrill } from "../content/topics/types.ts";

/** Feminine numerals, which is what the counted animals here need. */
const NUMERALS = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять"];

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** «Шесть овец» rather than «6 овец» — the book counts them in words. */
export function countInWords(count: number, noun: [string, string, string]) {
  const numeral = count <= 10 ? NUMERALS[count] : String(count);
  return capitalize(`${numeral} ${nounForm(count, ...noun)}`);
}

/**
 * What a herd of this size owes.
 *
 * The steps are read in order and the last one reached wins, so the table is
 * written the way the book writes it — a threshold and what is due from it —
 * with no ranges to keep consistent. Past the last threshold a herd may grow by
 * whole hundreds, and then the answer is counted rather than looked up.
 */
export function dueFor(drill: StepsDrill, count: number) {
  if (drill.cycle && count >= drill.cycle.from) {
    return `${countInWords(Math.floor(count / drill.cycle.every), drill.cycle.noun)}.`;
  }
  let due = drill.below;
  for (const step of drill.steps) {
    if (count >= step.from) due = step.due;
  }
  return due;
}

export type ChoiceTask = {
  drillId: string;
  kind: "choice";
  title: string;
  prompt: string;
  answer: string;
  options: string[];
  note?: string;
  page: number;
};

export type NumberTask = {
  drillId: string;
  kind: "number";
  title: string;
  prompt: string;
  answer: number;
  /** The answer as it is spelled out once it is revealed. */
  answerLabel: string;
  note: string;
  page: number;
};

export type SortTask = {
  drillId: string;
  kind: "sort";
  title: string;
  prompt: string;
  buckets: [string, string];
  items: { label: string; bucket: 0 | 1; note?: string }[];
  page: number;
};

export type DrillTask = ChoiceTask | NumberTask | SortTask;

/** A number that differs every time a drill comes up, and never at random. */
export function taskSeed(unitId: string, date: string, reps: number) {
  let hash = 7;
  for (const char of `${unitId}|${date}|${reps}`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash || 1;
}

/** A value from the sequence min, min + step, … up to max. */
function pick(seed: number, min: number, max: number, step = 1) {
  const slots = Math.floor((max - min) / step) + 1;
  return min + (seed % slots) * step;
}

function stepsTask(drill: StepsDrill, seed: number): ChoiceTask {
  const count = pick(seed, drill.range[0], drill.range[1]);
  const answer = dueFor(drill, count);

  // Every other answer the table can give, including one from the open-ended
  // tail: the alternatives a learner has to rule out are the table's own rows,
  // not invented ones.
  const others = new Set<string>([drill.below, ...drill.steps.map((step) => step.due)]);
  if (drill.cycle) {
    for (const heads of [4, 5, 6, 7]) {
      others.add(`${countInWords(heads, drill.cycle.noun)}.`);
    }
  }
  others.delete(answer);

  const options = seededShuffle([answer, ...seededShuffle([...others], seed).slice(0, 3)], seed + 1);
  return {
    drillId: drill.id,
    kind: "choice",
    title: drill.title,
    prompt: drill.prompt.replace("{n}", plural(count, ...drill.noun)),
    answer,
    options,
    page: drill.page,
  };
}

function shareTask(drill: ShareDrill, seed: number): NumberTask {
  const variant = drill.variants[seed % drill.variants.length];
  const base = pick(Math.floor(seed / drill.variants.length), drill.range[0], drill.range[1], drill.step);
  const answer = base / variant.per;
  return {
    drillId: drill.id,
    kind: "number",
    title: drill.title,
    prompt: drill.prompt
      .replace("{base}", plural(base, ...drill.unit))
      .replace("{variant}", variant.label),
    answer,
    answerLabel: plural(answer, ...drill.unit),
    note: `Одна ${variant.per === 10 ? "десятая" : "двадцатая"} часть: ${base} ÷ ${variant.per} = ${answer}.`,
    page: drill.page,
  };
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString("ru-RU")} ${currency}`;
}

function moneyTask(drill: MoneyDrill, seed: number): NumberTask {
  const price = drill.prices[seed % drill.prices.length];
  const assets = pick(Math.floor(seed / drill.prices.length), drill.range[0], drill.range[1], drill.step);
  const debt = drill.debts[Math.floor(seed / (drill.prices.length * 7)) % drill.debts.length];

  const nisab = drill.nisabGrams * price;
  const net = assets - debt;
  const due = net >= nisab ? net * drill.rate : 0;

  const money = (value: number) => formatMoney(value, drill.currency);
  const debtLine = debt > 0 ? `, и на нём долг ${money(debt)}` : ", долгов на нём нет";
  return {
    drillId: drill.id,
    kind: "number",
    title: drill.title,
    prompt:
      `У мусульманина ${money(assets)} накоплений${debtLine}. Год прошёл, ` +
      `грамм золота стоит ${money(price)}. Сколько закята он выплачивает? ` +
      `Если закята нет — ответ 0.`,
    answer: due,
    answerLabel: due === 0 ? "Закята нет" : money(due),
    note:
      `Нисаб — ${drill.nisabGrams} г золота, то есть ${money(nisab)}. ` +
      `Имущество за вычетом долга: ${money(net)} — ` +
      (net >= nisab
        ? `это нисаб или больше, значит два с половиной процента: ${money(due)}.`
        : `это меньше нисаба, значит закята нет.`),
    page: drill.page,
  };
}

/**
 * A handful of the items, always with both buckets represented: a task where
 * every answer is «нельзя» teaches the learner to answer without reading.
 */
function sortTask(drill: SortDrill, seed: number): SortTask {
  const shuffled = seededShuffle(drill.items, seed);
  const items = shuffled.slice(0, drill.size);
  if (items.every((item) => item.bucket === items[0].bucket)) {
    const other = shuffled.find((item) => item.bucket !== items[0].bucket);
    if (other) items[items.length - 1] = other;
  }
  return {
    drillId: drill.id,
    kind: "sort",
    title: drill.title,
    prompt: drill.prompt,
    buckets: drill.buckets,
    items: seededShuffle(items, seed + 1),
    page: drill.page,
  };
}

export function buildTask(drill: Drill, seed: number): DrillTask {
  switch (drill.kind) {
    case "steps":
      return stepsTask(drill, seed);
    case "share":
      return shareTask(drill, seed);
    case "money":
      return moneyTask(drill, seed);
    case "sort":
      return sortTask(drill, seed);
  }
}
