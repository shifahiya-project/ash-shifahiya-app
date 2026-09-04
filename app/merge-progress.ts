// Types only: this module stays pure so the tests can import it directly,
// without pulling in the browser-bound store it describes.
import type {
  CardProgress,
  ExamResult,
  ExamSession,
  LearningStats,
  Progress,
  ReadingCourseSession,
  ReadingProgress,
  SavedSession,
} from "./progress-store";
import type { PodcastWatch } from "./podcast-catalog";
import type { DayPlan } from "./podcast-day";

// Two devices hold two independent histories, and neither is "the" truth: the
// phone may know about yesterday's review while the laptop knows about today's
// lesson. Overwriting one with the other loses real work, so both sides are
// merged field by field, always keeping the further-along value.

function mergeScores(mine: Record<number, number>, theirs: Record<number, number>) {
  const merged: Record<number, number> = { ...mine };
  for (const [id, score] of Object.entries(theirs)) {
    const key = Number(id);
    merged[key] = Math.max(merged[key] ?? 0, score);
  }
  return merged;
}

/**
 * The totals travel with the scores they belong to: the device holding the
 * better result also holds the number that result was earned out of. Taking
 * the larger total instead would print a loss the learner never suffered.
 */
function mergeScoreTotals(
  mine: Record<number, number>,
  theirs: Record<number, number>,
  myScores: Record<number, number>,
  theirScores: Record<number, number>,
) {
  const merged: Record<number, number> = {};
  for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const key = Number(id);
    const ours = myScores[key] ?? -1;
    const yours = theirScores[key] ?? -1;
    const winner = ours === yours
      ? Math.max(mine[key] ?? 0, theirs[key] ?? 0)
      : (ours > yours ? mine[key] : theirs[key]);
    if (winner !== undefined) merged[key] = winner;
  }
  return merged;
}

/**
 * A card the learner answered later is the one that knows its real box. Ties
 * fall through to the box and then to the number of answers behind it, so the
 * winner never depends on which side was passed first.
 */
function laterCard(mine: CardProgress, theirs: CardProgress) {
  const rank = (card: CardProgress) => [card.lastReviewed, card.box, card.correct + card.wrong];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) return mineRank[i] > theirsRank[i] ? mine : theirs;
  }
  return mine;
}

function mergeCards(mine: Record<string, CardProgress>, theirs: Record<string, CardProgress>) {
  const merged: Record<string, CardProgress> = { ...mine };
  for (const [id, card] of Object.entries(theirs)) {
    const existing = merged[id];
    merged[id] = existing ? laterCard(existing, card) : card;
  }
  return merged;
}

/**
 * An unfinished lesson is a position, not an accumulation: the later save is
 * simply where the learner is. A session without a timestamp predates the
 * field and loses to one that has it; saves from the same millisecond are
 * settled by which one is further into the lesson.
 */
function laterSession(mine: SavedSession, theirs: SavedSession) {
  const rank = (session: SavedSession) => [
    session.updatedAt ?? 0,
    session.partIndex,
    session.questionIndex,
    session.deckIndex,
  ];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) return mineRank[i] > theirsRank[i] ? mine : theirs;
  }
  return mine;
}

function mergeSessions(mine: Record<number, SavedSession>, theirs: Record<number, SavedSession>) {
  const merged: Record<number, SavedSession> = { ...mine };
  for (const [id, session] of Object.entries(theirs)) {
    const key = Number(id);
    const existing = merged[key];
    merged[key] = existing ? laterSession(existing, session) : session;
  }
  return merged;
}

/**
 * A text read on either device is read. The later reading knows the real box,
 * and a tie falls through to the box and the number of readings behind it, so
 * the winner does not depend on which side was passed first.
 */
function laterReading(mine: ReadingProgress, theirs: ReadingProgress) {
  const rank = (item: ReadingProgress) => [item.lastRead, item.box, item.reads];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) return mineRank[i] > theirsRank[i] ? mine : theirs;
  }
  return mine;
}

function mergeReadings(mine: Record<number, ReadingProgress>, theirs: Record<number, ReadingProgress>) {
  const merged: Record<number, ReadingProgress> = { ...mine };
  for (const [id, reading] of Object.entries(theirs)) {
    const key = Number(id);
    const existing = merged[key];
    merged[key] = existing ? laterReading(existing, reading) : reading;
  }
  return merged;
}

/**
 * Two devices can hold two papers of the same exam. The better result stands,
 * the attempts are the larger count rather than the sum — the same paper synced
 * twice must not read as two — and a pass, once earned, keeps its date.
 */
