/**
 * The memorisation part's own corner of localStorage, read the way the course
 * reads its progress: through useSyncExternalStore, so the server renders an
 * empty snapshot, hydration matches it, and the stored values arrive in the
 * pass React does for any external store.
 *
 * Separate keys from the course on purpose. Working through a topic is not a
 * lesson: it opens nothing, it changes no lesson score, and it puts no card
 * into the Leitner boxes of the course. The two only meet on the home screen,
 * where the number of cards due today is shown as a reminder — and a reminder
 * is all it is.
 */
import type { SyncedTopics } from "./merge-progress.ts";
import type { TopicCard, TopicExamResult, TopicGrade } from "./topic-schedule.ts";
import {
  cardKey,
  demoteTopicCard,
  masterTopicCard,
  nextTopicCard,
  resetTopicCard,
  topicDate,
} from "./topic-schedule.ts";

export const TOPIC_CARDS_KEY = "shifahiya-topic-cards-v1";
export const TOPIC_STEPS_KEY = "shifahiya-topic-steps-v1";
export const TOPIC_EXAMS_KEY = "shifahiya-topic-exams-v1";

/** What the memorisation part keeps, which is exactly what it syncs. */
export type TopicState = SyncedTopics;

const EMPTY: TopicState = { cards: {}, steps: {}, exams: {} };

const listeners = new Set<() => void>();
let snapshot: TopicState | null = null;

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

function readState(): TopicState {
  return {
    cards: read<Record<string, TopicCard>>(TOPIC_CARDS_KEY, {}),
    steps: read<Record<string, string>>(TOPIC_STEPS_KEY, {}),
    exams: read<Record<string, TopicExamResult>>(TOPIC_EXAMS_KEY, {}),
  };
}

function publish() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function writeCards(cards: Record<string, TopicCard>) {
  window.localStorage.setItem(TOPIC_CARDS_KEY, JSON.stringify(cards));
  publish();
}

export const stepKey = (topicId: string, stepId: string) => `${topicId}:${stepId}`;

export const topicStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Must keep returning the same object until something actually changes. */
  getSnapshot(): TopicState {
    snapshot ??= readState();
    return snapshot;
  },

  getServerSnapshot(): TopicState {
    return EMPTY;
  },

  /** Moves one unit along the schedule after the learner has graded it. */
  grade(topicId: string, unitId: string, grade: TopicGrade) {
    const cards = topicStore.getSnapshot().cards;
    const key = cardKey(topicId, unitId);
    writeCards({ ...cards, [key]: nextTopicCard(cards[key], grade) });
  },

  /**
   * Retires one unit into the last box, on the learner's word that they know
   * it. The grades say how the recall went; this says the card should stop
   * taking up the attention the forgotten ones need.
   */
  master(topicId: string, unitId: string) {
    const cards = topicStore.getSnapshot().cards;
    const key = cardKey(topicId, unitId);
    writeCards({ ...cards, [key]: masterTopicCard(cards[key]) });
  },

  /**
   * Sends units back to the start of the schedule, keeping what they know
   * about themselves. The exam uses it: a question left unanswered says more
   * than the last review did.
   */
  resetUnits(topicId: string, unitIds: string[]) {
    if (unitIds.length === 0) return;
    const cards = { ...topicStore.getSnapshot().cards };
    for (const unitId of unitIds) {
      const key = cardKey(topicId, unitId);
      cards[key] = resetTopicCard(cards[key]);
    }
    writeCards(cards);
  },

  /** Sends units one box back — the exam's «частично». */
  demoteUnits(topicId: string, unitIds: string[]) {
    if (unitIds.length === 0) return;
    const cards = { ...topicStore.getSnapshot().cards };
    for (const unitId of unitIds) {
      const key = cardKey(topicId, unitId);
      cards[key] = demoteTopicCard(cards[key]);
    }
    writeCards(cards);
  },

  /** A step is dated the first time it is finished and keeps that date. */
  markStep(topicId: string, stepId: string) {
    const steps = topicStore.getSnapshot().steps;
    const key = stepKey(topicId, stepId);
    if (steps[key]) return;
    window.localStorage.setItem(TOPIC_STEPS_KEY, JSON.stringify({ ...steps, [key]: topicDate() }));
    publish();
  },

  /** A weaker paper never overwrites a better one, as in the course's exams. */
  saveExam(topicId: string, score: number, total: number, passed: boolean) {
    const exams = topicStore.getSnapshot().exams;
    const previous = exams[topicId];
    const result: TopicExamResult = {
      best: Math.max(previous?.best ?? 0, score),
      total,
      attempts: (previous?.attempts ?? 0) + 1,
      lastAt: topicDate(),
      ...(previous?.passedAt ? { passedAt: previous.passedAt } : passed ? { passedAt: topicDate() } : {}),
    };
    window.localStorage.setItem(TOPIC_EXAMS_KEY, JSON.stringify({ ...exams, [topicId]: result }));
    publish();
  },

  /** Everything about a topic that belongs on the learner's other devices. */
  syncedSnapshot(): SyncedTopics {
    return topicStore.getSnapshot();
  },

  /** Writes back the merge of this device and the server. */
  applySynced(next: SyncedTopics) {
    window.localStorage.setItem(TOPIC_CARDS_KEY, JSON.stringify(next.cards));
    window.localStorage.setItem(TOPIC_STEPS_KEY, JSON.stringify(next.steps));
    window.localStorage.setItem(TOPIC_EXAMS_KEY, JSON.stringify(next.exams));
    publish();
  },
};
