/// <reference types="vite/client" />
import { expandLessonQuestions } from "./questions";
import type { Lesson } from "./types";

// Vite turns each match into its own chunk, so a lesson's words only reach the
// browser when that lesson is opened. Keep the pattern literal — the glob is
// resolved at build time and cannot take a variable.
// Typed by assertion rather than by a type argument on the glob: Next 16.3
// declares an `import.meta.glob` of its own for Turbopack, it merges with
// Vite's, and the merged signature takes no generic. The assertion says the
// same thing and does not care which of the two declarations wins.
const loaders = import.meta.glob("./lesson-*.ts") as Record<
  string,
  () => Promise<Record<string, Lesson>>
>;

const byId = new Map<number, () => Promise<Record<string, Lesson>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/lesson-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byId.set(id, loader);
}

const cache = new Map<number, Lesson>();
const inFlight = new Map<number, Promise<Lesson>>();

/** Loads one lesson, expands its questions, and remembers it for the session. */
export function loadLesson(id: number): Promise<Lesson> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const loader = byId.get(id);
  if (!loader) return Promise.reject(new Error(`Unknown lesson ${id}`));

  const request = loader().then((loaded) => {
    const lesson = expandLessonQuestions(Object.values(loaded)[0]);
    cache.set(id, lesson);
    inFlight.delete(id);
    return lesson;
  });
  inFlight.set(id, request);
  return request;
}

export function loadLessons(ids: number[]): Promise<Lesson[]> {
  return Promise.all([...new Set(ids)].map(loadLesson));
}
