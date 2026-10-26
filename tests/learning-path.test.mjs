import assert from "node:assert/strict";
import test from "node:test";
import { learningPathProgress, nextLearningStep } from "../app/learning-path.ts";

function course(id, total, completed = 0, ready = true) {
  return {
    id, ready,
    lessons: Array.from({ length: total }, (_, index) => ({
      id: index + 1,
      available: index <= completed,
      coreComplete: index < completed,
      complete: index < completed,
    })),
  };
}
const passed = { open: true, passed: true };
const waiting = { open: true, passed: false };

test("the final exam fills the next step after all 100 lessons, including a failed attempt", () => {
  const courses = [course(1, 100, 100), course(2, 105, 0, false)];
  assert.deepEqual(nextLearningStep(courses, waiting), { kind: "exam", course: 1, examId: "final" });
  assert.deepEqual(learningPathProgress(courses), {
    parts: [{ course: 1, completed: 100, total: 100 }], completed: 100, total: 100,
  });
});

test("passing the exam immediately recommends part 2 and expands the total to 205", () => {
  const courses = [course(1, 100, 100), course(2, 105)];
  assert.deepEqual(nextLearningStep(courses, passed), { kind: "lesson", course: 2, lessonId: 1 });
  assert.equal(learningPathProgress(courses).total, 205);
  assert.equal(learningPathProgress(courses).completed, 100);
});

test("lessons completed in the second part keep increasing the cumulative count", () => {
  const courses = [course(1, 100, 100), course(2, 105, 2), course(3, 37, 0, false)];
  assert.deepEqual(nextLearningStep(courses, passed), { kind: "lesson", course: 2, lessonId: 3 });
  assert.deepEqual(learningPathProgress(courses), {
    parts: [{ course: 1, completed: 100, total: 100 }, { course: 2, completed: 2, total: 105 }],
    completed: 102, total: 205,
  });
});

test("the earliest unfinished lesson wins even when later lessons are available", () => {
  const second = course(2, 105, 1);
  second.lessons[9].available = true;
  assert.deepEqual(nextLearningStep([course(1, 100, 100), second], passed), {
    kind: "lesson", course: 2, lessonId: 2,
  });
});

test("audio remains part of a lesson before moving on or counting it as complete", () => {
  for (const id of [1, 2, 8, 11]) {
    const current = course(id, 3, 2);
    current.lessons[1].complete = false;
    assert.deepEqual(nextLearningStep([current], passed), { kind: "listening", course: id, lessonId: 2 });
    assert.equal(learningPathProgress([current]).completed, 1);
  }
});

test("every subsequent part continues automatically in manifest order", () => {
  for (let id = 2; id < 11; id += 1) {
    const courses = [course(id, 2, 2), course(id + 1, 3), course(id + 2, 3, 0, false)];
    courses[1].lessons[0].id = 17;
    assert.deepEqual(nextLearningStep(courses, passed), { kind: "lesson", course: id + 1, lessonId: 17 });
    assert.equal(learningPathProgress(courses).total, 5);
  }
});

test("an unavailable lesson is never offered and all finished parts have no next lesson", () => {
  const first = course(1, 3);
  first.lessons[0].available = false;
  assert.equal(nextLearningStep([first], waiting), undefined);
  assert.equal(nextLearningStep([course(1, 3, 3), course(2, 3, 3)], passed), undefined);
  assert.equal(nextLearningStep([], passed), undefined);
});

test("closed parts cannot inflate totals by browsing them, but old results stay visible", () => {
  const courses = [course(1, 100, 85), course(8, 77, 0, false)];
  assert.deepEqual(learningPathProgress(courses), {
    parts: [{ course: 1, completed: 85, total: 100 }], completed: 85, total: 100,
  });
  courses[1].lessons[0].coreComplete = true;
  courses[1].lessons[0].complete = true;
  assert.equal(learningPathProgress(courses).completed, 86);
});
