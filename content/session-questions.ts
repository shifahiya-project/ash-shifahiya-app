import type { Lesson } from "./types";

/**
 * Finish an already-started paper at the size it had when it was saved. New
 * generated questions are inserted before the closing correction, so keeping
 * only a prefix would silently replace that correction at its stored index.
 * Corrections to the content still apply; extra questions and decks wait for a
 * fresh run. Freezing the decks also keeps a split lesson's part boundaries:
 * appending a deck can otherwise move an unfinished second half into the first.
 */
export function questionsForSavedSession(lesson: Lesson, questionCount?: number, deckCount?: number): Lesson {
  const keepQuestions = Number.isInteger(questionCount) && questionCount !== undefined &&
    questionCount > 0 && questionCount < lesson.questions.length;
  const keepDecks = Number.isInteger(deckCount) && deckCount !== undefined &&
    deckCount > 0 && deckCount < lesson.decks.length;
  if (!keepQuestions && !keepDecks) return lesson;
  return {
    ...lesson,
    decks: keepDecks ? lesson.decks.slice(0, deckCount) : lesson.decks,
    questions: keepQuestions ? [
      ...lesson.questions.slice(0, questionCount - 1),
      lesson.questions[lesson.questions.length - 1],
    ] : lesson.questions,
  };
}
