/**
 * The clock of the memorisation part: when a unit of a topic comes back and in
 * what form it is asked.
 *
 * Kept apart from the course's own boxes on purpose. A word of the course is
 * drilled in two directions and is either right or wrong; a rule of a book is
 * understood first and recalled afterwards, and the honest grade for it is
 * three-valued — it came back, it came back with effort, it did not come. So
 * this schedule takes a grade rather than a verdict, and it does not put its
 * cards into the course's daily queue: mixing them would change what the course
 * promises for the day.
 */
import type { TopicUnit } from "../content/topics/types.ts";
import { isDrill } from "../content/topics/types.ts";

/**
 * Days between repeats, by box. The first four cover the week in which almost
 * everything is lost, the last one is a quarter: a topic learnt to be kept is
 * not learnt to an exam date, and a card that survives three months is a card
 * the learner owns.
 */
export const TOPIC_INTERVALS = [0, 1, 3, 7, 16, 35, 90];

export const LAST_TOPIC_BOX = TOPIC_INTERVALS.length - 1;

/** What the learner says about their own recall. */
export type TopicGrade = "again" | "hard" | "good";

export type TopicCard = {
  box: number;
  nextReview: string;
  lastSeen: string;
  reps: number;
  /** How many times it was forgotten after having been known. */
  lapses: number;
};

/** How a unit is asked this time round. */
export type TopicMode = "choice" | "recall" | "list" | "drill";

/**
 * The day a review lands on, counted from noon like every other date here, and
 * read off the local calendar rather than through toISOString: noon answers as
 * the same day in UTC for every offset from -11 to +12, but as the day before
 * for +13 and +14, which would hand a learner in Samoa or Kiribati a schedule
 * running a day behind their own.
 */
