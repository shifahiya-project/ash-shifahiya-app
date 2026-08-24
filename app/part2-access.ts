// Types only, like the gate for the first course, so the tests can import this
// module without pulling in the browser-bound store.
import type { Part2Session } from "./progress-store.ts";

/** What the second course needs to know about a learner. */
export type Part2Progress = {
  /** Result of each finished lesson, by lesson id. */
  part2Scores: Record<number, number>;
  part2Sessions: Record<number, Part2Session>;
  cards: Record<string, unknown>;
};

const CARD_LESSON = /^p2-lesson-(\d+)-word-/;

/**
 * A card of the second course. The box it lives in is the same one the first
 * course uses — one daily queue for the whole language — but the address says
 * which course the word came from.
 */
export function part2CardId(lessonId: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return `p2-lesson-${lessonId}-word-${wordIndex}-${direction}`;
}

/** Second-course lessons the learner holds review cards for. */
export function part2LessonIdsInCards(cards: Record<string, unknown>) {
  const ids = new Set<number>();
  for (const id of Object.keys(cards)) {
    const match = id.match(CARD_LESSON);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids];
}

/**
 * The second course opens to whoever has written the final paper of the first.
 * That is what "enough points" means: the exam is the measure, and it can be
 * retaken as often as the learner likes.
 */
export function isPart2Open(examPassed: boolean) {
  return examPassed;
}

/**
 * Which lessons of the second course are open. The course runs in order, like
 * the first one, and — as there too — ground already covered is never taken
 * back: everything up to the furthest lesson touched stays open.
 */
export function unlockedPart2Ids(
  summaries: { id: number }[],
  progress: Part2Progress,
  examPassed: boolean,
): Set<number> {
  if (!examPassed) return new Set();

  const touched = new Set<number>([
    ...Object.keys(progress.part2Scores).map(Number),
    ...Object.keys(progress.part2Sessions).map(Number),
    ...part2LessonIdsInCards(progress.cards),
  ]);

  let reached = -1;
  summaries.forEach((summary, index) => {
    if (touched.has(summary.id)) reached = index;
  });

  const open = new Set<number>();
  summaries.forEach((summary, index) => {
    const previous = summaries[index - 1];
    if (!previous || index <= reached || progress.part2Scores[previous.id] !== undefined) {
      open.add(summary.id);
    }
  });
  return open;
}
