import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyBakriTextCorrections } from "./bakri-text-corrections.mjs";
import { applyKursaviTextCorrections } from "./kursavi-text-corrections.mjs";
import { applyPart3VocabularyReview, isPart3VocabularyReviewed } from "./part3-vocabulary-review.mjs";

const review = JSON.parse(readFileSync(new URL("./part3-main-text.json", import.meta.url), "utf8"));

// Only content and stable lesson/word positions belong to this fingerprint.
export function part3TextFingerprint(lessons) {
  return createHash("sha256").update(JSON.stringify(lessons.map(({ id, words, fragments }) => ({
    id, words: words.map(({ arabic, russian, kind, retired }) => ({
      arabic, russian, kind, ...(retired === true ? { retired: true } : {}),
    })),
    fragments: fragments.map(({ arabic, russian }) => ({ arabic, russian })),
  })))).digest("hex");
}

function applyMainTextReview(book, lessons, edition) {
  if (part3TextFingerprint(lessons) === edition.sha256) return;

  applyBakriTextCorrections(book, lessons);
  applyKursaviTextCorrections(book, lessons);
  for (const correction of review.corrections) {
    const lesson = lessons.find((item) => item.id === correction.lesson - edition.offset);
    if (!lesson || lesson.book !== book) continue;
    const fragment = lesson.fragments[correction.fragment - 1];
    assert(fragment, `Missing main-text fragment ${correction.lesson}.${correction.fragment}`);
    for (const field of ["arabic", "russian"]) {
      const change = correction[field];
      if (!change || fragment[field] === change.after) continue;
      assert.equal(fragment[field], change.before,
        `Main-text source changed at ${correction.lesson}.${correction.fragment} (${field})`);
      fragment[field] = change.after;
    }
  }
  for (const lesson of lessons) {
    const removed = review.droppedFragments.filter((entry) => entry.lesson === lesson.id + edition.offset);
    for (const entry of removed) {
      assert.deepEqual(lesson.fragments[entry.fragment - 1], entry.before,
        `Footnote source changed at ${entry.lesson}.${entry.fragment}`);
    }
    const positions = new Set(removed.map((entry) => entry.fragment));
    lesson.fragments = lesson.fragments.filter((_, index) => !positions.has(index + 1));
    assert(lesson.fragments.length, `Lesson ${lesson.id} has no main text`);
  }
  assert.equal(part3TextFingerprint(lessons), edition.sha256,
    `The ${book} export differs from the reviewed edition; compare it before importing`);
}

/** Accept either reviewed stage or the exact original; reject unrelated exports. */
export function applyPart3ReviewedText(book, lessons) {
  const edition = review.books[book];
  if (!edition || isPart3VocabularyReviewed(book, lessons, part3TextFingerprint)) return;

  // Both review layers must pass before any caller-owned data changes.
  const updated = structuredClone(lessons);
  applyMainTextReview(book, updated, edition);
  applyPart3VocabularyReview(book, updated, part3TextFingerprint);
  lessons.splice(0, lessons.length, ...updated);
}
