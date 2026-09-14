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
import type {
  Drill,
  EstateCase,
  EstateDrill,
  EstateHeir,
  MoneyDrill,
  OrderDrill,
  ShareDrill,
  SortDrill,
  StepsDrill,
} from "../content/topics/types.ts";

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
  buckets: string[];
  items: { label: string; bucket: number; note?: string }[];
  page: number;
};

export type OrderTask = {
  drillId: string;
  kind: "order";
  title: string;
  prompt: string;
  /** The steps as they are offered, shuffled. */
  items: string[];
  /** The same steps in the order they are performed. */
  answer: string[];
  page: number;
};

export type DrillTask = ChoiceTask | NumberTask | SortTask | OrderTask;

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
 * A handful of the items, with every bucket represented as long as the task
 * has room for them: a task where each answer is «нельзя» teaches the learner
 * to answer without reading, and one that quietly drops the third ruling
 * teaches that there are two.
 */
function sortTask(drill: SortDrill, seed: number): SortTask {
  const shuffled = seededShuffle(drill.items, seed);
  const items: typeof shuffled = [];
  // One from each bucket first, in the shuffled order, then fill up.
  for (const bucket of drill.buckets.keys()) {
    if (items.length >= drill.size) break;
    const found = shuffled.find((item) => item.bucket === bucket);
    if (found) items.push(found);
  }
  for (const item of shuffled) {
    if (items.length >= drill.size) break;
    if (!items.includes(item)) items.push(item);
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

/**
 * A window of the sequence, offered out of order.
 *
 * A window rather than the whole rite: the point is to know what follows what,
 * and that is asked better five times from five places than once from the
 * beginning. A shuffle that happens to come out already solved is reshuffled —
 * a task whose answer is the question checks nothing.
 */
function orderTask(drill: OrderDrill, seed: number): OrderTask {
  const size = Math.min(drill.size, drill.items.length);
  const start = seed % (drill.items.length - size + 1);
  const answer = drill.items.slice(start, start + size);

  let items = seededShuffle(answer, seed + 1);
  for (let attempt = 2; attempt < 8 && items.every((item, index) => item === answer[index]); attempt += 1) {
    items = seededShuffle(answer, seed + attempt);
  }

  return {
    drillId: drill.id,
    kind: "order",
    title: drill.title,
    prompt: drill.prompt,
    items,
    answer,
    page: drill.page,
  };
}

/* ——— Раздел наследства: асль, сахм, кымат ас-сахм, `ауль и радд ——— */

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function lcm(a: number, b: number) {
  return Math.abs(a * b) / gcd(a, b);
}

/** One person's share of the estate, kept exact until it is turned into money. */
type Share = { heir: EstateHeir; num: number; den: number };

/**
 * What each heir gets, as an exact fraction of the estate.
 *
 * The base (асль) is the common denominator of the fixed shares; a residuary
 * takes what the fixed shares leave. Two corrections can apply, and which one
 * is never declared in the data — it follows from the arithmetic, exactly as
 * it does in the book: the shares overrunning the base is `ауль, and falling
 * short of it with no residuary present is радд.
 */
function estateShares(heirs: EstateHeir[]) {
  const present = heirs.filter((heir) => !heir.blocked);
  const fixed = present.filter((heir) => heir.fard);
  const residuary = present.filter((heir) => heir.residue);

  const base = fixed.length
    ? fixed.map((heir) => heir.fard![1]).reduce(lcm, 1)
    : present.reduce((sum, heir) => sum + heir.count * (heir.residue ?? 0), 0);

  const sahm = new Map<EstateHeir, number>();
  for (const heir of fixed) sahm.set(heir, (base / heir.fard![1]) * heir.fard![0]);
  const claimed = fixed.reduce((sum, heir) => sum + sahm.get(heir)!, 0);
  const weight = residuary.reduce((sum, heir) => sum + heir.count * heir.residue!, 0);

  const shares: Share[] = [];
  let mode: "plain" | "awl" | "radd" = "plain";

  if (claimed > base) {
    // `ауль: the shares themselves become the base, and nothing is left over.
    mode = "awl";
    for (const heir of fixed) shares.push({ heir, num: sahm.get(heir)!, den: claimed * heir.count });
  } else if (claimed < base && !residuary.length) {
    // Радд: a spouse keeps their share of the whole, the rest is returned to
    // the others in proportion to the shares they already hold.
    mode = "radd";
    const spouses = fixed.filter((heir) => heir.spouse);
    const rest = fixed.filter((heir) => !heir.spouse);
    const spouseNum = spouses.reduce((sum, heir) => sum + sahm.get(heir)!, 0);
    const restSahm = rest.reduce((sum, heir) => sum + sahm.get(heir)!, 0);
    for (const heir of spouses) shares.push({ heir, num: sahm.get(heir)!, den: base * heir.count });
    for (const heir of rest) {
      shares.push({
        heir,
        num: (base - spouseNum) * sahm.get(heir)!,
        den: base * restSahm * heir.count,
      });
    }
  } else {
    for (const heir of fixed) shares.push({ heir, num: sahm.get(heir)!, den: base * heir.count });
    for (const heir of residuary) {
      shares.push({ heir, num: (base - claimed) * heir.residue!, den: base * weight });
    }
  }

  for (const heir of present) {
    if (!sahm.has(heir) && !heir.residue) shares.push({ heir, num: 0, den: 1 });
  }
  for (const heir of heirs.filter((heir) => heir.blocked)) shares.push({ heir, num: 0, den: 1 });

  return { base, claimed, mode, newBase: mode === "awl" ? claimed : base, shares };
}

/** The smallest estate that leaves every heir whole money. */
function estateScale(shares: Share[]) {
  return shares.reduce((acc, share) => lcm(acc, share.den / gcd(share.num, share.den)), 1);
}

function estateNote(drill: EstateDrill, item: EstateCase, asked: Share, total: number) {
  const money = (value: number) => formatMoney(value, drill.currency);
  const { base, claimed, mode, newBase } = estateShares(item.heirs);
  const correction =
    mode === "awl"
      ? `Долей вышло больше основы (${claimed} против ${base}), поэтому доли уменьшаются: новая основа — ${claimed}. `
      : mode === "radd"
        ? `Долей вышло меньше основы (${claimed} против ${base}), а наследника конечной доли нет, поэтому остаток возвращается: это приращение долей. `
        : "";
  const value = total / newBase;
  const own = asked.heir.blocked
    ? `${capitalize(asked.heir.label)} не наследует: ${asked.heir.blocked}.`
    : `${capitalize(asked.heir.label)} — ${money((asked.num / asked.den) * total)}${asked.heir.count > 1 ? " каждому" : ""}.`;
  return (
    `Основа долей — ${base}. ${correction}` +
    (mode === "radd" ? "" : `Стоимость доли — ${money(total)} ÷ ${newBase} = ${money(value)}. `) +
    `${own} ${item.note}`
  );
}

function estateTask(drill: EstateDrill, seed: number): NumberTask {
  const item = drill.cases[seed % drill.cases.length];
  const rest = Math.floor(seed / drill.cases.length);
  const { shares } = estateShares(item.heirs);
  const total = drill.values[rest % drill.values.length] * estateScale(shares);
  const asked = shares[Math.floor(rest / drill.values.length) % shares.length];

  const roll = item.heirs.map((heir) => heir.label).join(", ");
  const answer = Math.round((asked.num / asked.den) * total);
  return {
    drillId: drill.id,
    kind: "number",
    title: drill.title,
    prompt:
      `После наследодателя, имевшего ${formatMoney(total, drill.currency)}, остались: ${roll}. ` +
      `Сколько наследует ${asked.heir.label}${asked.heir.count > 1 ? " — каждый из них" : ""}? ` +
      `Если не наследует — ответ 0.`,
    answer,
    answerLabel: answer === 0 ? "Не наследует" : formatMoney(answer, drill.currency),
    note: estateNote(drill, item, asked, total),
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
    case "order":
      return orderTask(drill, seed);
    case "estate":
      return estateTask(drill, seed);
  }
}
