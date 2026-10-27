import { buildOptions } from "../questions.ts";
import type { Part2Lesson, Part2WordKind, Question } from "../types";

const KINDS: Part2WordKind[] = [
  "verb", "noun", "masdar", "participle", "adj", "adverb", "expression",
];

const kindIndex = (kind: Part2WordKind) => KINDS.indexOf(kind);
const arabicIdentity = (value: string) => value
  .replace(/[ـً-ْٰ]/g, "")
  .replace(/[آأإٱ]/g, "ا")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Recall each new word in both directions before meeting it in the reading.
 * Context questions are a separate final stage, so these prompts and their
 * feedback contain only the word and its meaning. All current lessons supply
 * enough distinct words for three options; never invent an unseen distractor
 * if a future glossary happens to be smaller.
 */
export function part2VocabularyQuestions(lesson: Part2Lesson): Question[] {
  const arabic = lesson.words.map((word) => ({
    value: word.arabic,
    meaning: word.russian,
    deckIndex: kindIndex(word.kind),
  }));

  return lesson.words.flatMap((word): Question[] => {
    const kind = kindIndex(word.kind);
    // Two entries can give the same Arabic form different glosses. Neither
    // gloss is a distractor for that form, even if their Russian text differs.
    const russian = lesson.words
      .filter((other) => arabicIdentity(other.arabic) !== arabicIdentity(word.arabic))
      .map((other) => ({ value: other.russian, deckIndex: kindIndex(other.kind) }));
    const explanation = `${word.arabic} — ${word.russian}.`;
    return [
      {
        prompt: word.arabic,
        promptLang: "ar",
        answer: word.russian,
        options: buildOptions(word.russian, russian, kind),
        explanation,
      },
      {
        prompt: word.russian,
        promptLang: "ru",
        answer: word.arabic,
        options: buildOptions(word.arabic, arabic, kind, word.russian),
        explanation,
      },
    ];
  });
}
