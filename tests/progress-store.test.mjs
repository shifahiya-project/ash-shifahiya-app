// What `replaceAll` actually writes to storage.
//
// It is the one door everything coming from outside this device goes through:
// a merge pulled down from Supabase and a backup file restored by hand both
// land here. Anything it forgets to write is quietly lost — and then quietly
// destroyed, because the next push sends back what this device now holds.
//
// That is exactly what happened to the unfinished exam paper. The merge chose
// the fresher of the two papers correctly, `replaceAll` wrote every other key
// and not that one, so the other device never saw the paper and its own empty
// push wiped it off the server. A hundred and fifty answers are the reason the
// key exists at all.
import test from "node:test";
import assert from "node:assert/strict";

// The store reads `window.localStorage` directly, which is the right thing in
// the browser and needs standing in for here.
class FakeStorage {
  #items = new Map();
  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }
  setItem(key, value) {
    this.#items.set(key, String(value));
  }
  removeItem(key) {
    this.#items.delete(key);
  }
  get size() {
    return this.#items.size;
  }
}

globalThis.window = { localStorage: new FakeStorage() };

const { progressStore, EXAM_SESSION_KEY, EXAM_RESULTS_KEY, CARD_PROGRESS_KEY } = await import(
  "../app/progress-store.ts"
);
const { normalizeProgress } = await import("../app/merge-progress.ts");

const PAPER = {
  examId: "final",
  order: [4, 1, 3, 2, 0],
  index: 3,
  score: 2,
  mistakes: ["وَقْتٌ"],
  updatedAt: 1_700_000_000_000,
};

function freshStorage() {
  globalThis.window.localStorage = new FakeStorage();
}

test("a paper in progress survives the door everything from outside comes through", () => {
  freshStorage();
  progressStore.replaceAll(normalizeProgress({ examSession: PAPER }));

  assert.deepEqual(
    JSON.parse(window.localStorage.getItem(EXAM_SESSION_KEY)),
    PAPER,
    "the paper has to reach storage, not just the merge",
  );
  // And it has to come back out again: the snapshot is what the exam screen
  // reads to decide whether there is a paper to resume.
  assert.deepEqual(progressStore.getSnapshot().examSession, PAPER);
});

test("no paper on either side clears the key rather than leaving a stale one", () => {
  freshStorage();
  progressStore.replaceAll(normalizeProgress({ examSession: PAPER }));
  progressStore.replaceAll(normalizeProgress({ examSession: null }));

  assert.equal(window.localStorage.getItem(EXAM_SESSION_KEY), null);
  assert.equal(progressStore.getSnapshot().examSession, null);
});

test("the rest of a restored payload still lands where it was landing", () => {
  freshStorage();
  const cards = { "lesson-1-deck-0-word-0-ar-ru": { box: 2, nextReview: "2026-01-02", lastReviewed: "2026-01-01", correct: 3, wrong: 1 } };
  const exams = { midterm: { best: 81, attempts: 2, passedAt: "2026-01-01" } };
  progressStore.replaceAll(normalizeProgress({ cards, exams, scores: { 1: 26 } }));

  assert.deepEqual(JSON.parse(window.localStorage.getItem(CARD_PROGRESS_KEY)), cards);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(EXAM_RESULTS_KEY)), exams);
  assert.equal(window.localStorage.getItem("shifahiya-lesson-1"), "26");
});
