import assert from "node:assert/strict";
import test from "node:test";
import { hasPriorPart5Access } from "../app/part4-history.ts";
import { getPart4Progress } from "../app/part4-revision.ts";
import { mergeProgress, normalizeProgress } from "../app/merge-progress.ts";
import { PART4_REVISION, part4LegacySummaries } from "../content/part4/revision.ts";

const legacyScores = () => Object.fromEntries(part4LegacySummaries.map(({ id }) => [id, 0]));
const session = (lessonId) => ({ lessonId, view: "reading", index: 0, score: 0, mistakes: [] });

test("finishing all 145 legacy lessons retains access without completing any new lesson", () => {
  const progress = normalizeProgress({ part4Scores: legacyScores() });
  assert.equal(hasPriorPart5Access(progress), true, "zero-word reading completions count too");
  assert.deepEqual(getPart4Progress(progress).scores, {});
  delete progress.part4Scores[145];
  progress.part4Scores[146] = 10;
  assert.equal(hasPriorPart5Access(progress), false, "a different numeric ID cannot replace the missing legacy lesson");
});

test("current and archived revision results cannot be mistaken for the legacy prerequisite", () => {
  const scores = Object.fromEntries(Array.from({ length: 159 }, (_, i) => [i + 1, 0]));
  const progress = normalizeProgress({ part4Scores: { 1: 4 },
    part4Revisions: {
      [PART4_REVISION]: { scores, totals: {}, sessions: {} },
      previous: { scores: legacyScores(), totals: {}, sessions: {} },
    } });
  assert.equal(hasPriorPart5Access(progress), false, "the page independently checks completion of today's course");
  assert.equal(Object.keys(getPart4Progress(progress).scores).length, 159);
});

test("any already started downstream course retains the previously earned entrance", () => {
  for (let part = 5; part <= 11; part++) {
    assert.equal(hasPriorPart5Access({ [`part${part}Scores`]: { 1: 0 } }), true, `course ${part} score`);
    assert.equal(hasPriorPart5Access({ [`part${part}Sessions`]: { 1: session(1) } }), true, `course ${part} unfinished lesson`);
  }
  assert.equal(hasPriorPart5Access({ part4Sessions: { 145: session(145) } }), false);
  assert.equal(hasPriorPart5Access({ part5Scores: { 1: undefined }, part5Sessions: { 1: session(2) } }), false);
});

test("review cards prove prior access only with a full valid downstream address", () => {
  for (let part = 5; part <= 11; part++) {
    for (const dir of ["ar-ru", "ru-ar"]) {
      assert.equal(hasPriorPart5Access({ cards: { [`p${part}-lesson-1-word-0-${dir}`]: {} } }), true);
    }
  }
  const malformed = ["p4-lesson-1-word-0-ar-ru", "p12-lesson-1-word-0-ar-ru",
    "p5-lesson-0-word-0-ar-ru", "p5-lesson-1-word-0", "p5-lesson-1-word-0-ar-ru-extra",
    "extra-p5-lesson-1-word-0-ar-ru", "p5-lesson-1-word--1-ar-ru", "p5-lesson-01-word-0-ar-ru"];
  for (const id of malformed) assert.equal(hasPriorPart5Access({ cards: { [id]: {} } }), false, id);
});

test("legacy backup and sync retain earned access while fresh learners remain gated", () => {
  assert.equal(hasPriorPart5Access({}), false);
  assert.equal(hasPriorPart5Access(normalizeProgress({})), false);
  const restored = normalizeProgress(JSON.parse(JSON.stringify({ part4Scores: legacyScores() })));
  const synced = mergeProgress(restored, normalizeProgress({
    part4Revisions: { [PART4_REVISION]: { scores: { 1: 1 }, totals: { 1: 2 }, sessions: {} } },
  }));
  assert.equal(hasPriorPart5Access(synced), true);
  assert.deepEqual(getPart4Progress(synced).scores, { 1: 1 });
});
