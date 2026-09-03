/// <reference types="vite/client" />
import type { Part3Lesson } from "../types";

// One chunk per lesson, like the courses before it: the third course's words
// and its text only reach the browser when that lesson is opened.
const loaders = import.meta.glob<Record<string, Part3Lesson>>("./lesson-*.ts");

const byId = new Map<number, () => Promise<Record<string, Part3Lesson>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/lesson-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byId.set(id, loader);
}

const cache = new Map<number, Part3Lesson>();
const inFlight = new Map<number, Promise<Part3Lesson>>();

export function loadPart3Lesson(id: number): Promise<Part3Lesson> {
  const ready = cache.get(id);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(id);
  if (pending) return pending;

  const loader = byId.get(id);
  if (!loader) return Promise.reject(new Error(`Unknown third-course lesson ${id}`));

  const request = loader().then((loaded) => {
    const lesson = Object.values(loaded)[0];
    cache.set(id, lesson);
    inFlight.delete(id);
    return lesson;
  });
  inFlight.set(id, request);
  return request;
}

export function loadPart3Lessons(ids: number[]): Promise<Part3Lesson[]> {
  return Promise.all([...new Set(ids)].map(loadPart3Lesson));
}
