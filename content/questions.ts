import type { Lesson, Question } from "./types";

/** Wrong answers offered next to the correct one. */
const DISTRACTOR_COUNT = 2;
/** How many of the best-ranked candidates stay in play before the seeded pick. */
const POOL_DEPTH = 6;
/** Ranking bonus for candidates taught in the same deck as the answer. */
const SAME_DECK_BONUS = 0.25;
/** Weight of the length difference when scoring how confusable two forms are. */
const LENGTH_GAP_WEIGHT = 0.35;

/** Harakat, tatweel and superscript alef — noise when comparing word shapes. */
const ARABIC_DIACRITICS = /[ـً-ْٰ]/g;
const ALEF_VARIANTS = /[آأإٱ]/g;
/** Russian glosses list alternatives as "высокий / длинный" or "он, оно". */
const GLOSS_SEPARATORS = /[/,;]/;

type Candidate = { value: string; deckIndex: number };

function normalize(value: string) {
  return value
    .replace(ARABIC_DIACRITICS, "")
    .replace(ALEF_VARIANTS, "ا")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Individual meanings a gloss offers, e.g. "высокий / длинный" → two entries. */
function glosses(value: string) {
  return new Set(
    value
      .split(GLOSS_SEPARATORS)
      .map((part) => normalize(part))
      .filter(Boolean),
  );
}

/**
 * True when a candidate carries a meaning the answer also carries, which would
 * make the question have two right answers. Guards pairs like
 * "высокий / длинный" against "длинный".
 */
function overlapsInMeaning(answer: string, candidate: string) {
  const answerGlosses = glosses(answer);
  for (const gloss of glosses(candidate)) {
    if (answerGlosses.has(gloss)) return true;
  }
  return false;
}

/**
 * How easily a candidate could be mistaken for the answer. Shared prefixes and
 * suffixes stand in for a shared root or pattern in Arabic and for a shared
 * stem or ending in Russian; wildly different lengths are an easy giveaway.
 */
function confusability(answer: string, candidate: string) {
  const left = normalize(answer);
  const right = normalize(candidate);
  if (!left || !right) return 0;

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const longest = Math.max(left.length, right.length);
  const overlap = (prefix + suffix) / longest;
  const lengthGap = Math.abs(left.length - right.length) / longest;
  return overlap - lengthGap * LENGTH_GAP_WEIGHT;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/**
 * Deterministic shuffle. The same answer always yields the same options, so
 * server and client agree and the generated set is reproducible in tests.
 */
function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * Picks wrong answers that are worth ruling out: same deck where possible,
 * similar in shape, and varied from question to question so the option list
 * itself stops being a hint.
 */
export function buildOptions(answer: string, candidates: Candidate[], deckIndex: number) {
  const seen = new Set([normalize(answer)]);
  const usable: Candidate[] = [];
  for (const candidate of candidates) {
    const key = normalize(candidate.value);
    if (seen.has(key)) continue;
    if (overlapsInMeaning(answer, candidate.value)) continue;
    seen.add(key);
    usable.push(candidate);
  }

  const ranked = usable
    .map((candidate) => ({
      candidate,
      score:
        confusability(answer, candidate.value) +
        (candidate.deckIndex === deckIndex ? SAME_DECK_BONUS : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.value.localeCompare(b.candidate.value))
    .map((entry) => entry.candidate.value);

  // Keep the better half of the candidates, so ranking still matters in short
  // decks, but never narrow the pool down to the distractors themselves.
  const depth = Math.max(DISTRACTOR_COUNT + 1, Math.min(POOL_DEPTH, Math.ceil(ranked.length / 2)));
  const pool = ranked.slice(0, depth);
  const picked = seededShuffle(pool, hash(answer)).slice(0, DISTRACTOR_COUNT);
  return [answer, ...picked];
}

/** "1 задание", "72 задания", "28 заданий". */
function taskCount(count: number) {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${count} заданий`;
  if (ones === 1) return `${count} задание`;
  if (ones >= 2 && ones <= 4) return `${count} задания`;
  return `${count} заданий`;
}

/**
 * Tops the authored questions up to two per word (Arabic → Russian and back).
 * The authored closing question — "find and fix the mistake" — stays last.
 */
export function expandLessonQuestions(lesson: Lesson): Lesson {
  const entries = lesson.decks.flatMap((deck, deckIndex) =>
    deck.words.map((word) => ({ word, deckIndex })),
  );
  const targetCount = entries.length * 2;
  if (lesson.questions.length >= targetCount) return lesson;

  const arabicCandidates: Candidate[] = entries.map(({ word, deckIndex }) => ({
    value: word.arabic,
    deckIndex,
  }));
  const russianCandidates: Candidate[] = entries.map(({ word, deckIndex }) => ({
    value: word.russian,
    deckIndex,
  }));

  const generated = entries.flatMap<Question>(({ word, deckIndex }) => [
    {
      prompt: word.arabic,
      promptLang: "ar",
      answer: word.russian,
      options: buildOptions(word.russian, russianCandidates, deckIndex),
      explanation: `${word.arabic} означает «${word.russian}».`,
    },
    {
      prompt: word.russian,
      promptLang: "ru",
      answer: word.arabic,
      options: buildOptions(word.arabic, arabicCandidates, deckIndex),
      explanation: `${word.arabic} — правильная арабская форма для «${word.russian}».`,
    },
  ]);

  const needed = targetCount - lesson.questions.length;
  const finalCorrection = lesson.questions.at(-1);
  const contextualQuestions = lesson.questions.slice(0, -1);

  return {
    ...lesson,
    // Matches every Russian plural the descriptions use, so the count is never
    // left stale by a form the pattern failed to recognise.
    description: lesson.description.replace(/\d+\s+задани\S*/, taskCount(targetCount)),
    questions: [
      ...contextualQuestions,
      ...generated.slice(0, needed),
      ...(finalCorrection ? [finalCorrection] : []),
    ],
  };
}
