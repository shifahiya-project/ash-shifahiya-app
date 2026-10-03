// The eleventh course's gate, built on the same shared rules as the courses before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the eleventh course needs to know about a learner. */
export type Part11Progress = {
  /** Result of each finished lesson, by lesson id. */
  part11Scores: Record<number, number>;
  part11Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the eleventh course are addressed p11-lesson-… */
const PREFIX = "p11";

export function part11CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Eleventh-course lessons the learner holds review cards for. */
export function part11LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/** The tafsir course opens after all forty-hadith lessons are finished. */
export function isPart11Open(
  part10Summaries: { id: number }[],
  part10Scores: Record<number, number>,
) {
  return isCourseFinished(part10Summaries, part10Scores);
}

/** Which lessons of the eleventh course are open. */
export function unlockedPart11Ids(
  summaries: { id: number }[],
  progress: Part11Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part11Scores,
    sessions: progress.part11Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
