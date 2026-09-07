// The fifth course's gate, built on the same shared rules as the two before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the fifth course needs to know about a learner. */
export type Part5Progress = {
  /** Result of each finished lesson, by lesson id. */
  part5Scores: Record<number, number>;
  part5Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the fifth course are addressed p5-lesson-… */
const PREFIX = "p5";

export function part5CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Fifth-course lessons the learner holds review cards for. */
export function part5LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The fifth course opens to whoever has finished the fourth one whole — the
 * chain every course here follows. Grammar comes last on purpose: this is not
 * where the language is learnt but where what has already been read is named.
 * A learner who has been through four courses of text knows the forms by sight,
 * and صَرْف and نَحْو give them their names and their rules.
 */
export function isPart5Open(
  part4Summaries: { id: number }[],
  part4Scores: Record<number, number>,
) {
  return isCourseFinished(part4Summaries, part4Scores);
}

/** Which lessons of the fifth course are open. */
export function unlockedPart5Ids(
  summaries: { id: number }[],
  progress: Part5Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part5Scores,
    sessions: progress.part5Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
