/// <reference types="vite/client" />
import { textCourseNeedsMetWords } from "../text-course-questions.ts";
import type { TextCourseLesson, TextCourseWord } from "../types";

// One chunk per lesson, like the courses before it: the seventh course's words
// and its text only reach the browser when that lesson is opened.
// Typed by assertion rather than by a type argument on the glob: Next 16.3
// declares an `import.meta.glob` of its own for Turbopack, it merges with
// Vite's, and the merged signature takes no generic. The assertion says the
// same thing and does not care which of the two declarations wins.
const loaders = import.meta.glob("./lesson-*.ts") as Record<
  string,
  () => Promise<Record<string, TextCourseLesson>>
>;

const byId = new Map<number, () => Promise<Record<string, TextCourseLesson>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/lesson-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byId.set(id, loader);
}

const cache = new Map<number, TextCourseLesson>();
const inFlight = new Map<number, Promise<TextCourseLesson>>();

export function loadPart7Lesson(id: number): Promise<TextCourseLesson> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const loader = byId.get(id);
  if (!loader) return Promise.reject(new Error(`Unknown seventh-course lesson ${id}`));

  const request = loader().then((loaded) => {
    const lesson = Object.values(loaded)[0];
    cache.set(id, lesson);
    inFlight.delete(id);
    return lesson;
  });
  inFlight.set(id, request);
  return request;
}

export function loadPart7Lessons(ids: number[]): Promise<TextCourseLesson[]> {
  return Promise.all([...new Set(ids)].map(loadPart7Lesson));
}

/**
 * The words of the lessons before this one, for a lesson that cannot fill three
 * options out of its own glossary. Its own chunk, and it is fetched only by the
 * lessons that need it — most of the course does not.
 */
export async function loadPart7WordsMetBefore(lesson: TextCourseLesson): Promise<TextCourseWord[]> {
  if (!textCourseNeedsMetWords(lesson)) return [];
  const { part7Glossary } = await import("./glossary.ts");
  return part7Glossary.filter((entry) => entry.lesson < lesson.id);
}
