import assert from "node:assert/strict";
import test from "node:test";
import { PART4_REVISION, part4LegacySummaries } from "../content/part4/revision.ts";
import { getPart4Progress, mergePart4Revisions, normalizePart4Revisions } from "../app/part4-revision.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";

class FakeStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}

const events = new EventTarget();
globalThis.window = {
  localStorage: new FakeStorage(),
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
};
const { progressStore, PART4_REVISIONS_KEY, part4ScoreKey, part4SessionKey } = await import("../app/progress-store.ts");
const session = (lessonId, updatedAt, index = 3) => ({ lessonId, view: "practice", index,
  score: 2, mistakes: ["term"], wordIndexes: [1, 4, 7], updatedAt });
const record = (scores = {}, totals = {}, sessions = {}) => ({ scores, totals, sessions });

function freshStorage() {
  window.localStorage = new FakeStorage();
  progressStore.replaceAll(normalizeProgress({}));
}

test("legacy scores and unfinished papers never complete or resume the revised book", () => {
  const legacy = normalizeProgress({
    part4Scores: Object.fromEntries(part4LegacySummaries.map(({ id }) => [id, 100])),
    part4Sessions: { 1: session(1, 10) },
  });
  assert.equal(Object.keys(legacy.part4Scores).length, 145);
  assert.deepEqual(legacy.part4Revisions, {});
  const current = getPart4Progress(legacy);
  assert.deepEqual(current.scores, {});
  assert.deepEqual(current.sessions, {});
  assert.deepEqual(current.totals, {});
  assert.equal(current.inherited.size, 0);
  assert.equal(legacy.part4Sessions[1].index, 3);
});

test("sync unions revision archives independently from the old numeric transport", () => {
  const mine = normalizeProgress({ part4Scores: { 1: 20 }, part4Sessions: { 1: session(1, 10) },
    part4Revisions: { [PART4_REVISION]: record({ 2: 3 }, { 2: 4 }, { 3: session(3, 20) }) } });
  const theirs = normalizeProgress({ part4Scores: { 1: 25 }, part4Sessions: { 1: session(1, 30) },
    part4Revisions: { "earlier-fiqh-edition": record({ 2: 500 }, { 2: 500 }),
      [PART4_REVISION]: record({ 4: 1 }, { 4: 2 }, { 3: session(3, 40, 1) }) } });
  const merged = mergeProgress(mine, theirs);
  assert.deepEqual(merged.part4Scores, { 1: 25 });
  assert.equal(merged.part4Sessions[1].updatedAt, 30);
  assert.deepEqual(getPart4Progress(merged).scores, { 2: 3, 4: 1 });
  assert.deepEqual(getPart4Progress(merged).totals, { 2: 4, 4: 2 });
  assert.equal(getPart4Progress(merged).sessions[3].updatedAt, 40);
  assert.equal(merged.part4Revisions["earlier-fiqh-edition"].scores[2], 500);
  assert.deepEqual(mergeProgress(theirs, mine).part4Revisions, merged.part4Revisions);
});

test("the winning score keeps its own denominator and the latest session keeps its plan", () => {
  const mine = { [PART4_REVISION]: record({ 1: 5, 2: 10, 3: 2 }, { 1: 6, 2: 12, 3: 3 },
    { 7: session(7, 200, 1) }) };
  const theirs = { [PART4_REVISION]: record({ 1: 4, 2: 11, 3: 2 }, { 1: 100, 3: 4 },
    { 7: session(7, 100, 99) }) };
  const merged = mergePart4Revisions(mine, theirs)[PART4_REVISION];
  assert.deepEqual(merged.scores, { 1: 5, 2: 11, 3: 2 });
  assert.deepEqual(merged.totals, { 1: 6, 3: 4 }, "a losing paper cannot supply a missing denominator");
  assert.deepEqual(merged.sessions[7], session(7, 200, 1));
  assert.deepEqual(mergePart4Revisions(theirs, mine)[PART4_REVISION], merged);
  assert.equal(mine[PART4_REVISION].totals[2], 12, "merge does not mutate its inputs");
});

