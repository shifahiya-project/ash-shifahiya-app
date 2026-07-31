import type { Word } from "../content/types";

/**
 * How far through a run of decks the learner is, as a fraction. Every deck is
 * seen twice, and decks differ in size, so the position has to be counted in
 * cards rather than in decks — otherwise the bar jumps at every deck boundary.
 * Takes the decks rather than the lesson so a lesson taught in two parts can
 * pass only the part's own decks.
 */
export function cardPhaseProgress(
  decks: { words: Word[] }[],
  deckIndex: number,
  round: number,
  cardIndex: number,
  seen: number,
) {
  const cardsPerDeck = decks.map((deck) => deck.words.length * 2);
  const total = cardsPerDeck.reduce((sum, count) => sum + count, 0);
  if (!total) return 0;

  const done = cardsPerDeck.slice(0, deckIndex).reduce((sum, count) => sum + count, 0);
  const currentDeckWords = decks[deckIndex]?.words.length ?? 0;
  return Math.min((done + (round - 1) * currentDeckWords + cardIndex + seen) / total, 1);
}
