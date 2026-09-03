import { buildOptions } from "../questions.ts";
import type { Part3Lesson, Part3WordKind, Question } from "../types";

/**
 * The third course asks one question per new word, and asks it the way the
 * course is used: the Arabic form is on screen and the learner says what it
 * means. That is the direction reading needs — the other one, Russian to
 * Arabic, is already drilled by the second of the two review cards every word
 * lays down.
 *
 * The glossary of this book carries no example sentences, so there is no blank
 * to put a word into, as the second course does. Nothing is cut out of the text
 * to make one: the word is checked by its meaning here and met whole in the
 * lesson's own text at the third step.
 *
 * The wrong answers come from the lesson's own glossary, through the same
 * ranking the first course uses — near in shape, far from a second right
 * answer. What stands in for a deck here is the word's kind: a term is hidden
 * among terms, a verb among verbs.
 */
const KINDS: Part3WordKind[] = [
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
];

const kindIndex = (kind: Part3WordKind) => KINDS.indexOf(kind);

export function part3Questions(lesson: Part3Lesson): Question[] {
  const candidates = lesson.words.map((word) => ({
    value: word.russian,
    deckIndex: kindIndex(word.kind),
  }));

  return lesson.words.map((word) => ({
    prompt: word.arabic,
    promptLang: "ar" as const,
    answer: word.russian,
    options: buildOptions(word.russian, candidates, kindIndex(word.kind)),
    explanation: `${word.arabic} — ${word.russian}.`,
  }));
}
