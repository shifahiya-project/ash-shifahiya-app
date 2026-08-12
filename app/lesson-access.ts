// Types only: this module stays pure so the tests can import it directly,
// without pulling in the browser-bound store it describes.
import type { CardProgress, SavedSession } from "./progress-store";

/** The part of a learner's progress that decides which lessons are open. */
export type AccessProgress = {
  scores: Record<number, number>;
  sessions: Record<number, SavedSession>;
  cards: Record<string, CardProgress>;
};

const CARD_LESSON = /^lesson-(\d+)-deck-/;

/** Every lesson the learner has finished, started, or holds review cards for. */
function touchedLessonIds(progress: AccessProgress) {
  const ids = new Set<number>();
  for (const id of Object.keys(progress.scores)) ids.add(Number(id));
  for (const id of Object.keys(progress.sessions)) ids.add(Number(id));
  for (const id of Object.keys(progress.cards)) {
    const match = id.match(CARD_LESSON);
    if (match) ids.add(Number(match[1]));
  }
  return ids;
}

/**
 * Which lessons the learner may open. The course runs in order: a lesson
 * unlocks once the one before it is finished.
 *
 * The gate is new, and learners were free to roam before it existed, so it
 * never takes away ground already covered: every lesson up to the furthest one
 * they have touched stays open, which is what keeps someone mid-course from
 * landing back on lesson one. Beyond that mark the course runs in order again.
 */
export function unlockedLessonIds(
  summaries: { id: number }[],
  progress: AccessProgress,
): Set<number> {
  const touched = touchedLessonIds(progress);
  let reached = -1;
  summaries.forEach((summary, index) => {
    if (touched.has(summary.id)) reached = index;
  });

  const open = new Set<number>();
  summaries.forEach((summary, index) => {
    const previous = summaries[index - 1];
    if (!previous || index <= reached || progress.scores[previous.id] !== undefined) {
      open.add(summary.id);
    }
  });
  return open;
}
