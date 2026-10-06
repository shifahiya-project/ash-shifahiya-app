import assert from "node:assert/strict";
import test from "node:test";

import { homeLessonWindow } from "../app/home-lesson-window.ts";

const lessons = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
const ids = (items) => items.map((item) => item.id);

test("a new course shows its first lesson and the next lesson", () => {
  assert.deepEqual(ids(homeLessonWindow(lessons, () => false)), [1, 2]);
});

test("mid-course context includes one completed lesson, the current lesson and its successor", () => {
  assert.deepEqual(ids(homeLessonWindow(lessons, (item) => item.id < 87, 87)), [86, 87, 88]);
});

test("the final lesson has no invented successor", () => {
  assert.deepEqual(ids(homeLessonWindow(lessons, (item) => item.id < 100, 100)), [99, 100]);
});

test("a fully completed course keeps only its last lesson", () => {
  assert.deepEqual(ids(homeLessonWindow(lessons, () => true)), [100]);
});

test("empty and single-lesson courses stay within their boundaries", () => {
  assert.deepEqual(homeLessonWindow([], () => true), []);
  assert.deepEqual(ids(homeLessonWindow([{ id: 5 }], () => false)), [5]);
  assert.deepEqual(ids(homeLessonWindow([{ id: 5 }], () => true)), [5]);
});

test("context follows manifest order rather than numeric id arithmetic", () => {
  const sparse = [{ id: 30 }, { id: 7 }, { id: 90 }, { id: 2 }];
  const completed = new Set([30, 7]);
  assert.deepEqual(ids(homeLessonWindow(sparse, (item) => completed.has(item.id))), [7, 90, 2]);
});

test("a missing current id falls back to the first unfinished lesson", () => {
  assert.deepEqual(ids(homeLessonWindow(lessons, (item) => item.id < 4, 999)), [3, 4, 5]);
  assert.deepEqual(ids(homeLessonWindow(lessons, () => true, 999)), [100]);
});

test("a later resumed lesson uses its closest completed predecessor despite gaps", () => {
  const completed = new Set([2, 4, 10]);
  assert.deepEqual(ids(homeLessonWindow(lessons, (item) => completed.has(item.id), 7)), [4, 7, 8]);
});

test("the immediately following lesson remains visible when it is already completed", () => {
  const completed = new Set([1, 2, 3, 4, 5, 7]);
  assert.deepEqual(ids(homeLessonWindow(lessons, (item) => completed.has(item.id), 6)), [5, 6, 7]);
});

test("pending audio determines full completion even when later core lessons are completed", () => {
  const audioLessons = new Set([87, 88]);
  const completedAudio = new Set([88]);
  const fullyComplete = (item) => item.id <= 90 &&
    (!audioLessons.has(item.id) || completedAudio.has(item.id));
  assert.deepEqual(ids(homeLessonWindow(lessons, fullyComplete)), [86, 87, 88]);
  assert.deepEqual(ids(homeLessonWindow(lessons, fullyComplete, 87)), [86, 87, 88]);
});

test("context preserves lesson objects without mutating the manifest", () => {
  const original = Object.freeze([
    Object.freeze({ id: 1, title: "First" }),
    Object.freeze({ id: 2, title: "Current" }),
    Object.freeze({ id: 3, title: "Next" }),
  ]);
  const window = homeLessonWindow(original, (item) => item.id === 1, 2);
  assert.deepEqual(window, original);
  assert.notEqual(window, original);
  for (const [index, item] of window.entries()) assert.equal(item, original[index]);
});

test("context does not duplicate a lesson id", () => {
  const repeated = [{ id: 1 }, { id: 2 }, { id: 2 }];
  assert.deepEqual(ids(homeLessonWindow(repeated, (item) => item.id === 1, 2)), [1, 2]);
});
