import { part4LegacySummaries } from "../content/part4/revision.ts";
import type { Progress } from "./progress-store.ts";

const downstreamCourses = [5, 6, 7, 8, 9, 10, 11] as const;
const isLessonId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));

/** Keep access earned before the complete fiqh edition replaced its lessons. */
export function hasPriorPart5Access(progress: Partial<Progress>): boolean {
  // Only the archived 145-lesson scores prove the old prerequisite. The
  // revision's numbers refer to different lessons and are checked separately.
  if (part4LegacySummaries.every(({ id }) => progress.part4Scores?.[id] !== undefined)) return true;

  // A learner already working beyond fiqh must be able to return there even
  // when an older backup did not retain all prerequisite completion keys.
  for (const part of downstreamCourses) {
    const scores = progress[`part${part}Scores`];
    if (Object.entries(scores ?? {}).some(([id, score]) => isLessonId(id) && score !== undefined)) return true;
    const sessions = progress[`part${part}Sessions`];
    if (Object.entries(sessions ?? {}).some(([id, session]) => isLessonId(id) && session?.lessonId === Number(id))) return true;
  }

  return Object.keys(progress.cards ?? {}).some((id) => {
    const match = /^p(?:[5-9]|10|11)-lesson-([1-9]\d*)-word-(0|[1-9]\d*)-(?:ar-ru|ru-ar)$/.exec(id);
    return !!match && Number.isSafeInteger(Number(match[1])) && Number.isSafeInteger(Number(match[2]));
  });
}
