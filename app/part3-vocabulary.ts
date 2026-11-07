import { part3LegacyWordCounts } from "../content/part3/legacy-word-counts.ts";
import type { TextCourseLesson } from "../content/types.ts";
import type { ReadingCourseSession } from "./progress-store.ts";

/** Raw positions remain review-card identities even when a word is retired. */
export function activeTextWordIndexes(lesson: TextCourseLesson): number[] {
  return lesson.words.flatMap((word, index) => word.retired ? [] : [index]);
}

/**
 * Freeze the vocabulary of a third-course attempt. Sessions saved before the
 * first additions used every original position, including subsequently retired
 * words. Other text courses retain their existing complete-lesson sequence.
 */
export function textCourseSessionWordIndexes(
  courseId: number,
  lesson: TextCourseLesson,
  session?: ReadingCourseSession,
): number[] {
  const all = lesson.words.map((_, index) => index);
  if (courseId !== 3) return all;
  if (session?.wordIndexes) return [...session.wordIndexes];
  if (session) return all.slice(0, part3LegacyWordCounts[lesson.id] ?? all.length);
  return activeTextWordIndexes(lesson);
}
