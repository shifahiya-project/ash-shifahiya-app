import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyBakriTextCorrections } from "./bakri-text-corrections.mjs";
import { applyKursaviTextCorrections } from "./kursavi-text-corrections.mjs";

const review = JSON.parse(readFileSync(new URL("./part3-main-text.json", import.meta.url), "utf8"));

// Only content and stable lesson/word positions belong to this fingerprint.
export function part3TextFingerprint(lessons) {
  return createHash("sha256").update(JSON.stringify(lessons.map(({ id, words, fragments }) => ({
    id, words: words.map(({ arabic, russian, kind }) => ({ arabic, russian, kind })),
    fragments: fragments.map(({ arabic, russian }) => ({ arabic, russian })),
  })))).digest("hex");
}

/** Accept the reviewed edition or the exact original; never patch an unrelated export. */
export function applyPart3ReviewedText(book, lessons) {
  const edition = review.books[book];
  if (!edition) return;
  if (part3TextFingerprint(lessons) === edition.sha256) return;

  // Work on a copy: any failed field guard leaves the caller's data intact.
  const updated = structuredClone(lessons);
  applyBakriTextCorrections(book, updated);
  applyKursaviTextCorrections(book, updated);
  for (const correction of review.corrections) {
    const lesson = updated.find((item) => item.id === correction.lesson - edition.offset);
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
  for (const lesson of updated) {
    const removed = review.droppedFragments.filter((entry) => entry.lesson === lesson.id + edition.offset);
    for (const entry of removed) {
      assert.deepEqual(lesson.fragments[entry.fragment - 1], entry.before,
        `Footnote source changed at ${entry.lesson}.${entry.fragment}`);
    }
    const positions = new Set(removed.map((entry) => entry.fragment));
    lesson.fragments = lesson.fragments.filter((_, index) => !positions.has(index + 1));
    assert(lesson.fragments.length, `Lesson ${lesson.id} has no main text`);
  }
  assert.equal(part3TextFingerprint(updated), edition.sha256,
    `The ${book} export differs from the reviewed edition; compare it before importing`);
  lessons.splice(0, lessons.length, ...updated);
}
