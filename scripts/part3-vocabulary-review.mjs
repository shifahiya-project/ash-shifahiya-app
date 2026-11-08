import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const review = JSON.parse(readFileSync(new URL("./part3-vocabulary-review.json", import.meta.url), "utf8"));

export function isPart3VocabularyReviewed(book, lessons, fingerprint) {
  const edition = review.books[book];
  return Boolean(edition && fingerprint(lessons) === edition.sha256);
}

// Called only after the original main-text fingerprint has been verified.
// Existing word positions stay intact; new words may only be appended.
export function applyPart3VocabularyReview(book, lessons, fingerprint) {
  const edition = review.books[book];
  if (!edition || isPart3VocabularyReviewed(book, lessons, fingerprint)) return;
  const lastLesson = Math.min(...Object.values(review.books)
    .filter((entry) => entry.offset > edition.offset).map((entry) => entry.offset));
  const belongsToBook = (entry) => entry.lesson > edition.offset && entry.lesson <= lastLesson;
  const findLesson = (entry) => {
    const lesson = lessons.find((item) => item.id === entry.lesson - edition.offset);
    assert(lesson && lesson.book === book, `Missing vocabulary lesson ${entry.lesson}`);
    return lesson;
  };

  for (const edit of review.edits.filter(belongsToBook)) {
    const lesson = findLesson(edit);
    assert.deepEqual(lesson.words[edit.word - 1], edit.before,
      `Vocabulary source changed at ${edit.lesson}.${edit.word}`);
    lesson.words[edit.word - 1] = structuredClone(edit.after);
  }
  for (const addition of review.additions.filter(belongsToBook)) {
    const lesson = findLesson(addition);
    assert.equal(lesson.words.length + 1, addition.position,
      `Vocabulary append position changed at ${addition.lesson}.${addition.position}`);
    lesson.words.push(structuredClone(addition.entry));
  }
  assert.equal(fingerprint(lessons), edition.sha256,
    `The ${book} vocabulary differs from the reviewed edition; compare it before importing`);
}
