import assert from "node:assert/strict";
import test from "node:test";
import { legacyPart2QuestionCounts } from "../content/part2/legacy-question-counts.ts";
import {
  mergePart2Results, normalizePart2Results, part2ResultFor,
  part2ResultLabel, part2ScoresFromResults,
} from "../app/part2-results.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";
import { isPart3Open } from "../app/part3-access.ts";

const revision = "2026-10-28";
const legacy = { revision: "legacy", score: 39, total: 39 };
const current = { revision, score: 35, total: 35 };

test("unversioned results keep the old paper sizes, including zero scores", () => {
  assert.equal(Object.keys(legacyPart2QuestionCounts).length, 105);
  assert.equal(Object.values(legacyPart2QuestionCounts).reduce((a, b) => a + b, 0), 3290);
  const results = normalizePart2Results({ 1: 39, 2: 0 });
  assert.deepEqual(part2ResultFor(results, 1), legacy);
  assert.equal(part2ResultLabel(part2ResultFor(results, 1)), "39/39");
  assert.equal(part2ResultLabel(part2ResultFor(results, 2)), "0/33");
  const unknown = normalizePart2Results({ 1: 99, 999: 5 });
  assert.equal(part2ResultLabel(part2ResultFor(unknown, 1)), "99");
  assert.equal(part2ResultLabel(part2ResultFor(unknown, 999)), "5");
});

test("a new 35/35 replaces the displayed 39/39 without deleting the old result", () => {
  const results = mergePart2Results({ 1: [legacy] }, { 1: [current] });
  assert.equal(part2ResultLabel(part2ResultFor(results, 1)), "35/35");
  assert.deepEqual(part2ScoresFromResults(results), { 1: 35 });
  assert.deepEqual(results[1], [legacy, current]);
  const repeat = mergePart2Results(results, { 1: [{ ...current, score: 20 }] });
  assert.deepEqual(repeat, results, "a weaker repeat in the same edition cannot lower its best");
  const next = { revision: "2027-01-01", score: 0, total: 30 };
  assert.deepEqual(part2ResultFor(mergePart2Results(results, { 1: [next] }), 1), next);
});

test("different paper sizes keep whole results even within an edition", () => {
  const results = mergePart2Results({ 1: [current] }, { 1: [{ revision, score: 36, total: 40 }] });
  assert.equal(results[1].length, 2);
  assert.equal(part2ResultLabel(part2ResultFor(results, 1)), "35/35");
  const zero = mergePart2Results({}, { 2: [{ revision, score: 0, total: 0 }] });
  assert.equal(part2ResultLabel(part2ResultFor(zero, 2)), "0/0");
});

test("sync never resurrects a larger old score and preserves both editions in either order", () => {
  const oldDevice = normalizeProgress({ part2Scores: { 1: 39 } });
  const newDevice = normalizeProgress({ part2Scores: { 1: 35 }, part2Results: { 1: [legacy, current] } });
  const merged = mergeProgress(oldDevice, newDevice);
  assert.deepEqual(merged, mergeProgress(newDevice, oldDevice));
  assert.deepEqual(merged, mergeProgress(merged, oldDevice));
  assert.deepEqual(merged, mergeProgress(merged, merged));
  assert.deepEqual(merged.part2Results[1], [legacy, current]);
  assert.equal(merged.part2Scores[1], 35);
  assert.equal(part2ResultLabel(part2ResultFor(merged.part2Results, 1)), "35/35");
  assert.equal(isPart3Open([{ id: 1 }], merged.part2Scores), true, "completion gates remain open");
  // A stale numeric compatibility key must not override its versioned paper.
  assert.equal(normalizeProgress({ part2Scores: { 1: 39 }, part2Results: { 1: [current] } }).part2Scores[1], 35);
});

test("local save, JSON restore and a later legacy backup retain the correct totals and history", async () => {
  const items = new Map([["shifahiya-p2-lesson-1", "39"]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    },
  };
  const { progressStore, PART2_RESULTS_KEY, part2ScoreKey } = await import("../app/progress-store.ts");
  assert.equal(part2ResultLabel(part2ResultFor(progressStore.getSnapshot().part2Results, 1)), "39/39");
  progressStore.finishPart2Lesson(1, 35, 35, revision);
  progressStore.finishPart2Lesson(1, 20, 35, revision);
  assert.equal(items.get(part2ScoreKey(1)), "35");
  assert.deepEqual(JSON.parse(items.get(PART2_RESULTS_KEY))[1], [legacy, current]);
  const backup = JSON.parse(JSON.stringify(progressStore.getSnapshot()));
  items.clear();
  progressStore.updateStats((stats) => stats); // Invalidate the cached device snapshot.
  progressStore.replaceAll(normalizeProgress(backup));
  progressStore.replaceAll(normalizeProgress({ part2Scores: { 1: 39, 2: 0 } }));
  const restored = progressStore.getSnapshot();
  assert.equal(restored.part2Scores[1], 35);
  assert.deepEqual(restored.part2Results[1], [legacy, current]);
  assert.equal(part2ResultLabel(part2ResultFor(restored.part2Results, 2)), "0/33");
  assert.equal(items.get(part2ScoreKey(1)), "35");
});
