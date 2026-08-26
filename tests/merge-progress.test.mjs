import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePodcasts,
  mergeProgress,
  mergeSynced,
  normalizePodcasts,
  normalizeProgress,
  normalizeSynced,
} from "../app/merge-progress.ts";

function card(overrides = {}) {
  return { box: 1, nextReview: "2026-01-02", lastReviewed: "2026-01-01", correct: 1, wrong: 0, ...overrides };
}

function progress(overrides = {}) {
  return normalizeProgress(overrides);
}

test("a lesson keeps its best score, whichever device holds it", () => {
  const merged = mergeProgress(
    progress({ scores: { 1: 12, 2: 30 } }),
    progress({ scores: { 1: 40, 3: 7 } }),
  );
  assert.deepEqual(merged.scores, { 1: 40, 2: 30, 3: 7 });
});

test("a card answered later wins, even when the other side is further along", () => {
  // The phone pushed the card to box 4 last week; the laptop got it wrong
  // yesterday and dropped it to 0. Yesterday is the truth.
  const phone = progress({ cards: { a: card({ box: 4, lastReviewed: "2026-01-01" }) } });
  const laptop = progress({ cards: { a: card({ box: 0, lastReviewed: "2026-01-08" }) } });
  assert.equal(mergeProgress(phone, laptop).cards.a.box, 0);
  assert.equal(mergeProgress(laptop, phone).cards.a.box, 0);
});

test("cards only one side has are kept", () => {
  const merged = mergeProgress(
    progress({ cards: { a: card() } }),
    progress({ cards: { b: card({ box: 3 }) } }),
  );
  assert.deepEqual(Object.keys(merged.cards).sort(), ["a", "b"]);
  assert.equal(merged.cards.b.box, 3);
});

test("the later save decides where an unfinished lesson stands", () => {
  const early = progress({ sessions: { 5: session({ questionIndex: 2, updatedAt: 100 }) } });
  const late = progress({ sessions: { 5: session({ questionIndex: 40, updatedAt: 200 }) } });
  assert.equal(mergeProgress(early, late).sessions[5].questionIndex, 40);
  assert.equal(mergeProgress(late, early).sessions[5].questionIndex, 40);
});

test("a session without a timestamp loses to one that has it", () => {
  const old = progress({ sessions: { 5: session({ questionIndex: 90, updatedAt: undefined }) } });
  const fresh = progress({ sessions: { 5: session({ questionIndex: 3, updatedAt: 1 }) } });
  assert.equal(mergeProgress(old, fresh).sessions[5].questionIndex, 3);
});

test("a day studied on either device counts, without duplicates", () => {
  const merged = mergeProgress(
    progress({ stats: { activeDates: ["2026-01-02", "2026-01-01"], totalSeconds: 600, masteredPhrases: ["a"] } }),
    progress({ stats: { activeDates: ["2026-01-02", "2026-01-03"], totalSeconds: 900, masteredPhrases: ["b"] } }),
  );
  assert.deepEqual(merged.stats.activeDates, ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.deepEqual(merged.stats.masteredPhrases.sort(), ["a", "b"]);
});

test("time studied is not double-counted", () => {
  // Both devices count the same session from their own clock; adding them
  // would invent an hour the learner never spent.
  const merged = mergeProgress(
    progress({ stats: { activeDates: [], totalSeconds: 3600, masteredPhrases: [] } }),
    progress({ stats: { activeDates: [], totalSeconds: 3000, masteredPhrases: [] } }),
  );
  assert.equal(merged.stats.totalSeconds, 3600);
});

test("merging is order-independent", () => {
  const a = progress({
    scores: { 1: 10, 4: 2 },
    sessions: { 5: session({ questionIndex: 2, updatedAt: 100 }) },
    cards: { x: card({ box: 2, lastReviewed: "2026-01-05" }), y: card() },
    stats: { activeDates: ["2026-01-01"], totalSeconds: 60, masteredPhrases: ["a"] },
  });
  const b = progress({
    scores: { 1: 30, 2: 5 },
    sessions: { 5: session({ questionIndex: 9, updatedAt: 300 }), 6: session({ updatedAt: 50 }) },
    cards: { x: card({ box: 5, lastReviewed: "2026-01-04" }), z: card({ box: 1 }) },
    stats: { activeDates: ["2026-01-02"], totalSeconds: 120, masteredPhrases: ["b"] },
  });
  assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a));
});

test("merging an empty side changes nothing", () => {
  const mine = progress({
    scores: { 1: 10 },
    cards: { x: card() },
    stats: { activeDates: ["2026-01-01"], totalSeconds: 60, masteredPhrases: [] },
  });
  assert.deepEqual(mergeProgress(mine, progress()), mine);
  assert.deepEqual(mergeProgress(progress(), mine), mine);
});

test("normalizeProgress fills in what an old backup lacks", () => {
  const filled = normalizeProgress({ scores: { 1: 5 } });
  assert.deepEqual(filled.cards, {});
  assert.deepEqual(filled.sessions, {});
  assert.deepEqual(filled.stats, { activeDates: [], totalSeconds: 0, masteredPhrases: [] });
  assert.deepEqual(normalizeProgress(null).scores, {});
});

