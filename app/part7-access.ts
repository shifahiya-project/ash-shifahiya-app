// The seventh course's gate, built on the same shared rules as the four before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the seventh course needs to know about a learner. */
export type Part7Progress = {
  /** Result of each finished lesson, by lesson id. */
  part7Scores: Record<number, number>;
  part7Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the seventh course are addressed p7-lesson-… */
const PREFIX = "p7";

export function part7CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Seventh-course lessons the learner holds review cards for. */
export function part7LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The seventh course opens to whoever has finished the sixth one whole. Logic
 * comes last of the language sciences because it is not one of them: مَنْطِق
 * weighs an argument rather than a sentence, and the books of the courses
 * before it are the arguments a learner will weigh.
 */
export function isPart7Open(
  part6Summaries: { id: number }[],
  part6Scores: Record<number, number>,
) {
  return isCourseFinished(part6Summaries, part6Scores);
}

/** Which lessons of the seventh course are open. */
export function unlockedPart7Ids(
  summaries: { id: number }[],
  progress: Part7Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part7Scores,
    sessions: progress.part7Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
