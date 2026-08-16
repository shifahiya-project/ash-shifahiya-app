import { lessonSummaries } from "../content/manifest";

export type SavedSession = {
  view: "learn" | "practice" | "grammar";
  lessonId: number;
  /** Which part the learner is in; the grammar block is the last one. */
  partIndex: number;
  /** Which rule of the grammar block is on screen, while reading them. */
  ruleIndex?: number;
  deckIndex: number;
  round: number;
  cardIndex: number;
  questionIndex: number;
  score: number;
  /** Counted apart from the lesson score, like the stored result. */
  grammarScore?: number;
  mistakes: string[];
  updatedAt?: number;
};

export type CardProgress = {
  box: number;
  nextReview: string;
  lastReviewed: string;
  correct: number;
  wrong: number;
};

/**
 * A reading text the learner has been through. Kept apart from the word cards:
 * its vocabulary is not part of the course, so it never enters the boxes.
 */
export type ReadingProgress = {
  box: number;
  nextReview: string;
  lastRead: string;
  reads: number;
};

/**
 * What an exam leaves behind: the best paper the learner has written and how
 * many they have written. A weak attempt never lowers a stored result, and no
 * attempt closes anything — the exam checks the course, it does not gate it.
 */
export type ExamResult = {
  best: number;
  attempts: number;
  /** ISO date of the first paper that cleared the mark. */
  passedAt?: string;
};

/** A paper in progress: a hundred answers are too many to lose to a closed tab. */
export type ExamSession = {
  examId: string;
  /** The order the questions are asked in, drawn once when the paper starts. */
  order: number[];
  index: number;
  score: number;
  mistakes: string[];
  updatedAt?: number;
};

export type LearningStats = {
  activeDates: string[];
  totalSeconds: number;
  masteredPhrases: string[];
};

export type Progress = {
  scores: Record<number, number>;
  /** Kept apart from the lesson score so adding a grammar block to a finished
   *  lesson neither rewrites its result nor makes it look like a loss. */
  grammarScores: Record<number, number>;
  sessions: Record<number, SavedSession>;
  cards: Record<string, CardProgress>;
  /** Keyed by the lesson the text is offered from. */
  readings: Record<number, ReadingProgress>;
  exams: Record<string, ExamResult>;
  examSession: ExamSession | null;
  stats: LearningStats;
};

export const CARD_PROGRESS_KEY = "shifahiya-card-progress-v1";
export const READING_PROGRESS_KEY = "shifahiya-reading-v1";
export const EXAM_RESULTS_KEY = "shifahiya-exams-v1";
export const EXAM_SESSION_KEY = "shifahiya-exam-session";
export const LEARNING_STATS_KEY = "shifahiya-learning-stats-v1";
export const ACTIVE_SESSION_KEY = "shifahiya-active-session";
export const lessonScoreKey = (id: number | string) => `shifahiya-lesson-${id}`;
export const grammarScoreKey = (id: number | string) => `shifahiya-grammar-${id}`;
export const lessonSessionKey = (id: number | string) => `shifahiya-session-${id}`;

export const EMPTY_STATS: LearningStats = { activeDates: [], totalSeconds: 0, masteredPhrases: [] };
const EMPTY: Progress = {
  scores: {},
  grammarScores: {},
  sessions: {},
  cards: {},
  readings: {},
  exams: {},
  examSession: null,
  stats: EMPTY_STATS,
};

// The learner's progress lives in localStorage, which React reads through
// useSyncExternalStore rather than by copying into state on mount: the server
// renders the empty snapshot, hydration matches it, and the stored values
// arrive in the same pass React does for any external store.
const listeners = new Set<() => void>();
let snapshot: Progress | null = null;

function read<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function readProgress(): Progress {
  const scores: Record<number, number> = {};
  const grammarScores: Record<number, number> = {};
  const sessions: Record<number, SavedSession> = {};

  for (const summary of lessonSummaries) {
    const score = window.localStorage.getItem(lessonScoreKey(summary.id));
    if (score !== null) scores[summary.id] = Number(score);
    const grammarScore = window.localStorage.getItem(grammarScoreKey(summary.id));
    if (grammarScore !== null) grammarScores[summary.id] = Number(grammarScore);
    const session = read<SavedSession | null>(lessonSessionKey(summary.id), null);
    if (session && session.lessonId === summary.id) sessions[summary.id] = session;
  }

  // A session interrupted mid-lesson is stored twice; the active copy wins.
  const active = read<SavedSession | null>(ACTIVE_SESSION_KEY, null);
  if (active && lessonSummaries.some((summary) => summary.id === active.lessonId)) {
    sessions[active.lessonId] = active;
  }

  return {
    scores,
    grammarScores,
    sessions,
    cards: read<Record<string, CardProgress>>(CARD_PROGRESS_KEY, {}),
    readings: read<Record<number, ReadingProgress>>(READING_PROGRESS_KEY, {}),
    exams: read<Record<string, ExamResult>>(EXAM_RESULTS_KEY, {}),
    examSession: read<ExamSession | null>(EXAM_SESSION_KEY, null),
    stats: { ...EMPTY_STATS, ...read<Partial<LearningStats>>(LEARNING_STATS_KEY, {}) },
  };
}