function mergeExams(mine: Record<string, ExamResult>, theirs: Record<string, ExamResult>) {
  const merged: Record<string, ExamResult> = { ...mine };
  for (const [id, result] of Object.entries(theirs)) {
    const existing = merged[id];
    if (!existing) {
      merged[id] = result;
      continue;
    }
    const passed = [existing.passedAt, result.passedAt].filter(Boolean).sort();
    merged[id] = {
      best: Math.max(existing.best, result.best),
      attempts: Math.max(existing.attempts, result.attempts),
      ...(passed[0] ? { passedAt: passed[0] } : {}),
    };
  }
  return merged;
}

/** An unfinished paper is a position, like an unfinished lesson: the later save wins. */
function laterExamSession(mine: ExamSession | null, theirs: ExamSession | null) {
  if (!mine) return theirs ?? null;
  if (!theirs) return mine;
  const rank = (session: ExamSession) => [session.updatedAt ?? 0, session.index];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) return mineRank[i] > theirsRank[i] ? mine : theirs;
  }
  return mine;
}

/**
 * A lesson of the reading courses is a position too: the later save is where
 * the learner is. Both courses run a lesson the same way, so one rule settles
 * either of them.
 */
function laterReadingSession(mine: ReadingCourseSession, theirs: ReadingCourseSession) {
  const rank = (session: ReadingCourseSession) => [session.updatedAt ?? 0, session.index];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) return mineRank[i] > theirsRank[i] ? mine : theirs;
  }
  return mine;
}

function mergeReadingSessions(
  mine: Record<number, ReadingCourseSession>,
  theirs: Record<number, ReadingCourseSession>,
) {
  const merged: Record<number, ReadingCourseSession> = { ...mine };
  for (const [id, session] of Object.entries(theirs)) {
    const key = Number(id);
    const existing = merged[key];
    merged[key] = existing ? laterReadingSession(existing, session) : session;
  }
  return merged;
}

function mergeStats(mine: LearningStats, theirs: LearningStats): LearningStats {
  return {
    // A day spent studying on either device is a day studied.
    activeDates: [...new Set([...mine.activeDates, ...theirs.activeDates])].sort(),
    // Time is counted per device without a shared clock, so adding the two
    // would invent minutes that were never spent. The larger side is the one
    // that has seen more of the history.
    totalSeconds: Math.max(mine.totalSeconds, theirs.totalSeconds),
    // Sorted, like the dates above, so that merging two devices gives the same
    // result no matter which of them synced first.
    masteredPhrases: [...new Set([...mine.masteredPhrases, ...theirs.masteredPhrases])].sort(),
  };
}

/**
 * Combines two snapshots of a learner's progress. Order does not matter: the
 * result is the same whichever side is passed first.
 */
export function mergeProgress(mine: Progress, theirs: Progress): Progress {
  return {
    scores: mergeScores(mine.scores, theirs.scores),
    scoreTotals: mergeScoreTotals(
      mine.scoreTotals ?? {},
      theirs.scoreTotals ?? {},
      mine.scores,
      theirs.scores,
    ),
    grammarScores: mergeScores(mine.grammarScores, theirs.grammarScores),
    sessions: mergeSessions(mine.sessions, theirs.sessions),
    cards: mergeCards(mine.cards, theirs.cards),
    readings: mergeReadings(mine.readings ?? {}, theirs.readings ?? {}),
    exams: mergeExams(mine.exams ?? {}, theirs.exams ?? {}),
    examSession: laterExamSession(mine.examSession ?? null, theirs.examSession ?? null),
    part2Scores: mergeScores(mine.part2Scores ?? {}, theirs.part2Scores ?? {}),
    part2Sessions: mergeReadingSessions(mine.part2Sessions ?? {}, theirs.part2Sessions ?? {}),
    part3Scores: mergeScores(mine.part3Scores ?? {}, theirs.part3Scores ?? {}),
    part3Sessions: mergeReadingSessions(mine.part3Sessions ?? {}, theirs.part3Sessions ?? {}),
    stats: mergeStats(mine.stats, theirs.stats),
  };
}

/** Fills in anything a stored payload is missing, so old backups still load. */
export function normalizeProgress(value: Partial<Progress> | null | undefined): Progress {
  return {
    scores: value?.scores ?? {},
    scoreTotals: value?.scoreTotals ?? {},
    grammarScores: value?.grammarScores ?? {},
    sessions: value?.sessions ?? {},
    cards: value?.cards ?? {},
    readings: value?.readings ?? {},
    exams: value?.exams ?? {},
    examSession: value?.examSession ?? null,
    part2Scores: value?.part2Scores ?? {},
    part2Sessions: value?.part2Sessions ?? {},
    part3Scores: value?.part3Scores ?? {},
    part3Sessions: value?.part3Sessions ?? {},
    stats: {
      activeDates: [],
      totalSeconds: 0,
      masteredPhrases: [],
      ...(value?.stats ?? {}),
    },
  };
}

