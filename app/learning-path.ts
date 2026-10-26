/** The ordered course path is independent of the part being browsed in the menu. */
export type LearningCourse = {
  id: number;
  ready: boolean;
  lessons: {
    id: number;
    available: boolean;
    coreComplete: boolean;
    complete: boolean;
  }[];
};

export type LearningStep =
  | { kind: "lesson" | "listening"; course: number; lessonId: number }
  | { kind: "exam"; course: 1; examId: "final" };

export function nextLearningStep(
  courses: LearningCourse[],
  finalExam: { open: boolean; passed: boolean },
): LearningStep | undefined {
  for (const course of courses) {
    if (!course.ready) continue;
    const lesson = course.lessons.find((item) => !item.complete);
    if (lesson) {
      return lesson.available ? {
        kind: lesson.coreComplete ? "listening" : "lesson",
        course: course.id,
        lessonId: lesson.id,
      } : undefined;
    }
    if (course.id === 1 && !finalExam.passed) {
      return finalExam.open ? { kind: "exam", course: 1, examId: "final" } : undefined;
    }
  }
}

/** Count opened parts together; keep any historical progress in closed parts visible. */
export function learningPathProgress(courses: LearningCourse[]) {
  const parts = courses
    .filter((course) => course.ready || course.lessons.some((lesson) => lesson.coreComplete))
    .map((course) => ({
      course: course.id,
      completed: course.lessons.filter((lesson) => lesson.complete).length,
      total: course.lessons.length,
    }));
  return {
    parts,
    completed: parts.reduce((total, part) => total + part.completed, 0),
    total: parts.reduce((total, part) => total + part.total, 0),
  };
}
