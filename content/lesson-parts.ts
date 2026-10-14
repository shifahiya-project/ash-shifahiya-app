import type { Lesson } from "./types";

/**
 * Above this many questions a lesson is no longer one sitting, so it is taught
 * in separate parts with a stop between them.
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
 * Splits a long lesson into enough parts to keep each paper under the limit.
 * Cards are cut only at deck boundaries, choosing the nearest balance for the
 * remaining parts. The original two-part split is unchanged; very large new
 * runs can have more parts. The closing correction stays in the last part.
 */
export function lessonParts(lesson: Lesson, threshold = PART_THRESHOLD): LessonPart[] {
  if (lesson.questions.length <= threshold || lesson.decks.length < 2) {
    return [wholeLesson(lesson), ...grammarPart(lesson, 1)];
  }

  const cardsPerDeck = lesson.decks.map((deck) => deck.words.length * 2);
  const totalCards = cardsPerDeck.reduce((sum, count) => sum + count, 0);

  const count = Math.min(Math.ceil(lesson.questions.length / threshold), lesson.decks.length);
  const parts: LessonPart[] = [];
  let deckStart = 0;
  let remainingCards = totalCards;
  for (let index = 0; index < count; index += 1) {
    const remainingParts = count - index;
    let deckEnd = lesson.decks.length;
    if (remainingParts > 1) {
      let smallestGap = Infinity;
      let running = 0;
      // Leave at least one deck for each of the parts that follows.
      for (let deckIndex = deckStart; deckIndex < lesson.decks.length - remainingParts + 1; deckIndex += 1) {
        running += cardsPerDeck[deckIndex];
        const gap = Math.abs(running - remainingCards / remainingParts);
        if (gap < smallestGap) {
          smallestGap = gap;
          deckEnd = deckIndex + 1;
        }
      }
    }
    parts.push({
      index, kind: "cards", deckStart, deckEnd,
      questionStart: Math.round(lesson.questions.length * index / count),
      questionEnd: Math.round(lesson.questions.length * (index + 1) / count),
    });
    remainingCards -= cardsPerDeck.slice(deckStart, deckEnd).reduce((sum, cards) => sum + cards, 0);
    deckStart = deckEnd;
  }
  return [...parts, ...grammarPart(lesson, count)];
}

export function partCount(lesson: Lesson, threshold = PART_THRESHOLD) {
  return lessonParts(lesson, threshold).length;
}

/**
 * Which part a saved position belongs to now.
 *
 * A lesson that grows past the threshold gains parts, and a session parked
 * in what used to be the whole lesson would resume in a part that no longer
 * reaches its question. The stored index is a hint, not the answer: the part
 * that actually contains the position wins.
 */
export function partIndexFor(
  parts: LessonPart[],
  position: { questionIndex: number; deckIndex: number; view: string },
  stored = 0,
) {
  const cards = parts.filter((part) => part.kind === "cards");
  if (!cards.length) return 0;

  const found = position.view === "learn"
    ? cards.find((part) => position.deckIndex >= part.deckStart && position.deckIndex < part.deckEnd)
    : cards.find((part) => position.questionIndex >= part.questionStart && position.questionIndex < part.questionEnd);

  if (found) return found.index;
  // Past the end of every part — the lesson shrank under the learner. The last
  // part is the closest honest answer.
  return parts[stored] ? stored : cards[cards.length - 1].index;
}
