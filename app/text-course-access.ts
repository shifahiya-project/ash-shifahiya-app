// What the third and fourth courses need to know about a learner, and the rules
// that are the same for both: a card's address, which lessons a learner holds
// cards for, and how far the course is open. Each course keeps its own gate —
// what has to be finished before it starts — in its own module beside this one.
//
// Types only from the store, like the gates for the courses before them, so the
// tests can import this module without pulling in the browser-bound store.
import type { ReadingCourseSession } from "./progress-store.ts";

/** What a text course needs to know about a learner. */
export type TextCourseProgress = {
  /** Result of each finished lesson, by lesson id. */
  scores: Record<number, number>;
  sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/**
 * A card of a text course. The box it lives in is the same one every course
 * uses — one daily queue for the whole language — but the address says which
 * course the word came from.
 */
export function textCourseCardId(
  prefix: string,
  lessonId: number,
  wordIndex: number,
  direction: "ar-ru" | "ru-ar",
) {
  return `${prefix}-lesson-${lessonId}-word-${wordIndex}-${direction}`;
}

/** Lessons of one course the learner holds review cards for. */
export function textCourseLessonIdsInCards(prefix: string, cards: Record<string, unknown>) {
  const pattern = new RegExp(`^${prefix}-lesson-(\\d+)-word-`);
  const ids = new Set<number>();
  for (const id of Object.keys(cards)) {
    const match = id.match(pattern);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids];
}

/** True when every lesson of a course has been finished. */
export function isCourseFinished(summaries: { id: number }[], scores: Record<number, number>) {
  return summaries.length > 0 && summaries.every((summary) => scores[summary.id] !== undefined);
}

/**
 * Which lessons of a text course are open. The book runs in order, like the
 * courses before it, and — as there too — ground already covered is never taken
 * back: everything up to the furthest lesson touched stays open.
 */
export function unlockedTextCourseIds(
  prefix: string,
  summaries: { id: number }[],
  progress: TextCourseProgress,
  open: boolean,
): Set<number> {
  if (!open) return new Set();

  const touched = new Set<number>([
    ...Object.keys(progress.scores).map(Number),
    ...Object.keys(progress.sessions).map(Number),
    ...textCourseLessonIdsInCards(prefix, progress.cards),
  ]);

  let reached = -1;
  summaries.forEach((summary, index) => {
    if (touched.has(summary.id)) reached = index;
  });

  const unlocked = new Set<number>();
  summaries.forEach((summary, index) => {
    const previous = summaries[index - 1];
    if (!previous || index <= reached || progress.scores[previous.id] !== undefined) {
      unlocked.add(summary.id);
    }
  });
  return unlocked;
}
