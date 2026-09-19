/**
 * The memorisation part: a topic the learner wants to hold in memory, taken
 * from a book they read themselves.
 *
 * The app deliberately does not carry the text. The learner reads the pages in
 * their own copy; what lives here is what reading alone does not give —
 * questions that force recall, a schedule that brings them back, and drills
 * that make the tables of the topic calculable rather than merely recognised.
 * Every unit therefore names the page it came from: the answer on the screen
 * has to be checkable against the book in one move.
 */

/** An ayah or a hadith the book cites for a rule, kept with the rule it proves. */
export type Evidence = { text: string; source: string };

/**
 * One thing worth remembering, in the form the learner will be asked it.
 *
 * A `fact` has one answer; a `list` is an enumeration that has to come back
 * whole, and is checked item by item rather than by a single yes or no —
 * half a list is what actually happens in memory, and a card that cannot see
 * the difference teaches the learner to accept it.
 */
export type Atom = {
  id: string;
  kind: "fact" | "list";
  question: string;
  /** The answer for a fact; for a list, the line that frames its items. */
  answer: string;
  items?: string[];
  note?: string;
  /**
   * What did not add up when the topic was checked against the book: a rule the
   * book states twice and differently, a number it prints two ways, a question
   * it asks about what it never listed. The card keeps what the book says and
   * carries the remark behind a «?», for the author to settle against the
   * original — the alternative is deciding it here, which is not this file's
   * call to make.
   */
  check?: string;
  evidence?: Evidence;
  /**
   * Wrong answers for the recognition step, written by hand where the
   * confusable alternative is the whole point (85 г against 595 г). Left out,
   * the options are ranked out of the topic's own answers instead.
   */
  options?: string[];
  /** The page of the book this is taken from, where the book has pages. */
  page?: number;
  /**
   * Where the answer is, when the book is not read on paper: the name of its
   * section. The rule is unchanged — the answer on the screen has to be
   * checkable against the original in one move — only the address is, because
   * a manuscript read inside this app has sections and no page numbers.
   */
  where?: string;
};

/**
 * A table of thresholds: so many head, so much due. Generated rather than
 * listed, because the table is learnt when any number can be answered from it,
 * not when its rows can be recited.
 */
export type StepsDrill = {
  id: string;
  kind: "steps";
  title: string;
  /** Carries {n}, replaced by the generated count with its noun. */
  prompt: string;
  /** 1 верблюд, 2 верблюда, 5 верблюдов. */
  noun: [string, string, string];
  /** What is due below the first threshold. */
  below: string;
  steps: { from: number; due: string }[];
  /** Past `from`, one more of `due` for every `every` head. */
  cycle?: { from: number; every: number; noun: [string, string, string] };
  /** Counts the generator may offer, inclusive. */
  range: [number, number];
  page?: number;
  where?: string;
};

/** A fraction of a harvest: the same amount, a tenth or a twentieth of it. */
export type ShareDrill = {
  id: string;
  kind: "share";
  title: string;
  /** Carries {base} and {variant}. */
  prompt: string;
  unit: [string, string, string];
  /** Each way the fraction can go: «естественное орошение» → a tenth. */
  variants: { label: string; per: number }[];
  /** Amounts are multiples of `step` between the two bounds. */
  range: [number, number];
  step: number;
  page?: number;
  where?: string;
};

/** Assets against a nisab, and the rate on what is left of them. */
export type MoneyDrill = {
  id: string;
  kind: "money";
  title: string;
  currency: string;
  /** Prices of a gram of gold the task may quote, so the sum is never memorised. */
  prices: number[];
  nisabGrams: number;
  /** Two and a half percent, as a fraction. */
  rate: number;
  /** Amounts are multiples of `step` between the two bounds. */
  range: [number, number];
  step: number;
  /** Debts the task may put against the assets; a zero belongs here too. */
  debts: number[];
  page?: number;
  where?: string;
};

/**
 * Buckets and things to put in them: allowed against forbidden, or a ruling
 * against the two rulings it is confused with. Two or three — fiqh sorts by
 * three often enough (фард, ваджиб, сунна) that a pair would force the same
 * material into two half-drills.
 */
export type SortDrill = {
  id: string;
  kind: "sort";
  title: string;
  prompt: string;
  buckets: string[];
  items: { label: string; bucket: number; note?: string }[];
  /** How many of the items one task offers. */
  size: number;
  page?: number;
  where?: string;
};

/**
 * A rite is a sequence, and knowing its parts is not knowing their order.
 * The whole order is stored; a task asks for a window of it, so the same
 * sequence is drilled from a different place each time.
 */
export type OrderDrill = {
  id: string;
  kind: "order";
  title: string;
  prompt: string;
  /** The steps in the order they are performed. */
  items: string[];
  /** How many consecutive steps one task offers. */
  size: number;
  page?: number;
  where?: string;
};

