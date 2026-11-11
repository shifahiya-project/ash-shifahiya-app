import type { Part2Session } from "./progress-store.ts";
import { nextPart2WordStep, part2WordPlan } from "./part2-word-plan.ts";

/**
 * A content replacement archives an unfinished paper and starts its new words.
 * Otherwise move legacy sessions to the vocabulary-first sequence without changing
 * completed lesson scores or replaying context questions already answered.
 * The old practice index always refers to the context paper, never to the new
 * translation paper. The caller persists the returned position when opening it.
 */
export function upgradePart2Session(
  session: Part2Session,
  contextQuestionCount: number,
  contentRevision?: string,
  wordCount?: number,
): Part2Session {
  if (contentRevision && session.contentRevision !== contentRevision) {
    const fresh: Part2Session = { ...session, contentRevision, archivedSession: session,
      view: "learn", index: 0, score: 0, mistakes: [], flowVersion: 2,
      round: 1, vocabularyScore: 0, contextIndex: 0, answered: undefined,
      wordPlanIndex: undefined, wordPlanCredit: undefined };
    return wordCount === undefined ? fresh : withWordPlan(fresh, wordCount);
  }
  if (session.flowVersion === 3) return session;
  if (session.flowVersion === 2) return wordCount === undefined ? session : withWordPlan(session, wordCount);
  const contextTotal = Math.max(0, Math.trunc(contextQuestionCount) || 0);
  const contextIndex = session.view === "reading" ? contextTotal
    : session.view === "practice" ? Math.min(contextTotal, Math.max(0, Math.trunc(session.index) || 0))
      : 0;
  const upgraded: Part2Session = {
    ...session,
    flowVersion: 2,
    round: 1,
    vocabularyScore: 0,
    contextIndex,
    view: session.view === "learn" ? "learn" : "vocabulary",
    index: session.view === "learn" ? session.index : 0,
    answered: undefined,
  };
  return wordCount === undefined ? upgraded : withWordPlan(upgraded, wordCount);
}

/** Keep earned exposures and translation answers while interleaving the remaining work. */
function withWordPlan(session: Part2Session, wordCount: number): Part2Session {
  const plan = part2WordPlan(wordCount);
  if (session.view !== "learn" && session.view !== "vocabulary") {
    return { ...session, flowVersion: 3, wordPlanIndex: plan.length };
  }
  const index = Math.max(0, session.index);
  const credit = session.view === "vocabulary"
    ? { firstPass: wordCount, secondPass: wordCount, vocabulary: index }
    : { firstPass: session.round === 2 ? wordCount : index,
      secondPass: session.round === 2 ? index : 0, vocabulary: 0 };
  const wordPlanIndex = nextPart2WordStep(plan, 0, credit);
  const step = plan[wordPlanIndex];
  return { ...session, flowVersion: 3, wordPlanIndex, wordPlanCredit: credit,
    view: step?.view ?? "reading", index: step?.index ?? 0, round: step?.round ?? 1,
    answered: step?.view === session.view && step.index === session.index ? session.answered : undefined };
}
