// The tenth course's gate, built on the same shared rules as the seven before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the tenth course needs to know about a learner. */
export type Part10Progress = {
  /** Result of each finished lesson, by lesson id. */
  part10Scores: Record<number, number>;
  part10Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the tenth course are addressed p10-lesson-… */
const PREFIX = "p10";

export function part10CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Seventh-course lessons the learner holds review cards for. */
export function part10LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The tenth course opens to whoever has finished the ninth one whole — the
 * chain every course here opens by. The Forty Hadith come last of the reading:
 * the nine courses before them teach the language, then the sciences that weigh
 * a report and a ruling, and this is the مَتْن those sciences are about — read
 * once the learner can hear what is being weighed.
 */
export function isPart10Open(
  part9Summaries: { id: number }[],
  part9Scores: Record<number, number>,
) {
  return isCourseFinished(part9Summaries, part9Scores);
}

/** Which lessons of the tenth course are open. */
export function unlockedPart10Ids(
  summaries: { id: number }[],
  progress: Part10Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part10Scores,
    sessions: progress.part10Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
