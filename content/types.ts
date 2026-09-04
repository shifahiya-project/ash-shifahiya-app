export type Word = { arabic: string; russian: string; note?: string; audio?: string };

export type Question = {
  prompt: string;
  promptLang: "ar" | "ru";
  answer: string;
  options: string[];
  explanation: string;
};

/**
 * Which of the two classical disciplines a rule belongs to: نَحْو is how words
 * combine into a sentence, صَرْف is how a word itself is built from a root.
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
  /** The صَرْف pattern under discussion, e.g. فَعَّال. */
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
 * The second course is built the other way round from the first: it does not
 * teach forms and then use them, it takes a text and gives the learner the
 * words that text needs. A lesson is a set of new words — each carried by the
 * sentence it will be met in — followed by the text itself.
 */
export type Part2WordKind =
  | "verb"
  | "noun"
  | "masdar"
  | "participle"
  | "adj"
  | "adverb"
  | "expression";

export type Part2Word = {
  /** The dictionary form as the glossary gives it: مَكَثَ (يَمْكُثُ), مَخْزَنٌ (مَخَازِنُ). */
  arabic: string;
  russian: string;
  kind: Part2WordKind;
  /** The sentence from this lesson's own text where the word appears. */
  contextArabic: string;
  contextRussian: string;
  /**
   * The word as it stands inside that sentence — inflected, and often carrying
   * a prefix or a pronoun. Present when it could be located; the exercise puts
   * the blank exactly there, and falls back to translating the sentence when
   * it is missing.
   */
  contextForm?: string;
};

/** One story of the lesson's text, under the title the book gives it. */
export type Part2Story = {
  arabicTitle: string;
  title: string;
  sentences: ReadingSentence[];
};

export type Part2Lesson = {
  id: number;
  /** Which book the lesson is taken from — the course runs through six. */
  book: string;
  title: string;
  words: Part2Word[];
  stories: Part2Story[];
};

/**
 * The third course is a scholarly text — «Основы исламского вероубеждения» in
 * twenty lessons — and its glossary is built the way such a book needs: mostly
 * terms, with the proper names and particles the argument turns on. It carries
 * no example sentences, so a word here is taught by its dictionary form and its
 * meaning, and met again whole when the lesson's text is read.
 */
export type Part3WordKind =
  | "verb"
  | "noun"
  | "masdar"
  | "adjective"
  | "expression"
  | "term"
  | "proper_name"
  | "particle";

export type Part3Word = {
  /** The dictionary form as the glossary gives it: مَذْهَبٌ (مَذَاهِبُ), شَرَطَ (يَشْرُطُ). */
  arabic: string;
  russian: string;
  kind: Part3WordKind;
};

export type Part3Lesson = {
  id: number;
  /** Which بَاب of the book the lesson belongs to: Иляхийят, Пророчества, Сам‘ийят. */
  section: string;
  arabicTitle: string;
  title: string;
  words: Part3Word[];
  /**
   * The lesson's text, read whole. The book argues in paragraphs rather than
   * sentences, so a fragment is longer here than a line of the second course's
   * stories — it is the unit the translation is aligned on.
   */
  fragments: ReadingSentence[];
};

export type Part3Summary = {
  id: number;
  section: string;
  arabicTitle: string;
  title: string;
  wordCount: number;
  fragmentCount: number;
};

export type Part2Summary = {
  id: number;
  book: string;
  title: string;
  wordCount: number;
  storyCount: number;
  sentenceCount: number;
  storyTitles: string[];
};

/**
 * An exam question carries which half of the course it checks, so the paper can
 * hold its shape: the bulk is vocabulary, and grammar keeps to its share.
 */
export type ExamArea = "vocab" | "grammar";

export type ExamQuestion = Question & { area: ExamArea };

export type Exam = {
  id: "midterm" | "final";
  title: string;
  intro: string;
  /** The last lesson the paper may draw on. */
  afterLesson: number;
  questions: ExamQuestion[];
};

export type ExamSummary = {
  id: Exam["id"];
  title: string;
  afterLesson: number;
  questionCount: number;
  grammarCount: number;
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
