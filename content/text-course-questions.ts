import { buildOptions } from "./questions.ts";
import type { Question, TextCourseLesson, TextCourseWord, TextCourseWordKind } from "./types";

/**
 * The third and fourth courses ask one question per new word, and ask it the
 * way these courses are used: the Arabic form is on screen and the learner says
 * what it means. That is the direction reading needs — the other one, Russian to
 * Arabic, is already drilled by the second of the two review cards every word
 * lays down.
 *
 * Neither book's glossary carries example sentences, so there is no blank to
 * put a word into, as the second course does. Nothing is cut out of the text to
 * make one: the word is checked by its meaning here and met whole in the
 * lesson's own text at the third step.
 *
 * A lesson that brings no new words asks nothing — the fourth course's glossary
 * is cumulative, and deep in a book a lesson can meet nothing it has not met.
 *
 * The wrong answers come from the lesson's own glossary, through the same
 * ranking the first course uses — near in shape, far from a second right
 * answer. What stands in for a deck here is the word's kind: a term is hidden
 * among terms, a verb among verbs.
 *
 * A lesson too short to fill three options out of its own words — the fourth
 * course has twenty-five of one or two words — borrows the rest from the words
 * the learner has already met. Never from the ones ahead: an option is read
 * before it is rejected, and a course does not show a meaning it has not taught.
 */
const KINDS: TextCourseWordKind[] = [
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
];

const kindIndex = (kind: TextCourseWordKind) => KINDS.indexOf(kind);

/** The answer and two wrong ones. */
const OPTION_COUNT = 3;

export function textCourseQuestions(
  lesson: TextCourseLesson,
  met: TextCourseWord[] = [],
): Question[] {
  const drawn = lesson.words.length >= OPTION_COUNT ? lesson.words : [...lesson.words, ...met];
  const candidates = drawn.map((word) => ({
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