export function topicDate(daysFromNow = 0, today = new Date()) {
  const date = new Date(today);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A card's address: the topic it belongs to and the unit inside it. */
export function cardKey(topicId: string, unitId: string) {
  return `${topicId}:${unitId}`;
}

/**
 * Moves a card along after an answer.
 *
 * Forgetting sends it back to the start and is counted: a card with lapses
 * behind it is one the learner should see the list of. Recalling with effort
 * holds the interval instead of stretching it — the point of the grade is that
 * it is not the same as knowing. Only a clean recall lengthens the wait.
 */
export function nextTopicCard(
  previous: TopicCard | undefined,
  grade: TopicGrade,
  today = new Date(),
): TopicCard {
  const current = previous?.box ?? 0;
  const box =
    grade === "again" ? 0 : grade === "hard" ? current : Math.min(current + 1, LAST_TOPIC_BOX);
  const lapsed = grade === "again" && current > 0;
  return {
    box,
    nextReview: topicDate(TOPIC_INTERVALS[box], today),
    lastSeen: topicDate(0, today),
    reps: (previous?.reps ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (lapsed ? 1 : 0),
  };
}

/**
 * Puts a unit straight into the last box when the learner already owns it.
 *
 * It still comes back after the longest interval: «выучил» skips the walk
 * through the shorter boxes, it does not remove the rule from the topic.
 */
export function masterTopicCard(previous: TopicCard | undefined, today = new Date()): TopicCard {
  return {
    box: LAST_TOPIC_BOX,
    nextReview: topicDate(TOPIC_INTERVALS[LAST_TOPIC_BOX], today),
    lastSeen: topicDate(0, today),
    reps: (previous?.reps ?? 0) + 1,
    lapses: previous?.lapses ?? 0,
  };
}

/**
 * A card sent back to the very beginning, keeping its history.
 *
 * Used by the exam: a question the learner could not answer says more about
 * the facts behind it than the last review did, and they belong in today's
 * queue no matter how far along the schedule they had travelled.
 */
export function resetTopicCard(previous: TopicCard | undefined, today = new Date()): TopicCard {
  return {
    box: 0,
    nextReview: topicDate(0, today),
    lastSeen: previous?.lastSeen ?? topicDate(0, today),
    reps: previous?.reps ?? 0,
    lapses: (previous?.lapses ?? 0) + (previous && previous.box > 0 ? 1 : 0),
  };
}

/**
 * One box back, and no further.
 *
 * The exam's middle answer needs it: a rule half-remembered under a question
 * that covers several of them is not the same failure as a blank, and sending
 * it all the way back would cost the learner weeks of real progress on the
 * strength of one imprecise self-grade.
 */
export function demoteTopicCard(previous: TopicCard | undefined, today = new Date()): TopicCard {
  const box = Math.max(0, (previous?.box ?? 0) - 1);
  return {
    box,
    nextReview: topicDate(TOPIC_INTERVALS[box], today),
    lastSeen: previous?.lastSeen ?? topicDate(0, today),
    reps: previous?.reps ?? 0,
    lapses: previous?.lapses ?? 0,
  };
}

export function isMastered(card: TopicCard | undefined) {
  return card !== undefined && card.box >= LAST_TOPIC_BOX;
}

/**
 * The units due today, in the order they were given.
 *
 * A unit nobody has met yet is not due: it has not been introduced, and the
 * queue is for coming back, not for meeting things for the first time. That is
 * what the steps are for.
 */
export function dueUnitIds(
  cards: Record<string, TopicCard>,
  topicId: string,
  unitIds: string[],
  today = topicDate(),
) {
  return unitIds.filter((id) => {
    const card = cards[cardKey(topicId, id)];
    return card !== undefined && card.nextReview <= today;
  });
}

/** A paper of the book's own review questions, kept like the course's exams. */
export type TopicExamResult = {
  best: number;
  total: number;
  attempts: number;
  lastAt: string;
  passedAt?: string;
};

export type TopicProgress = {
  total: number;
  /** Units that have been through a step at least once. */
  seen: number;
  due: number;
  mastered: number;
  /** Units seen but forgotten at least once — worth a second look. */
  shaky: number;
};

export function topicProgress(
  cards: Record<string, TopicCard>,
  topicId: string,
  unitIds: string[],
  today = topicDate(),
): TopicProgress {
  let seen = 0;
  let due = 0;
  let mastered = 0;
  let shaky = 0;
  for (const id of unitIds) {
    const card = cards[cardKey(topicId, id)];
    if (!card) continue;
    seen += 1;
    if (card.nextReview <= today) due += 1;
    if (isMastered(card)) mastered += 1;
    if (card.lapses > 0 && card.box < LAST_TOPIC_BOX) shaky += 1;
  }
  return { total: unitIds.length, seen, due, mastered, shaky };
}

/** Cards due today across every topic, which is all the home screen needs. */
export function dueCardCount(cards: Record<string, TopicCard>, today = topicDate()) {
  return Object.values(cards).filter((card) => card.nextReview <= today).length;
}

/**
 * How a unit is asked this time.
 *
 * A list is always recalled as a list — asking «which of these four» about an
 * enumeration checks nothing, because the enumeration is the answer. A fact
 * with written alternatives is offered as a choice while it is still new or has
 * just been forgotten, and by free recall from then on: recognition is a
 * foothold for the first day, not a way of passing for the tenth.
 */
export function modeFor(unit: TopicUnit, card: TopicCard | undefined): TopicMode {
  if (isDrill(unit)) return "drill";
  if (unit.kind === "list") return "list";
  const fresh = !card || card.box === 0;
  return fresh && unit.options && unit.options.length >= 2 ? "choice" : "recall";
}

/**
 * The grade a partly recalled list earns. Whole — known; at least half — with
 * effort; less than half is not recall at all, whatever it felt like.
 */
export function gradeFromRecall(recalled: number, total: number): TopicGrade {
  if (total <= 0 || recalled >= total) return "good";
  if (recalled * 2 >= total) return "hard";
  return "again";
}
