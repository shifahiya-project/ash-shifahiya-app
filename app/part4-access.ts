// The fourth course's gate, built on the same shared rules as the third's.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the fourth course needs to know about a learner. */
export type Part4Progress = {
  /** Result of each finished lesson, by lesson id. */
  part4Scores: Record<number, number>;
  part4Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the fourth course are addressed p4-lesson-… */
const PREFIX = "p4";

export function part4CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Fourth-course lessons the learner holds review cards for. */
export function part4LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The fourth course opens to whoever has finished the third one whole — the
 * same rule the third course itself opens by, and for the same reason. A book
 * of fiqh argues where the creed book stated: it answers a question, weighs
 * what others held, and settles it, and that is read once a scholarly page
 * reads at all. There is no paper between the two: the third course is the
 * preparation, and finishing it is what shows.
 */
export function isPart4Open(
  part3Summaries: { id: number }[],
  part3Scores: Record<number, number>,
) {
  return isCourseFinished(part3Summaries, part3Scores);
}

/** Which lessons of the fourth course are open. */
export function unlockedPart4Ids(
  summaries: { id: number }[],
  progress: Part4Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part4Scores,
    sessions: progress.part4Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
