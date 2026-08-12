// Types only: this module stays pure so the tests can import it directly,
// without pulling in the browser-bound store it describes.
import type { CardProgress, LearningStats, Progress, SavedSession } from "./progress-store";

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
    grammarScores: mergeScores(mine.grammarScores, theirs.grammarScores),
    sessions: mergeSessions(mine.sessions, theirs.sessions),
    cards: mergeCards(mine.cards, theirs.cards),
    stats: mergeStats(mine.stats, theirs.stats),
  };
}

/** Fills in anything a stored payload is missing, so old backups still load. */
export function normalizeProgress(value: Partial<Progress> | null | undefined): Progress {
  return {
    scores: value?.scores ?? {},
    grammarScores: value?.grammarScores ?? {},
    sessions: value?.sessions ?? {},
    cards: value?.cards ?? {},
    stats: {
      activeDates: [],
      totalSeconds: 0,
      masteredPhrases: [],
      ...(value?.stats ?? {}),
    },
  };
}
