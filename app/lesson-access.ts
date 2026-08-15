// Types only: this module stays pure so the tests can import it directly,
// without pulling in the browser-bound store it describes.
import type { CardProgress, SavedSession } from "./progress-store";

/** The part of a learner's progress that decides which lessons are open. */
export type AccessProgress = {
  scores: Record<number, number>;
  grammarScores: Record<number, number>;
  sessions: Record<number, SavedSession>;
  cards: Record<string, CardProgress>;
};

/** What the course order needs to know about a lesson. */
export type AccessSummary = {
  id: number;
  /** 0 for a lesson that has no grammar block yet. */
  grammarQuestionCount?: number;
};

const CARD_LESSON = /^lesson-(\d+)-deck-/;

/** Every lesson the learner has finished, started, or holds review cards for. */
function touchedLessonIds(progress: AccessProgress) {
  const ids = new Set<number>();
  for (const id of Object.keys(progress.scores)) ids.add(Number(id));
  for (const id of Object.keys(progress.grammarScores)) ids.add(Number(id));
  for (const id of Object.keys(progress.sessions)) ids.add(Number(id));
  for (const id of Object.keys(progress.cards)) {
    const match = id.match(CARD_LESSON);
    if (match) ids.add(Number(match[1]));
  }
  return ids;
}

/**
 * Three quarters of the grammar block has to be right for it to count. The
 * cards can be walked through, but a rule half understood is worse than no
 * rule: the next lesson will build on it either way.
 */
export const GRAMMAR_PASS_RATIO = 0.75;

/** How many of the block's questions must be answered correctly. */
export function grammarPassMark(questionCount: number) {
  return Math.ceil(questionCount * GRAMMAR_PASS_RATIO);
}

export function isGrammarPassed(summary: AccessSummary, progress: AccessProgress) {
  if (!summary.grammarQuestionCount) return true;
  const score = progress.grammarScores[summary.id];
  return score !== undefined && score >= grammarPassMark(summary.grammarQuestionCount);
}

/**
 * A lesson counts as finished when its cards and questions are done and, where
 * the lesson teaches grammar, that block is passed too. Grammar is not
 * optional: the rules are what the next lesson builds on.
 */
export function isLessonComplete(summary: AccessSummary, progress: AccessProgress) {
  if (progress.scores[summary.id] === undefined) return false;
  return isGrammarPassed(summary, progress);
}

/**
 * Which lessons the learner may open. The course runs in order: a lesson
 * unlocks once the one before it is complete.
 *
 * The gate is newer than the course, and learners were free to roam before it
 * existed, so it never takes away ground already covered: every lesson up to
 * the furthest one they have touched stays open, which is what keeps someone
 * mid-course from landing back on lesson one. Beyond that mark the course runs
 * in order again. Grammar blocks added to lessons a learner already finished
 * are caught by the same rule — the lesson stays open, with the block left to
 * do, and only the lessons past their mark wait on it.
 */
export function unlockedLessonIds(
  summaries: AccessSummary[],
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
    if (!previous || index <= reached || isLessonComplete(previous, progress)) {
      open.add(summary.id);
    }
  });
  return open;
}
