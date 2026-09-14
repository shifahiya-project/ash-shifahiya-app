// The eighth course's gate, built on the same shared rules as the five before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the eighth course needs to know about a learner. */
export type Part8Progress = {
  /** Result of each finished lesson, by lesson id. */
  part8Scores: Record<number, number>;
  part8Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the eighth course are addressed p8-lesson-… */
const PREFIX = "p8";

export function part8CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Seventh-course lessons the learner holds review cards for. */
export function part8LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The eighth course opens to whoever has finished the seventh one whole — the
 * chain every course here opens by. Hadith science comes after logic because it
 * is where the two meet the transmitted: مُصْطَلَح weighs the chain a report came
 * down, and a learner weighing it needs both the Arabic of the earlier courses
 * and the مَنْطِق of the last one.
 */
export function isPart8Open(
  part7Summaries: { id: number }[],
  part7Scores: Record<number, number>,
) {
  return isCourseFinished(part7Summaries, part7Scores);
}

/** Which lessons of the eighth course are open. */
export function unlockedPart8Ids(
  summaries: { id: number }[],
  progress: Part8Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part8Scores,
    sessions: progress.part8Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
