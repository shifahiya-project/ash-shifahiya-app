import assert from "node:assert/strict";
import test from "node:test";
import { nextPart2WordStep, part2WordPlan } from "../app/part2-word-plan.ts";
import { upgradePart2Session } from "../app/part2-session.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

test("five words repeat immediately, with a translation break before the next thirty", () => {
  const plan = part2WordPlan(60);
  assert.deepEqual(plan.slice(0, 15).map(({ index, round }) => [index, round]), [
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
    [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
  ]);
  assert.equal(plan[59].view, "learn");
  assert.equal(plan[60].view, "vocabulary");
  assert.equal(plan[60].index, 0);
  assert.equal(plan[119].index, 59);
  assert.equal(plan[120].view, "learn");
  assert.equal(plan[120].index, 30);
  assert.equal(plan[120].round, 1);
  assert.equal(plan.at(-1).index, 119);
});

test("short glossaries and uneven blocks retain every exposure and both translation directions", () => {
  assert.deepEqual(part2WordPlan(0), []);
  assert.deepEqual(part2WordPlan(41).filter(s => s.view === "vocabulary" && s.index === s.blockStart * 2)
    .map(s => s.blockEnd - s.blockStart), [21, 20]);
  for (let count = 1; count <= 250; count += 1) {
    const plan = part2WordPlan(count);
    assert.equal(plan.length, count * 4);
    const learned = new Set();
    const tested = new Set();
    for (const step of plan) {
      assert(step.blockEnd - step.blockStart <= 40);
      if (count >= 20) assert(step.blockEnd - step.blockStart >= 20);
      if (step.view === "learn") {
        assert(step.groupEnd - step.groupStart <= 5);
        const key = `${step.index}:${step.round}`;
        assert(!learned.has(key));
        if (step.round === 2) {
          for (let i = step.groupStart; i < step.groupEnd; i += 1) assert(learned.has(`${i}:1`));
        }
        // A future block cannot appear before the prior translation paper is complete.
        for (let i = 0; i < step.blockStart * 2; i += 1) assert(tested.has(i));
        learned.add(key);
      } else {
        for (let i = step.blockStart; i < step.blockEnd; i += 1) {
          assert(learned.has(`${i}:1`) && learned.has(`${i}:2`));
        }
        assert(!tested.has(step.index));
        tested.add(step.index);
      }
    }
    assert.equal(learned.size, count * 2);
    assert.equal(tested.size, count * 2);
  }
});

const legacy = (fields = {}) => ({ lessonId: 1, view: "learn", index: 17, round: 1,
  flowVersion: 2, contentRevision: "current", score: 4, vocabularyScore: 0,
  contextIndex: 5, mistakes: ["prior"], updatedAt: 100, ...fields });
const upgrade = saved => upgradePart2Session(saved, 80, "current", 60);
function remaining(saved) {
  const plan = part2WordPlan(60);
  const steps = [];
  for (let cursor = saved.wordPlanIndex; cursor < plan.length;
    cursor = nextPart2WordStep(plan, cursor + 1, saved.wordPlanCredit)) steps.push(plan[cursor]);
  return steps;
}

test("switching either old whole-lesson pass keeps all earned word exposures", () => {
  for (const [round, index] of [[1, 0], [1, 17], [2, 0], [2, 37], [2, 59]]) {
    const old = legacy({ round, index });
    const migrated = upgrade(old);
    assert.equal(migrated.flowVersion, 3);
    assert.equal(migrated.score, old.score);
    assert.equal(migrated.contextIndex, 5);
    assert.deepEqual(migrated.mistakes, ["prior"]);
    const steps = remaining(migrated);
    for (let word = 0; word < 60; word += 1) {
      for (const pass of [1, 2]) {
        const alreadySeen = pass === 1 ? round === 2 || word < index : round === 2 && word < index;
        assert.equal(steps.filter(s => s.view === "learn" && s.index === word && s.round === pass).length,
          Number(!alreadySeen));
      }
    }
    assert.equal(steps.filter(s => s.view === "vocabulary").length, 120);
    assert.equal(upgrade(migrated), migrated);
    assert.equal(old.flowVersion, 2);
  }
});

test("a parked translation answer survives migration and does not restart learned groups", () => {
  const old = legacy({ view: "vocabulary", index: 63, round: 2, vocabularyScore: 40,
    answered: { option: "книга", correct: true } });
  const saved = upgrade(old);
  assert.equal(saved.view, "vocabulary");
  assert.equal(saved.index, 63);
  assert.equal(saved.vocabularyScore, 40);
  assert.deepEqual(saved.answered, old.answered);
  assert(remaining(saved).every(s => s.view === "vocabulary"));
  assert.deepEqual(remaining(saved).map(s => s.index), Array.from({ length: 57 }, (_, i) => i + 63));
  for (const view of ["reading", "listening", "practice"]) {
    const later = upgrade(legacy({ view, index: 7 }));
    assert.equal(later.view, view);
    assert.equal(later.index, 7);
    assert.deepEqual(remaining(later), []);
  }
});

test("replacing content archives the old plan and starts the new glossary without old credits", () => {
  const old = upgrade(legacy());
  const fresh = upgradePart2Session(old, 80, "new-content", 60);
  assert.equal(fresh.wordPlanIndex, 0);
  assert.equal(fresh.index, 0);
  assert.equal(fresh.view, "learn");
  assert.equal(fresh.round, 1);
  assert.deepEqual(fresh.wordPlanCredit, { firstPass: 0, secondPass: 0, vocabulary: 0 });
  assert.deepEqual(fresh.archivedSession, old);
});

test("backup and equal-timestamp sync follow the interleaved plan across round and block boundaries", () => {
  const plan = part2WordPlan(60);
  const state = position => ({ ...legacy(), ...plan[position], flowVersion: 3, wordPlanIndex: position });
  const saves = [4, 5, 9, 10, 59, 60, 119, 120, 239].map(state);
  saves.push({ ...saves.at(-1), view: "reading", index: 0, wordPlanIndex: plan.length });
  for (let i = 1; i < saves.length; i += 1) {
    const [first, second] = saves.slice(i - 1, i + 1).map(session =>
      normalizeProgress(JSON.parse(JSON.stringify({ part2Sessions: { 1: session } }))));
    assert.deepEqual(mergeProgress(first, second).part2Sessions[1], saves[i]);
    assert.deepEqual(mergeProgress(second, first).part2Sessions[1], saves[i]);
  }
  const migrated = upgrade(legacy());
  const restored = normalizeProgress(JSON.parse(JSON.stringify({ part2Sessions: { 1: migrated } })));
  assert.deepEqual(restored.part2Sessions[1], JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(remaining(restored.part2Sessions[1]), remaining(migrated));
});