function session(overrides = {}) {
  return {
    view: "practice",
    lessonId: 5,
    partIndex: 0,
    deckIndex: 0,
    round: 1,
    cardIndex: 0,
    questionIndex: 0,
    score: 0,
    mistakes: [],
    updatedAt: 1,
    ...overrides,
  };
}

// ── Подкасты ──────────────────────────────────────────────────────────────

function watch(videoId, date, watchedAt, note) {
  return {
    videoId,
    channelId: "UC-x",
    title: videoId,
    date,
    seconds: 600,
    auto: true,
    watchedAt,
    ...(note ? { note } : {}),
  };
}

function podcasts(overrides = {}) {
  return normalizePodcasts(overrides);
}

test("a podcast watched on either device is watched", () => {
  const phone = podcasts({ watches: [watch("a", "2026-08-25", 100)] });
  const laptop = podcasts({ watches: [watch("b", "2026-08-26", 200)] });

  const merged = mergePodcasts(phone, laptop);
  assert.deepEqual(merged.watches.map((item) => item.videoId), ["a", "b"]);
  // Which is the whole point: two devices, two days, one unbroken streak.
  assert.deepEqual(merged.watches.map((item) => item.date), ["2026-08-25", "2026-08-26"]);
});

test("the same episode on both devices is one watch, dated when it first counted", () => {
  const first = podcasts({ watches: [watch("a", "2026-08-25", 100)] });
  const again = podcasts({ watches: [watch("a", "2026-08-26", 500)] });

  const merged = mergePodcasts(first, again);
  // Counting it twice would inflate both the episode count and the minutes.
  assert.equal(merged.watches.length, 1);
  assert.equal(merged.watches[0].watchedAt, 100);
  assert.equal(merged.watches[0].date, "2026-08-25");
});

test("a note survives, and two notes settle the same way on both devices", () => {
  const withNote = podcasts({ watches: [watch("a", "2026-08-25", 100, "فهمت")] });
  const without = podcasts({ watches: [watch("a", "2026-08-25", 100)] });
  assert.equal(mergePodcasts(withNote, without).watches[0].note, "فهمت");
  assert.equal(mergePodcasts(without, withNote).watches[0].note, "فهمت");

  const longer = podcasts({ watches: [watch("a", "2026-08-25", 100, "فهمت كل شيء")] });
  assert.equal(mergePodcasts(withNote, longer).watches[0].note, "فهمت كل شيء");
  assert.equal(mergePodcasts(longer, withNote).watches[0].note, "فهمت كل شيء");
});

test("a day keeps the plan that saw more of it, and pools what was turned down", () => {
  const quiet = podcasts({ plans: { "2026-08-26": { date: "2026-08-26", videoIds: ["v1"], skipped: ["x"] } } });
  const busy = podcasts({ plans: { "2026-08-26": { date: "2026-08-26", videoIds: ["v1", "v2"], skipped: ["y"] } } });

  const merged = mergePodcasts(quiet, busy).plans["2026-08-26"];
  assert.deepEqual(merged.videoIds, ["v1", "v2"]);
  // An episode refused on either device is one the learner already decided on.
  assert.deepEqual(merged.skipped, ["x", "y"]);
});

test("channels added anywhere are channels the learner wants", () => {
  const merged = mergePodcasts(podcasts({ sources: ["@b"] }), podcasts({ sources: ["@a", "@b"] }));
  assert.deepEqual(merged.sources, ["@a", "@b"]);
});

test("merging podcasts does not depend on which device synced first", () => {
  const phone = podcasts({
    watches: [watch("a", "2026-08-25", 100, "قصير"), watch("b", "2026-08-26", 200)],
    plans: { "2026-08-26": { date: "2026-08-26", videoIds: ["b"], skipped: ["x"] } },
    sources: ["@one"],
  });
  const laptop = podcasts({
    watches: [watch("a", "2026-08-25", 150, "نص أطول"), watch("c", "2026-08-27", 300)],
    plans: { "2026-08-26": { date: "2026-08-26", videoIds: ["b", "z"], skipped: ["y"] } },
    sources: ["@two"],
  });

  assert.deepEqual(mergePodcasts(phone, laptop), mergePodcasts(laptop, phone));
});

test("the course and the habit travel together, and old payloads still load", () => {
  const mine = { ...progress({ scores: { 1: 20 } }), podcasts: podcasts({ watches: [watch("a", "2026-08-25", 100)] }) };
  const theirs = { ...progress({ scores: { 2: 30 } }), podcasts: podcasts({ watches: [watch("b", "2026-08-26", 200)] }) };

  const merged = mergeSynced(mine, theirs);
  assert.deepEqual(merged.scores, { 1: 20, 2: 30 });
  assert.equal(merged.watches, undefined, "the habit must not leak into the course");
  assert.deepEqual(merged.podcasts.watches.map((item) => item.videoId), ["a", "b"]);
  assert.deepEqual(mergeSynced(mine, theirs), mergeSynced(theirs, mine));

  // A payload written before podcasts synced simply has none of them.
  const old = normalizeSynced({ scores: { 3: 10 } });
  assert.deepEqual(old.podcasts, { watches: [], plans: {}, sources: [] });
  assert.deepEqual(normalizeSynced(null).podcasts, { watches: [], plans: {}, sources: [] });
});