/**
 * One heir in an estate to be divided: how the task names the row, how many
 * people share it, and what the book gives them — a fixed share of the whole,
 * a residuary's weight (two for a man against one for a woman), or nothing at
 * all because someone present bars them.
 */
export type EstateHeir = {
  label: string;
  /** How many people share the row; the task asks about one of them. */
  count: number;
  /**
   * How to name one person of the row, when the row holds several: «каждая из
   * трёх жён». Written out because Russian declines it and a generated «три
   * жены — каждый из них» is both ungrammatical and ambiguous — it reads as a
   * question about the group's total, which is not what the answer is.
   */
  each?: string;
  /** The fixed share (фард) of the whole, as [numerator, denominator]. */
  fard?: [number, number];
  /** A residuary's weight per person: 2 for a man, 1 for a woman. */
  residue?: number;
  /** Named in the task and given nothing, because the learner has to know it. */
  blocked?: string;
  /** A spouse, who is left out when a remainder is returned by радд. */
  spouse?: boolean;
};

/** One configuration of heirs, and the rule the case turns on. */
export type EstateCase = { heirs: EstateHeir[]; note: string };

/**
 * The whole arithmetic of an estate: the base of shares (асль), each heir's
 * share (сахм), what a share is worth (кымат ас-сахм), and the money that
 * leaves every heir — including the two corrections, `ауль when the shares
 * overrun the base and радд when they fall short of it.
 *
 * A task asks about one heir at a time. That is not a smaller question than
 * the book's: to name one heir's money the learner has to find the base, share
 * out every фард, see whether the case needs a correction and value a share —
 * the same walk either way, and a single number that can be checked exactly.
 * The sum is chosen so that every answer is whole money, never a rounding.
 */
export type EstateDrill = {
  id: string;
  kind: "estate";
  title: string;
  currency: string;
  cases: EstateCase[];
  /**
   * Sizes the estate: the sum offered is one of these times the smallest
   * factor that leaves every heir whole money. It is therefore not the value
   * of a share — that follows from the base, and a correction can change it.
   */
  values: number[];
  page?: number;
  where?: string;
};

export type Drill = StepsDrill | ShareDrill | MoneyDrill | SortDrill | OrderDrill | EstateDrill;

/**
 * One sitting: pages to read in the book, the theses that hold them together,
 * and the units those pages are checked by.
 */
export type TopicStep = {
  id: string;
  title: string;
  /** As the book numbers them, e.g. «98–99». */
  pages: string;
  /** Our own short theses — a map of the reading, never a replacement for it. */
  brief: string[];
  atoms: Atom[];
  drills?: Drill[];
};

/**
 * A question of the book's own review list. The reference answer is assembled
 * from the atoms it names rather than written again here: two copies of the
 * same rule would drift apart at the first correction, and a question answered
 * badly has to send those very atoms back to the start of the schedule.
 */
export type TopicExamQuestion = {
  id: string;
  prompt: string;
  atoms: string[];
  /** Said only where the question asks for something no atom carries. */
  extra?: string;
  /** As on an atom: what did not add up, kept behind a «?». */
  check?: string;
};

export type Topic = {
  id: string;
  title: string;
  subtitle: string;
  source: { book: string; section: string; pages: string; note?: string };
  intro: string;
  steps: TopicStep[];
  exam: { title: string; intro: string; questions: TopicExamQuestion[] };
};

/** Every unit of a topic that the schedule can hold a card for. */
export type TopicUnit = Atom | Drill;

/**
 * How a unit names its place in the book: «с. 98» for a printed edition, or the
 * section itself for a book that has no pages. The screen says one or the
 * other, never «с.» in front of a section name — a label that lies about what
 * it points at is worse than no label.
 */
export function citeOf(unit: { page?: number; where?: string }) {
  if (unit.where) return unit.where;
  return unit.page === undefined ? "" : `с. ${unit.page}`;
}

/** The same for a step or a whole topic, whose range is already a string. */
export function citeRange(range: string) {
  return /^\d/.test(range) ? `с. ${range}` : range;
}

export function stepUnits(step: TopicStep): TopicUnit[] {
  return [...step.atoms, ...(step.drills ?? [])];
}

export function topicUnits(topic: Topic): TopicUnit[] {
  return topic.steps.flatMap(stepUnits);
}

export function topicAtoms(topic: Topic): Atom[] {
  return topic.steps.flatMap((step) => step.atoms);
}

export function topicDrills(topic: Topic): Drill[] {
  return topic.steps.flatMap((step) => step.drills ?? []);
}

/** True for the units that are generated fresh every time they come up. */
export function isDrill(unit: TopicUnit): unit is Drill {
  return "kind" in unit && unit.kind !== "fact" && unit.kind !== "list";
}
