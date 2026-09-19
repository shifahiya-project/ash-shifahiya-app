/// <reference types="vite/client" />
import type { Part2Lesson } from "../types";

// One chunk per lesson, like the first course: the second course's words and
// its text only reach the browser when that lesson is opened.
// Typed by assertion rather than by a type argument on the glob: Next 16.3
// declares an `import.meta.glob` of its own for Turbopack, it merges with
// Vite's, and the merged signature takes no generic. The assertion says the
// same thing and does not care which of the two declarations wins.
const loaders = import.meta.glob("./lesson-*.ts") as Record<
  string,
  () => Promise<Record<string, Part2Lesson>>
>;

const byId = new Map<number, () => Promise<Record<string, Part2Lesson>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/lesson-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byId.set(id, loader);
}

const cache = new Map<number, Part2Lesson>();
const inFlight = new Map<number, Promise<Part2Lesson>>();

export function loadPart2Lesson(id: number): Promise<Part2Lesson> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const loader = byId.get(id);
  if (!loader) return Promise.reject(new Error(`Unknown second-course lesson ${id}`));

  const request = loader().then((loaded) => {
    const lesson = Object.values(loaded)[0];
    cache.set(id, lesson);
    inFlight.delete(id);
    return lesson;
  });
  inFlight.set(id, request);
  return request;
}

export function loadPart2Lessons(ids: number[]): Promise<Part2Lesson[]> {
  return Promise.all([...new Set(ids)].map(loadPart2Lesson));
}
