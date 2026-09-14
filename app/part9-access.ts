// The ninth course's gate, built on the same shared rules as the six before it.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the ninth course needs to know about a learner. */
export type Part9Progress = {
  /** Result of each finished lesson, by lesson id. */
  part9Scores: Record<number, number>;
  part9Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the ninth course are addressed p9-lesson-… */
const PREFIX = "p9";

export function part9CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Seventh-course lessons the learner holds review cards for. */
export function part9LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The ninth course opens to whoever has finished the eighth one whole — the
 * chain every course here opens by. أُصُول الْفِقْه comes last of all: it is the
 * science of where a ruling comes from, and it argues from every course before
 * it at once — the wording of a verse, the chain of a report, the قِيَاس that
 * carries a rule across. A learner who has not read those has nothing for it
 * to reason over.
 */
export function isPart9Open(
  part8Summaries: { id: number }[],
  part8Scores: Record<number, number>,
) {
  return isCourseFinished(part8Summaries, part8Scores);
}

/** Which lessons of the ninth course are open. */
export function unlockedPart9Ids(
  summaries: { id: number }[],
  progress: Part9Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part9Scores,
    sessions: progress.part9Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
