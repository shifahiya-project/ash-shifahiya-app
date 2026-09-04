// The third course's gate. The rules it shares with the fourth — a card's
// address, the lessons a learner holds cards for, how far a course opens — live
// in text-course-access; what is written here is what belongs to this course
// alone: what has to be finished before it starts.
import {
  isCourseFinished,
  textCourseCardId,
  textCourseLessonIdsInCards,
  unlockedTextCourseIds,
} from "./text-course-access.ts";
import type { TextCourseProgress } from "./text-course-access.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the third course needs to know about a learner. */
export type Part3Progress = {
  /** Result of each finished lesson, by lesson id. */
  part3Scores: Record<number, number>;
  part3Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

/** Cards of the third course are addressed p3-lesson-… */
const PREFIX = "p3";

export function part3CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return textCourseCardId(PREFIX, lessonId, wordIndex, direction);
}

/** Third-course lessons the learner holds review cards for. */
export function part3LessonIdsInCards(cards: Record<string, unknown>) {
  return textCourseLessonIdsInCards(PREFIX, cards);
}

/**
 * The third course opens to whoever has finished the second one whole. The
 * second course is a hundred and five lessons of stories: it is what makes a
 * treatise readable at all, and there is no shortcut past it. Where the second
 * course asked for a paper, this one asks for the course itself — a scholarly
 * text is not a checkpoint but the thing the reading was for.
 */
export function isPart3Open(
  part2Summaries: { id: number }[],
  part2Scores: Record<number, number>,
) {
  return isCourseFinished(part2Summaries, part2Scores);
}

/** Which lessons of the third course are open. */
export function unlockedPart3Ids(
  summaries: { id: number }[],
  progress: Part3Progress,
  open: boolean,
): Set<number> {
  const held: TextCourseProgress = {
    scores: progress.part3Scores,
    sessions: progress.part3Sessions,
    cards: progress.cards,
  };
  return unlockedTextCourseIds(PREFIX, summaries, held, open);
}
