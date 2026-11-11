export type Part2WordCredit = { firstPass: number; secondPass: number; vocabulary: number };

export type Part2WordStep = {
  view: "learn" | "vocabulary";
  index: number;
  round: 1 | 2;
  block: number;
  blockCount: number;
  blockStart: number;
  blockEnd: number;
  groupStart: number;
  groupEnd: number;
};

/** Two passes per five words, then translation after roughly thirty words.
 * Balance the blocks so a long lesson never ends with a tiny extra paper.
 * Indices always refer to the original glossary and its persistent card IDs.
 */
export function part2WordPlan(wordCount: number): Part2WordStep[] {
  const total = Math.max(0, Math.trunc(wordCount));
  if (!total) return [];
  const blockCount = Math.max(1, Math.round(total / 30), Math.ceil(total / 40));
  const base = Math.floor(total / blockCount);
  const remainder = total % blockCount;
  const plan: Part2WordStep[] = [];
  let start = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const end = start + base + Number(block < remainder);
    const bounds = { block, blockCount, blockStart: start, blockEnd: end };
    for (let groupStart = start; groupStart < end; groupStart += 5) {
      const groupEnd = Math.min(groupStart + 5, end);
      for (const round of [1, 2] as const) {
        for (let index = groupStart; index < groupEnd; index += 1) {
          plan.push({ ...bounds, view: "learn", index, round, groupStart, groupEnd });
        }
      }
    }
    for (let index = start * 2; index < end * 2; index += 1) {
      plan.push({ ...bounds, view: "vocabulary", index, round: 2, groupStart: start, groupEnd: end });
    }
    start = end;
  }
  return plan;
}

/** A migrated whole-lesson run has already covered some future plan steps. */
export function nextPart2WordStep(plan: Part2WordStep[], from: number, credit?: Part2WordCredit): number {
  let cursor = Math.max(0, Math.trunc(from));
  while (credit && cursor < plan.length) {
    const step = plan[cursor];
    const covered = step.view === "vocabulary" ? credit.vocabulary
      : step.round === 1 ? credit.firstPass : credit.secondPass;
    if (step.index >= covered) break;
    cursor += 1;
  }
  return cursor;
}
