import { PART4_REVISION } from "../content/part4/revision.ts";
import type { Progress, ReadingCourseSession } from "./progress-store.ts";

/** Lesson numbers only identify a lesson within one edition of the book. */
export type Part4RevisionRecord = {
  scores: Record<number, number>;
  sessions: Record<number, ReadingCourseSession>;
  /** The denominator belongs to the score saved in the same record. */
  totals: Record<number, number>;
};
export type Part4Revisions = Record<string, Part4RevisionRecord>;

export const PART4_REVISIONS_KEY = "shifahiya-p4-revisions-v1";

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isLessonId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));

function normalizeSession(value: unknown, lessonId: number): ReadingCourseSession | undefined {
  if (!isObject(value) || value.lessonId !== lessonId
    || (value.view !== "learn" && value.view !== "practice" && value.view !== "reading")
    || !isCount(value.index) || !isCount(value.score)
    || !Array.isArray(value.mistakes) || !value.mistakes.every((item) => typeof item === "string")
    || (value.updatedAt !== undefined && !isCount(value.updatedAt))
    || (value.wordIndexes !== undefined && (!Array.isArray(value.wordIndexes)
      || !value.wordIndexes.every(isCount)))) return undefined;
  return { ...value, mistakes: [...value.mistakes],
    ...(value.wordIndexes ? { wordIndexes: [...value.wordIndexes as number[]] } : {}),
  } as ReadingCourseSession;
}

/** Unmarked numeric scores remain legacy history and never enter an edition. */
export function normalizePart4Revisions(value: unknown): Part4Revisions {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([revision, record]) => {
    if (!revision.trim() || !isObject(record)) return [];
    const scores = Object.fromEntries(Object.entries(isObject(record.scores) ? record.scores : {})
      .filter(([id, score]) => isLessonId(id) && isCount(score))) as Record<number, number>;
    const totals = Object.fromEntries(Object.entries(isObject(record.totals) ? record.totals : {})
      .filter(([id, total]) => isLessonId(id) && scores[Number(id)] !== undefined
        && isCount(total) && total >= scores[Number(id)])) as Record<number, number>;
    const sessions = Object.fromEntries(Object.entries(isObject(record.sessions) ? record.sessions : {})
      .flatMap(([id, session]) => {
        const normalized = isLessonId(id) ? normalizeSession(session, Number(id)) : undefined;
        return normalized ? [[id, normalized]] : [];
      })) as Record<number, ReadingCourseSession>;
    return [[revision, { scores, sessions, totals }]];
  }));
}

function laterSession(mine: ReadingCourseSession, theirs: ReadingCourseSession) {
  const phases = { learn: 0, practice: 1, reading: 2 };
  const rank = (session: ReadingCourseSession) => [session.updatedAt ?? 0,
    phases[session.view], session.index, session.score];
  const [ours, yours] = [rank(mine), rank(theirs)];
  for (let i = 0; i < ours.length; i += 1) {
    if (ours[i] !== yours[i]) return ours[i] > yours[i] ? mine : theirs;
  }
  return JSON.stringify(mine) >= JSON.stringify(theirs) ? mine : theirs;
}

/** Merge each edition independently; a denominator travels with its winning score. */
export function mergePart4Revisions(mine: unknown, theirs: unknown): Part4Revisions {
  const ours = normalizePart4Revisions(mine);
  const yours = normalizePart4Revisions(theirs);
  return Object.fromEntries([...new Set([...Object.keys(ours), ...Object.keys(yours)])].map((revision) => {
    const a = ours[revision] ?? { scores: {}, sessions: {}, totals: {} };
    const b = yours[revision] ?? { scores: {}, sessions: {}, totals: {} };
    const scores: Record<number, number> = {};
    const totals: Record<number, number> = {};
    for (const id of new Set([...Object.keys(a.scores), ...Object.keys(b.scores)])) {
      const key = Number(id);
      const aScore = a.scores[key] ?? -1;
      const bScore = b.scores[key] ?? -1;
      // The larger known denominator settles equal scores deterministically.
      const winner = aScore > bScore || (aScore === bScore
        && (a.totals[key] ?? -1) >= (b.totals[key] ?? -1)) ? a : b;
      scores[key] = winner.scores[key];
      if (winner.totals[key] !== undefined) totals[key] = winner.totals[key];
    }
    const sessions: Record<number, ReadingCourseSession> = { ...a.sessions };
    for (const [id, session] of Object.entries(b.sessions)) {
      const key = Number(id);
      sessions[key] = sessions[key] ? laterSession(sessions[key], session) : session;
    }
    return [revision, { scores, sessions, totals }];
  }));
}

/** The new complete edition starts fresh; legacy papers remain archived. */
export function getPart4Progress(
  progress: Partial<Pick<Progress, "part4Revisions" | "part4Scores" | "part4Sessions">>,
): Part4RevisionRecord & { inherited: Set<number> } {
  const record = normalizePart4Revisions(progress.part4Revisions)[PART4_REVISION]
    ?? { scores: {}, sessions: {}, totals: {} };
  return { ...record, inherited: new Set<number>() };
}
