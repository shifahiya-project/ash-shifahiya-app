import { hash, seededShuffle } from "../questions.ts";
import type { Part2Lesson, Part2Word, Question } from "../types";

/**
 * The second course checks a word where it lives: inside the sentence the
 * learner is about to read. Two shapes come out of the same data.
 *
 * Where the word could be located in its own sentence, the sentence is asked
 * with a blank in its place — the learner picks the form that stood there.
 * Where it could not, the sentence is asked whole: what does it say. Both are
 * built from the glossary as it comes, so nothing here is invented.
 *
 * Options are drawn from the lesson's own words, preferring ones of the same
 * kind — a verb is hidden among verbs, not among nouns — and the shuffle is
 * seeded so that the server and the browser lay out the same paper.
 */
export const BLANK = "▁▁▁";

/**
 * Two options are the same option when they differ only in vowel marks — but
 * only the Arabic ones do that. A Russian sentence stripped of everything but
 * Arabic letters is an empty string, and every empty string looks alike, which
 * would throw away every distractor the meaning questions have.
 */
function sameValue(a: string, b: string) {
  const bare = (text: string) =>
    /[ء-ي]/.test(text) ? text.replace(/[ً-ْٰـ]/g, "").replace(/[^ء-ي]/g, "") : text.trim();
  return bare(a) === bare(b);
}

/** Words of the lesson that could stand in for this one, nearest kind first. */
function distractors(word: Part2Word, lesson: Part2Lesson, pick: (word: Part2Word) => string) {
  const answer = pick(word);
  const usable = lesson.words.filter((other) => {
    if (other === word) return false;
    const value = pick(other);
    if (!value) return false;
    return !sameValue(value, answer);
  });

  const sameKind = usable.filter((other) => other.kind === word.kind);
  const rest = usable.filter((other) => other.kind !== word.kind);
  const ranked = [...sameKind, ...rest];
  // Seeded on the answer so the same two are chosen every time this runs.
  const chosen = seededShuffle(ranked.slice(0, Math.max(6, Math.min(ranked.length, 8))), hash(answer));

  // Two words of a lesson can share one sentence, and then they would offer the
  // same option twice.
  const picked: string[] = [];
  for (const candidate of [...chosen, ...ranked]) {
    const value = pick(candidate);
    if (picked.some((taken) => sameValue(taken, value))) continue;
    picked.push(value);
    if (picked.length === 2) break;
  }
  return picked;
}

function clozeQuestion(word: Part2Word, lesson: Part2Lesson): Question | null {
  if (!word.contextForm) return null;
  // Sometimes the context is a single word — a story's heading, a caption. A
  // blank would swallow the phrase whole and leave a bare dash on screen, so
  // such a word is asked by its meaning instead.
  if (word.contextArabic.split(/\s+/).filter((token) => /[ء-ي]/.test(token)).length < 2) return null;
  // «رُوَيْدًا رُوَيْدًا» — a word repeated inside its phrase would leave the answer
  // in plain sight next to the blank. Such a phrase is asked whole.
  if (word.contextArabic.split(word.contextForm).length !== 2) return null;
  const prompt = word.contextArabic.replace(word.contextForm, BLANK);

  const options = [word.contextForm, ...distractors(word, lesson, (item) => item.contextForm ?? "")];
  if (options.length < 3) return null;

  return {
    prompt,
    promptLang: "ar",
    answer: word.contextForm,
    options: seededShuffle(options, hash(word.contextForm)),
    explanation: `${word.arabic} — ${word.russian}. ${word.contextRussian}`,
  };
}

function meaningQuestion(word: Part2Word, lesson: Part2Lesson): Question | null {
  const options = [word.contextRussian, ...distractors(word, lesson, (item) => item.contextRussian)];
  if (options.length < 3) return null;

  return {
    prompt: word.contextArabic,
    promptLang: "ar",
    answer: word.contextRussian,
    options: seededShuffle(options, hash(word.contextRussian)),
    explanation: `${word.arabic} — ${word.russian}.`,
  };
}

/** One question per new word, in the order the lesson introduces them. */
export function part2Questions(lesson: Part2Lesson): Question[] {
  return lesson.words
    .map((word) => clozeQuestion(word, lesson) ?? meaningQuestion(word, lesson))
    .filter((question): question is Question => question !== null);
}
