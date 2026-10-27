import type { Part2Session } from "./progress-store.ts";

/**
 * Move unfinished lessons to the vocabulary-first sequence without changing
 * completed lesson scores or replaying context questions already answered.
 * The old practice index always refers to the context paper, never to the new
 * translation paper. The caller persists the returned position when opening it.
 */
export function upgradePart2Session(
  session: Part2Session,
  contextQuestionCount: number,
): Part2Session {
  if (session.flowVersion === 2) return session;
  const contextTotal = Math.max(0, Math.trunc(contextQuestionCount) || 0);
  const contextIndex = session.view === "reading" ? contextTotal
    : session.view === "practice" ? Math.min(contextTotal, Math.max(0, Math.trunc(session.index) || 0))
      : 0;
  return {
    ...session,
    flowVersion: 2,
    round: 1,
    vocabularyScore: 0,
    contextIndex,
    view: session.view === "learn" ? "learn" : "vocabulary",
    index: session.view === "learn" ? session.index : 0,
    answered: undefined,
  };
}