test("new attempts leave all old score and session keys unchanged", () => {
  freshStorage();
  const oldPaper = JSON.stringify(session(1, 1));
  window.localStorage.setItem(part4ScoreKey(1), "57");
  window.localStorage.setItem(part4SessionKey(1), oldPaper);
  window.localStorage.setItem(part4ScoreKey(145), "0");
  window.localStorage.setItem(part4ScoreKey(159), "999");
  progressStore.savePart4Session(session(1, 10));
  let snapshot = progressStore.getSnapshot();
  assert.deepEqual(snapshot.part4Scores, { 1: 57, 145: 0 }, "legacy reads use the frozen 145 IDs");
  assert.equal(getPart4Progress(snapshot).sessions[1].index, 3);
  assert.equal(getPart4Progress(snapshot).scores[1], undefined);
  progressStore.finishPart4Lesson(1, 3, 4);
  progressStore.finishPart4Lesson(159, 0, 0);
  snapshot = progressStore.getSnapshot();
  assert.deepEqual(getPart4Progress(snapshot).scores, { 1: 3, 159: 0 });
  assert.deepEqual(getPart4Progress(snapshot).totals, { 1: 4, 159: 0 });
  assert.equal(getPart4Progress(snapshot).sessions[1], undefined);
  assert.equal(window.localStorage.getItem(part4ScoreKey(1)), "57");
  assert.equal(window.localStorage.getItem(part4ScoreKey(159)), "999");
  assert.equal(window.localStorage.getItem(part4SessionKey(1)), oldPaper);
  assert.deepEqual(snapshot.part4Sessions[1], JSON.parse(oldPaper));
  assert.equal(JSON.parse(window.localStorage.getItem(PART4_REVISIONS_KEY))[PART4_REVISION].scores[1], 3);
});

test("a weaker repeat preserves both the result and the paper size", () => {
  freshStorage();
  progressStore.finishPart4Lesson(12, 8, 9);
  progressStore.finishPart4Lesson(12, 3, 30);
  assert.equal(getPart4Progress(progressStore.getSnapshot()).scores[12], 8);
  assert.equal(getPart4Progress(progressStore.getSnapshot()).totals[12], 9);
  progressStore.finishPart4Lesson(12, 10);
  assert.equal(getPart4Progress(progressStore.getSnapshot()).scores[12], 10);
  assert.equal(getPart4Progress(progressStore.getSnapshot()).totals[12], undefined);
});

test("legacy backups cannot erase revised papers, and a complete backup round trips both editions", () => {
  freshStorage();
  const original = normalizeProgress({ part4Scores: { 145: 9 }, part4Sessions: { 145: session(145, 1) },
    part4Revisions: { [PART4_REVISION]: record({ 159: 4 }, { 159: 5 }, { 158: session(158, 2) }),
      archived: record({ 1: 6 }, { 1: 7 }, { 2: session(2, 3) }) } });
  progressStore.replaceAll(original);
  const backup = JSON.parse(JSON.stringify(progressStore.getSnapshot()));
  progressStore.replaceAll(normalizeProgress({ part4Scores: { 1: 10 } }));
  assert.deepEqual(progressStore.getSnapshot().part4Revisions, original.part4Revisions);
  freshStorage();
  progressStore.replaceAll(normalizeProgress(backup));
  const restored = progressStore.getSnapshot();
  assert.deepEqual(restored.part4Revisions, original.part4Revisions);
  assert.deepEqual(restored.part4Scores, original.part4Scores);
  assert.deepEqual(restored.part4Sessions, original.part4Sessions);
  assert.equal(getPart4Progress(restored).inherited.size, 0);
});

test("a revision update from another tab refreshes the learner's snapshot", () => {
  freshStorage();
  let updates = 0;
  const unsubscribe = progressStore.subscribe(() => updates++);
  const external = { [PART4_REVISION]: record({ 1: 1 }, { 1: 2 }) };
  window.localStorage.setItem(PART4_REVISIONS_KEY, JSON.stringify(external));
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: PART4_REVISIONS_KEY });
  events.dispatchEvent(event);
  assert.equal(updates, 1);
  assert.deepEqual(progressStore.getSnapshot().part4Revisions, external);
  unsubscribe();
});

test("malformed revision records cannot fabricate completion or a valid paper size", () => {
  const invalid = { [PART4_REVISION]: { scores: { 1: "5", 2: -1, 3: 5, 4: 0, 0: 9 },
    totals: { 3: 4, 4: 0, 5: 1 }, sessions: { 1: session(2, 10), 2: { ...session(2, 10), index: -1 } } } };
  assert.deepEqual(normalizePart4Revisions(invalid), {
    [PART4_REVISION]: record({ 3: 5, 4: 0 }, { 4: 0 }),
  });
});
