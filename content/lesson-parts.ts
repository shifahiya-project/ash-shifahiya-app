import type { Lesson } from "./types";

/**
 * Above this many questions a lesson is no longer one sitting, so it is taught
 * in two halves with a stop between them.
 */
export const PART_THRESHOLD = 150;

export type LessonPart = {
  /** 0-based. */
  index: number;
  /**
   * "cards" runs the deck-then-practice pass over the lesson's own words;
   * "grammar" teaches the rules behind them and drills those instead. A
   * grammar part has no decks, and its question range indexes the grammar
   * block rather than the lesson.
   */
  kind: "cards" | "grammar";
  /** Decks belonging to this part, as a half-open range. */
  deckStart: number;
  deckEnd: number;
  /** Questions belonging to this part, as a half-open range. */
  questionStart: number;
  questionEnd: number;
};

function wholeLesson(lesson: Lesson): LessonPart {
  return {
    index: 0,
    kind: "cards",
    deckStart: 0,
    deckEnd: lesson.decks.length,
    questionStart: 0,
    questionEnd: lesson.questions.length,
  };
}

/** The grammar block always closes the lesson, as one more part. */
function grammarPart(lesson: Lesson, index: number): LessonPart[] {
  if (!lesson.grammar) return [];
  return [{
    index,
    kind: "grammar",
    deckStart: 0,
    deckEnd: 0,
    questionStart: 0,
    questionEnd: lesson.grammar.questions.length,
  }];
}

/**
 * Splits a long lesson in two. The cards are cut at a deck boundary — a deck is
 * one topic and should not straddle the break — choosing the boundary that
 * leaves the halves closest to equal. The questions are cut at the midpoint, so
 * the closing "find the mistake" question stays in the second half.
 */
export function lessonParts(lesson: Lesson, threshold = PART_THRESHOLD): LessonPart[] {
  if (lesson.questions.length <= threshold || lesson.decks.length < 2) {
    return [wholeLesson(lesson), ...grammarPart(lesson, 1)];
  }

  const cardsPerDeck = lesson.decks.map((deck) => deck.words.length * 2);
  const totalCards = cardsPerDeck.reduce((sum, count) => sum + count, 0);

  let boundary = 1;
  let smallestGap = Infinity;
  let running = 0;
  for (let index = 0; index < cardsPerDeck.length - 1; index += 1) {
    running += cardsPerDeck[index];
    const gap = Math.abs(running - totalCards / 2);
    if (gap < smallestGap) {
      smallestGap = gap;
      boundary = index + 1;
    }
  }

  const questionCut = Math.round(lesson.questions.length / 2);
  return [
    { index: 0, kind: "cards", deckStart: 0, deckEnd: boundary, questionStart: 0, questionEnd: questionCut },
    {
      index: 1,
      kind: "cards",
      deckStart: boundary,
      deckEnd: lesson.decks.length,
      questionStart: questionCut,
      questionEnd: lesson.questions.length,
    },
    ...grammarPart(lesson, 2),
  ];
}

export function partCount(lesson: Lesson, threshold = PART_THRESHOLD) {
  return lessonParts(lesson, threshold).length;
}