// ── Podcasts ──────────────────────────────────────────────────────────────
//
// The habit's own record, merged on the same terms as the course: a day
// watched on either device is a day watched, and neither side is the truth.
//
// Only what the habit records travels — the watch log, the pinned episodes and
// the channels. The length window stays on its device because there is no
// timestamp to say which of two settings is the newer one, and guessing would
// silently change what a learner is offered. The YouTube key never leaves the
// device it was typed on: it is a credential, not progress.

export type SyncedPodcasts = {
  watches: PodcastWatch[];
  plans: Record<string, DayPlan>;
  sources: string[];
};

export const EMPTY_PODCASTS: SyncedPodcasts = { watches: [], plans: {}, sources: [] };

/**
 * Two notes for one episode. Neither carries a time, so the choice has to be
 * made from the text itself: something beats nothing, and the longer of two
 * answers is the one that says more. Equal lengths fall through to a
 * comparison, which decides nothing of substance but decides it the same way
 * on both devices.
 */
function pickNote(mine?: string, theirs?: string) {
  if (!mine) return theirs;
  if (!theirs) return mine;
  if (mine === theirs) return mine;
  if (mine.length !== theirs.length) return mine.length > theirs.length ? mine : theirs;
  return mine > theirs ? mine : theirs;
}

/**
 * The same episode credited on both devices is one watch, dated when it was
 * first credited: the later copy is the same viewing arriving twice, and
 * counting it again would inflate both the episode count and the minutes.
 */
function mergeWatch(mine: PodcastWatch, theirs: PodcastWatch): PodcastWatch {
  const rank = (watch: PodcastWatch) => [watch.watchedAt, watch.date, watch.seconds];
  const [mineRank, theirsRank] = [rank(mine), rank(theirs)];
  let first = mine;
  for (let i = 0; i < mineRank.length; i += 1) {
    if (mineRank[i] !== theirsRank[i]) {
      first = mineRank[i] < theirsRank[i] ? mine : theirs;
      break;
    }
  }
  const note = pickNote(mine.note, theirs.note);
  return { ...first, ...(note ? { note } : {}) };
}

function mergeWatches(mine: PodcastWatch[], theirs: PodcastWatch[]): PodcastWatch[] {
  const byId = new Map<string, PodcastWatch>();
  for (const watch of mine) byId.set(watch.videoId, watch);
  for (const watch of theirs) {
    const existing = byId.get(watch.videoId);
    byId.set(watch.videoId, existing ? mergeWatch(existing, watch) : watch);
  }
  // Sorted, so merging two devices gives the same list whichever synced first.
  return [...byId.values()].sort((a, b) => a.videoId.localeCompare(b.videoId));
}

/**
 * A day's plan is what that day was offered, not something that accumulates.
 * The side that pinned more episodes has seen more of the day, so it stands;
 * refusals are pooled, because an episode turned down on either device is one
 * the learner has already decided about.
 */
function mergePlan(mine: DayPlan, theirs: DayPlan): DayPlan {
  const skipped = [...new Set([...mine.skipped, ...theirs.skipped])].sort();
  if (mine.videoIds.length !== theirs.videoIds.length) {
    const longer = mine.videoIds.length > theirs.videoIds.length ? mine : theirs;
    return { ...longer, skipped };
  }
  const kept = mine.videoIds.join() >= theirs.videoIds.join() ? mine : theirs;
  return { ...kept, skipped };
}

function mergePlans(mine: Record<string, DayPlan>, theirs: Record<string, DayPlan>) {
  const merged: Record<string, DayPlan> = { ...mine };
  for (const [date, plan] of Object.entries(theirs)) {
    const existing = merged[date];
    merged[date] = existing ? mergePlan(existing, plan) : plan;
  }
  return merged;
}

export function mergePodcasts(mine: SyncedPodcasts, theirs: SyncedPodcasts): SyncedPodcasts {
  return {
    watches: mergeWatches(mine.watches, theirs.watches),
    plans: mergePlans(mine.plans, theirs.plans),
    // A channel added on either device is a channel the learner wants.
    sources: [...new Set([...mine.sources, ...theirs.sources])].sort(),
  };
}

export function normalizePodcasts(value: Partial<SyncedPodcasts> | null | undefined): SyncedPodcasts {
  return {
    watches: value?.watches ?? [],
    plans: value?.plans ?? {},
    sources: value?.sources ?? [],
  };
}

/** Everything one device syncs: the course, and the habit beside it. */
export type SyncedProgress = Progress & { podcasts: SyncedPodcasts };

export function mergeSynced(mine: SyncedProgress, theirs: SyncedProgress): SyncedProgress {
  return {
    ...mergeProgress(mine, theirs),
    podcasts: mergePodcasts(mine.podcasts, theirs.podcasts),
  };
}

/** A payload written before podcasts synced simply has none of them. */
export function normalizeSynced(
  value: (Partial<Progress> & { podcasts?: Partial<SyncedPodcasts> }) | null | undefined,
): SyncedProgress {
  return { ...normalizeProgress(value), podcasts: normalizePodcasts(value?.podcasts) };
}
