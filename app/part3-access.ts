// Types only, like the gates for the courses before it, so the tests can import
// this module without pulling in the browser-bound store.
import type { ReadingCourseSession } from "./progress-store.ts";

/** What the third course needs to know about a learner. */
export type Part3Progress = {
  /** Result of each finished lesson, by lesson id. */
  part3Scores: Record<number, number>;
  part3Sessions: Record<number, ReadingCourseSession>;
  cards: Record<string, unknown>;
};

const CARD_LESSON = /^p3-lesson-(\d+)-word-/;

/**
 * A card of the third course. The box it lives in is the same one the other two
 * use — one daily queue for the whole language — but the address says which
 * course the word came from.
 */
export function part3CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return `p3-lesson-${lessonId}-word-${wordIndex}-${direction}`;
}

/** Third-course lessons the learner holds review cards for. */
export function part3LessonIdsInCards(cards: Record<string, unknown>) {
  const ids = new Set<number>();
  for (const id of Object.keys(cards)) {
    const match = id.match(CARD_LESSON);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids];
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
  return (
    part2Summaries.length > 0 &&
    part2Summaries.every((summary) => part2Scores[summary.id] !== undefined)
  );
}

/**
 * Which lessons of the third course are open. The book runs in order, like the
 * courses before it, and — as there too — ground already covered is never taken
 * back: everything up to the furthest lesson touched stays open.
 */
export function unlockedPart3Ids(
  summaries: { id: number }[],
  progress: Part3Progress,
  open: boolean,
): Set<number> {
  if (!open) return new Set();

  const touched = new Set<number>([
    ...Object.keys(progress.part3Scores).map(Number),
    ...Object.keys(progress.part3Sessions).map(Number),
    ...part3LessonIdsInCards(progress.cards),
  ]);

  let reached = -1;
  summaries.forEach((summary, index) => {
    if (touched.has(summary.id)) reached = index;
  });

  const unlocked = new Set<number>();
  summaries.forEach((summary, index) => {
    const previous = summaries[index - 1];
    if (!previous || index <= reached || progress.part3Scores[previous.id] !== undefined) {
      unlocked.add(summary.id);
    }
  });
  return unlocked;
}
