import type { Lesson } from "../content/types";

/**
 * How far through a lesson's cards the learner is, as a fraction. Every deck is
 * seen twice, and decks differ in size, so the position has to be counted in
 * cards rather than in decks — otherwise the bar jumps at every deck boundary.
 */
export function cardPhaseProgress(lesson: Lesson, deckIndex: number, round: number, cardIndex: number, seen: number) {
  const cardsPerDeck = lesson.decks.map((deck) => deck.words.length * 2);
  const total = cardsPerDeck.reduce((sum, count) => sum + count, 0);
  if (!total) return 0;

  const done = cardsPerDeck.slice(0, deckIndex).reduce((sum, count) => sum + count, 0);
  const currentDeckWords = lesson.decks[deckIndex]?.words.length ?? 0;
  return Math.min((done + (round - 1) * currentDeckWords + cardIndex + seen) / total, 1);
}
