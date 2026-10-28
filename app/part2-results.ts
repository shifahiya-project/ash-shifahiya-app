import { legacyPart2QuestionCounts } from "../content/part2/legacy-question-counts.ts";

/** Different editions and paper sizes keep independent best results. */
export type Part2Result = {
  revision: string;
  score: number;
  total?: number;
};
export type Part2Results = Record<number, Part2Result[]>;

const paperKey = (result: Part2Result) => JSON.stringify([result.revision, result.total ?? null]);

/** Dated content revisions sort after the unversioned course. */
function compareResults(a: Part2Result, b: Part2Result) {
  if (a.revision !== b.revision) {
    if (a.revision === "legacy") return -1;
    if (b.revision === "legacy") return 1;
    return a.revision > b.revision ? 1 : -1;
  }
  const rate = (result: Part2Result) => result.total === undefined ? -1
    : result.total === 0 ? 1 : result.score / result.total;
  return rate(a) - rate(b) || (a.total ?? -1) - (b.total ?? -1) || a.score - b.score;
}

/** Merge whole records, never a score from one paper and a total from another. */
export function mergePart2Results(mine: Part2Results, theirs: Part2Results): Part2Results {
  const merged: Part2Results = {};
  for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const key = Number(id);
    const papers = new Map<string, Part2Result>();
    for (const result of [...(mine[key] ?? []), ...(theirs[key] ?? [])]) {
      const previous = papers.get(paperKey(result));
      if (!previous || result.score > previous.score) papers.set(paperKey(result), result);
    }
    if (papers.size) merged[key] = [...papers.values()].sort(compareResults);
  }
  return merged;
}

/** Old local keys and backups belong to the old course, not today's word count. */
export function normalizePart2Results(
  scores: Record<number, number> = {},
  results: Part2Results = {},
): Part2Results {
  const normalized = mergePart2Results({}, results);
  for (const [id, score] of Object.entries(scores)) {
    const key = Number(id);
    if (normalized[key]?.length) continue;
    const total = legacyPart2QuestionCounts[key];
    normalized[key] = [{ revision: "legacy", score,
      // An unknown older paper must not be given a made-up denominator.
      ...(total !== undefined && score <= total ? { total } : {}) }];
  }
  return normalized;
}

/** Prefer the newest completed edition; older papers remain in its history. */
export function part2ResultFor(results: Part2Results, lessonId: number): Part2Result | undefined {
  return results[lessonId]?.reduce((best, result) => compareResults(result, best) > 0 ? result : best);
}

/** Numeric completion keys remain compatible with access gates and older clients. */
export function part2ScoresFromResults(results: Part2Results): Record<number, number> {
  return Object.fromEntries(Object.keys(results).map(Number).map((id) => [id, part2ResultFor(results, id)!.score]));
}

export function part2ResultLabel(result: Part2Result) {
  return result.total === undefined ? String(result.score) : `${result.score}/${result.total}`;
}
