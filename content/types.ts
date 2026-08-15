export type Word = { arabic: string; russian: string; note?: string; audio?: string };

export type Question = {
  prompt: string;
  promptLang: "ar" | "ru";
  answer: string;
  options: string[];
  explanation: string;
};

/**
 * Which of the two classical disciplines a rule belongs to: نحو is how words
 * combine into a sentence, صرف is how a word itself is built from a root.
 */
export type GrammarKind = "nahw" | "sarf";

export type GrammarRule = {
  kind: GrammarKind;
  /** Russian heading, e.g. «Предложение без глагола». */
  title: string;
  /** The Arabic term the rule names, shown beside the heading. */
  term?: string;
  /**
   * How that term sounds, in Cyrillic. A learner who has only ever seen
   * «подлежащее» cannot ask about مُبْتَدَأ or recognise it when a teacher says
   * it aloud, so the term is taught as a word from the start.
   */
  termSound?: string;
  /** The صرف pattern under discussion, e.g. فَعَّال. */
  pattern?: string;
  explanation: string;
  /** Illustrations, drawn from words the learner has already met. */
  examples: { arabic: string; russian: string; note?: string }[];
};

/**
 * The grammar half of a lesson: the rules behind the forms the learner has just
 * drilled, followed by practice on them. It is taught as the lesson's last
 * part, and its questions are authored — the generator never touches them.
 */
export type GrammarBlock = {
  title: string;
  intro: string;
  rules: GrammarRule[];
  questions: Question[];
};

/**
 * Reading practice: a text the learner reads whole, tapping a sentence when it
 * does not come together. Its words are deliberately outside the course
 * vocabulary — nothing here becomes a card or a distractor.
 */
export type ReadingSentence = { arabic: string; russian: string };

export type ReadingText = { title: string; sentences: ReadingSentence[] };

export type ReadingSection = {
  id: number;
  /** The lesson this text is offered from. */
  lessonId: number;
  /** The book the text is taken from, shown to the learner. */
  source: string;
  texts: ReadingText[];
};

export type ReadingSummary = {
  id: number;
  lessonId: number;
  textCount: number;
  sentenceCount: number;
};

export type Lesson = {
  id: number;
  arabicTitle: string;
  title: string;
  description: string;
  tags: string[];
  decks: { title: string; words: Word[] }[];
  questions: Question[];
  grammar?: GrammarBlock;
};
