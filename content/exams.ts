import type { Exam, ExamSummary } from "./types";

/**
 * The papers themselves are large and are only ever opened one at a time, so
 * they load on demand like the lessons do. What the home screen needs — the
 * title, the lesson the exam follows and how the paper is made up — stays here.
 */
export const examSummaries: ExamSummary[] = [
  {
    id: "midterm",
    title: "Промежуточный экзамен",
    afterLesson: 50,
    questionCount: 100,
    grammarCount: 20,
  },
  {
    id: "final",
    title: "Итоговый экзамен",
    afterLesson: 100,
    questionCount: 150,
    grammarCount: 36,
  },
];

const loaders: Record<Exam["id"], () => Promise<Record<string, Exam>>> = {
  midterm: () => import("./exams/midterm"),
  final: () => import("./exams/final"),
};

const cache = new Map<Exam["id"], Exam>();

export function loadExam(id: Exam["id"]): Promise<Exam> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);
  return loaders[id]().then((loaded) => {
    const exam = Object.values(loaded)[0];
    cache.set(id, exam);
    return exam;
  });
}
