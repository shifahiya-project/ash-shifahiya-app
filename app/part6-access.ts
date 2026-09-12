// The sixth course's gate, built on the same shared rules as the three before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the sixth course needs to know about a learner. */
export type Part6Progress = {
  /** Result of each finished lesson, by lesson id. */
  part6Scores: Record<number, number>;
  part6Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the sixth course are addressed p6-lesson-… */
const PREFIX = "p6";

export function part6CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Sixth-course lessons the learner holds review cards for. */
export function part6LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The sixth course opens to whoever has finished the fifth one whole — the
 * chain every course here follows, and here it is also the classical order:
 * بَلَاغَة is read after صَرْف and نَحْو, because rhetoric weighs a sentence that
 * grammar has already made correct.
 */
export function isPart6Open(
  part5Summaries: { id: number }[],
  part5Scores: Record<number, number>,
) {
  return isCourseFinished(part5Summaries, part5Scores);
}

/** Which lessons of the sixth course are open. */
export function unlockedPart6Ids(
  summaries: { id: number }[],
  progress: Part6Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part6Scores,
    sessions: progress.part6Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
