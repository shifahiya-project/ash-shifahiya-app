/// <reference types="vite/client" />
import type { ReadingSection } from "./types";

// Same shape as the lesson loader: one chunk per text, fetched when the learner
// opens it. Keep the pattern literal — the glob is resolved at build time.
const loaders = import.meta.glob<Record<string, ReadingSection>>("./reading/section-*.ts");

const byLesson = new Map<number, () => Promise<Record<string, ReadingSection>>>();
for (const [path, loader] of Object.entries(loaders)) {
  const id = Number(path.match(/section-(\d+)\.ts$/)?.[1]);
  if (Number.isFinite(id)) byLesson.set(id, loader);
}

const cache = new Map<number, ReadingSection>();
const inFlight = new Map<number, Promise<ReadingSection>>();

/** Loads the text a lesson carries, or rejects when it carries none. */
export function loadReading(lessonId: number, sectionId: number): Promise<ReadingSection> {
  const ready = cache.get(lessonId);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(lessonId);
  if (pending) return pending;

  const loader = byLesson.get(sectionId);
  if (!loader) return Promise.reject(new Error(`Lesson ${lessonId} has no reading text`));

  const request = loader().then((loaded) => {
    const section = Object.values(loaded)[0];
    cache.set(lessonId, section);
    inFlight.delete(lessonId);
    return section;
  });
  inFlight.set(lessonId, request);
  return request;
}
