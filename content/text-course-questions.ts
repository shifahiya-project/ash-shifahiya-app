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
 * A lesson that cannot fill three options out of its own words borrows the rest
 * from the words the learner has already met. Never from the ones ahead: an
 * option is read before it is rejected, and a course does not show a meaning it
 * has not taught.
 *
 * Two things leave a lesson short. Most often it brings one or two words —
 * twenty-six such lessons in the fourth course, twenty-four in the fifth. But a
 * lesson with three can come up short too: a wrong answer sharing a meaning
 * with the right one is dropped as a second right answer, and where a course
 * explains its terms in phrases rather than single words, two of them can share
 * one — «предмет, которому приписывается превосходство» and «предмет, с которым
 * производится сравнение» have «предмет» in common. So the borrowing is decided
 * by the option list actually coming out short, not by counting the words.
 */
const KINDS: TextCourseWordKind[] = [
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
];

const kindIndex = (kind: TextCourseWordKind) => KINDS.indexOf(kind);

/** The answer and two wrong ones. */
const OPTION_COUNT = 3;

const candidatesOf = (words: TextCourseWord[]) =>
  words.map((word) => ({ value: word.russian, deckIndex: kindIndex(word.kind) }));

export function textCourseQuestions(
  lesson: TextCourseLesson,
  met: TextCourseWord[] = [],
): Question[] {
  const own = candidatesOf(lesson.words);
  const wider = met.length ? candidatesOf([...lesson.words, ...met]) : own;

  return lesson.words.map((word) => {
    const deck = kindIndex(word.kind);
    const alone = buildOptions(word.russian, own, deck);
    return {
      prompt: word.arabic,
      promptLang: "ar" as const,
      answer: word.russian,
      options: alone.length >= OPTION_COUNT ? alone : buildOptions(word.russian, wider, deck),
      explanation: `${word.arabic} — ${word.russian}.`,
    };
  });
}

/**
 * Whether this lesson has to reach for the words already met. Answered without
 * them, so the chunk that holds them is fetched only by the lessons that need
 * it — which is a minority of any course.
 */
export function textCourseNeedsMetWords(lesson: TextCourseLesson) {
  return textCourseQuestions(lesson).some((question) => question.options.length < OPTION_COUNT);
}