function publish() {
  snapshot = null;
  for (const listener of listeners) listener();
}

export const progressStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Must keep returning the same object until something actually changes. */
  getSnapshot(): Progress {
    snapshot ??= readProgress();
    return snapshot;
  },

  getServerSnapshot(): Progress {
    return EMPTY;
  },

  saveSession(session: SavedSession) {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    window.localStorage.setItem(lessonSessionKey(session.lessonId), JSON.stringify(session));
    publish();
  },

  /** Repeating a lesson can only raise its result, never take one away. */
  finishLesson(lessonId: number, score: number) {
    const earned = progressStore.getSnapshot().scores[lessonId] ?? 0;
    window.localStorage.setItem(lessonScoreKey(lessonId), String(Math.max(score, earned)));
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    window.localStorage.removeItem(lessonSessionKey(lessonId));
    publish();
  },

  /** Same rule as the lesson score: a repeat can only raise it. */
  finishGrammar(lessonId: number, score: number) {
    const earned = progressStore.getSnapshot().grammarScores[lessonId] ?? 0;
    window.localStorage.setItem(grammarScoreKey(lessonId), String(Math.max(score, earned)));
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    window.localStorage.removeItem(lessonSessionKey(lessonId));
    publish();
  },

  resetLesson(lessonId: number) {
    window.localStorage.removeItem(grammarScoreKey(lessonId));
    window.localStorage.removeItem(lessonScoreKey(lessonId));
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    window.localStorage.removeItem(lessonSessionKey(lessonId));
    publish();
  },

  updateCards(updater: (cards: Record<string, CardProgress>) => Record<string, CardProgress>) {
    const next = updater(progressStore.getSnapshot().cards);
    window.localStorage.setItem(CARD_PROGRESS_KEY, JSON.stringify(next));
    publish();
  },

  updateReadings(updater: (readings: Record<number, ReadingProgress>) => Record<number, ReadingProgress>) {
    const next = updater(progressStore.getSnapshot().readings);
    window.localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(next));
    publish();
  },

  /** Stamps the save itself, so a render never has to read the clock. */
  saveExamSession(session: Omit<ExamSession, "updatedAt">) {
    const stamped: ExamSession = { ...session, updatedAt: Date.now() };
    window.localStorage.setItem(EXAM_SESSION_KEY, JSON.stringify(stamped));
    publish();
  },

  dropExamSession() {
    window.localStorage.removeItem(EXAM_SESSION_KEY);
    publish();
  },

  /** Like the lesson score: another attempt can only raise the stored result. */
  finishExam(examId: string, score: number, passed: boolean) {
    const stored = progressStore.getSnapshot().exams[examId];
    const result: ExamResult = {
      best: Math.max(score, stored?.best ?? 0),
      attempts: (stored?.attempts ?? 0) + 1,
      passedAt: stored?.passedAt ?? (passed ? new Date().toISOString().slice(0, 10) : undefined),
    };
    const exams = { ...progressStore.getSnapshot().exams, [examId]: result };
    window.localStorage.setItem(EXAM_RESULTS_KEY, JSON.stringify(exams));
    window.localStorage.removeItem(EXAM_SESSION_KEY);
    publish();
  },

  updateStats(updater: (stats: LearningStats) => LearningStats) {
    const next = updater(progressStore.getSnapshot().stats);
    window.localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(next));
    publish();
  },

  replaceAll(progress: Progress) {
    for (const [id, score] of Object.entries(progress.scores)) {
      window.localStorage.setItem(lessonScoreKey(id), String(score));
    }
    for (const [id, score] of Object.entries(progress.grammarScores ?? {})) {
      window.localStorage.setItem(grammarScoreKey(id), String(score));
    }
    for (const [id, session] of Object.entries(progress.sessions)) {
      window.localStorage.setItem(lessonSessionKey(id), JSON.stringify(session));
    }
    window.localStorage.setItem(CARD_PROGRESS_KEY, JSON.stringify(progress.cards));
    window.localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress.readings ?? {}));
    window.localStorage.setItem(EXAM_RESULTS_KEY, JSON.stringify(progress.exams ?? {}));
    window.localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(progress.stats));
    publish();
  },
};
