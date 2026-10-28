import assert from "node:assert/strict";
import test from "node:test";
import { upgradePart2Session } from "../app/part2-session.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

const old = (overrides = {}) => ({
  lessonId: 1, view: "learn", index: 7, score: 0, mistakes: [], updatedAt: 100,
  ...overrides,
});

test("an old word session keeps its card and begins the first of two rounds", () => {
  const saved = old();
  const upgraded = upgradePart2Session(saved, 20);
  assert.equal(upgraded.view, "learn");
  assert.equal(upgraded.index, 7);
  assert.equal(upgraded.round, 1);
  assert.equal(upgraded.flowVersion, 2);
  assert.equal(saved.flowVersion, undefined, "upgrading does not rewrite the original snapshot");
});

test("an unfinished old context paper keeps its score and position for the final phase", () => {
  const upgraded = upgradePart2Session(old({ view: "practice", index: 7, score: 5, mistakes: ["old context"] }), 20);
  assert.equal(upgraded.view, "vocabulary");
  assert.equal(upgraded.index, 0, "the context index must never become a translation index");
  assert.equal(upgraded.contextIndex, 7);
  assert.equal(upgraded.score, 5);
  assert.equal(upgraded.vocabularyScore, 0);
  assert.deepEqual(upgraded.mistakes, ["old context"]);
});

test("an old reading session does not have to repeat its completed context paper", () => {
  const upgraded = upgradePart2Session(old({ view: "reading", index: 0, score: 16 }), 20);
  assert.equal(upgraded.view, "vocabulary");
  assert.equal(upgraded.contextIndex, 20);
  assert.equal(upgraded.score, 16);
  assert.equal(upgradePart2Session(old({ view: "practice", index: 100 }), 20).contextIndex, 20);
});

test("new sessions retain their round, audio position and already-counted answer", () => {
  for (const view of ["learn", "vocabulary", "reading", "listening", "practice"]) {
    const saved = {
      ...old({ view }), flowVersion: 2, round: 2, vocabularyScore: 9,
      contextIndex: 3, answered: { option: "книга", correct: true },
    };
    assert.equal(upgradePart2Session(saved, 20), saved);
  }
});

function mergeSessions(first, second) {
  return mergeProgress(
    normalizeProgress({ part2Sessions: { 1: first } }),
    normalizeProgress({ part2Sessions: { 1: second } }),
  ).part2Sessions[1];
}

test("sync keeps the latest save and all fields, including a parked answer", () => {
  const first = old({ view: "practice", index: 15, score: 12 });
  const second = {
    ...upgradePart2Session(first, 20), updatedAt: 200, vocabularyScore: 2, index: 2,
    answered: { option: "كتاب", correct: true },
  };
  assert.deepEqual(mergeSessions(first, second), second);
  assert.deepEqual(mergeSessions(second, first), second);
  assert.deepEqual(mergeSessions(second, { ...first, updatedAt: 300 }), { ...first, updatedAt: 300 });
});

test("equal-timestamp sync respects round and phase rather than the largest index", () => {
  const stages = [
    { view: "learn", round: 1, index: 19 },
    { view: "learn", round: 2, index: 0 },
    { view: "vocabulary", index: 0 },
    { view: "reading", index: 0 },
    { view: "listening", index: 0 },
    { view: "practice", index: 0 },
  ].map((position) => ({ ...old(), flowVersion: 2, ...position }));
  for (let index = 1; index < stages.length; index += 1) {
    assert.deepEqual(mergeSessions(stages[index - 1], stages[index]), stages[index]);
    assert.deepEqual(mergeSessions(stages[index], stages[index - 1]), stages[index]);
  }
  const unanswered = stages.at(-1);
  const answered = { ...unanswered, score: 1, answered: { option: "word", correct: true } };
  assert.deepEqual(mergeSessions(unanswered, answered), answered);
  assert.deepEqual(mergeSessions(answered, unanswered), answered);
});

test("the migrated flow wins a same-timestamp tie with its source session", () => {
  const legacy = old({ view: "practice", index: 19 });
  const upgraded = upgradePart2Session(legacy, 20);
  assert.deepEqual(mergeSessions(legacy, upgraded), upgraded);
  assert.deepEqual(mergeSessions(upgraded, legacy), upgraded);
});

test("save, JSON backup, restore and finish retain the new position without altering old results", async () => {
  const items = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    },
  };
  const { progressStore, part2SessionKey } = await import("../app/progress-store.ts");
  items.set("shifahiya-p2-lesson-1", "15");
  const session = {
    ...old({ lessonId: 2, view: "vocabulary", index: 4, score: 3 }), flowVersion: 2,
    round: 2, vocabularyScore: 4, contextIndex: 5,
    answered: { option: "книга", correct: true },
  };
  progressStore.savePart2Session(session);
  const saved = JSON.parse(items.get(part2SessionKey(2)));
  const backup = JSON.parse(JSON.stringify(progressStore.getSnapshot()));
  items.delete(part2SessionKey(2));
  progressStore.replaceAll(normalizeProgress(backup));
  assert.deepEqual(progressStore.getSnapshot().part2Sessions[2], saved);
  assert.deepEqual(JSON.parse(items.get(part2SessionKey(2))), saved);
  assert.equal(progressStore.getSnapshot().part2Scores[1], 15);
  assert.equal(progressStore.getSnapshot().part2Scores[2], undefined, "a saved phase is not a completed lesson");
  progressStore.finishPart2Lesson(2, 8, 33);
  assert.equal(progressStore.getSnapshot().part2Scores[2], 8);
  assert.equal(progressStore.getSnapshot().part2Sessions[2], undefined);
  progressStore.finishPart2Lesson(1, 2, 39);
  assert.equal(progressStore.getSnapshot().part2Scores[1], 15, "an old best result cannot be lowered");
});
