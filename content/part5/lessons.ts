/// <reference types="vite/client" />
import { textCourseNeedsMetWords } from "../text-course-questions.ts";
import type { TextCourseLesson, TextCourseWord } from "../types";

// One chunk per lesson, like the courses before it: the fifth course's words
// and its text only reach the browser when that lesson is opened.
const loaders = import.meta.glob<Record<string, TextCourseLesson>>("./lesson-*.ts");

const byId = new Map<number, () => Promise<Record<string, TextCourseLesson>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/lesson-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byId.set(id, loader);
}

const cache = new Map<number, TextCourseLesson>();
const inFlight = new Map<number, Promise<TextCourseLesson>>();

export function loadPart5Lesson(id: number): Promise<TextCourseLesson> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const loader = byId.get(id);
  if (!loader) return Promise.reject(new Error(`Unknown fifth-course lesson ${id}`));

  const request = loader().then((loaded) => {
    const lesson = Object.values(loaded)[0];
    cache.set(id, lesson);
    inFlight.delete(id);
    return lesson;
  });
  inFlight.set(id, request);
  return request;
}

export function loadPart5Lessons(ids: number[]): Promise<TextCourseLesson[]> {
  return Promise.all([...new Set(ids)].map(loadPart5Lesson));
}

/**
 * The words of the lessons before this one, for a lesson that cannot fill three
 * options out of its own glossary. Its own chunk, and it is fetched only by the
 * lessons that need it — most of the course does not.
 */
export async function loadPart5WordsMetBefore(lesson: TextCourseLesson): Promise<TextCourseWord[]> {
  if (!textCourseNeedsMetWords(lesson)) return [];
  const { part5Glossary } = await import("./glossary.ts");
  return part5Glossary.filter((entry) => entry.lesson < lesson.id);
}
