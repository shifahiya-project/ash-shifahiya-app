import catalog from "../public/text-and-audio/catalog.json" with { type: "json" };

export const listeningCatalog = catalog;

const recordings = new Set(catalog.map((entry: { courseId?: number; lessonId: number }) =>
  `${entry.courseId ?? 1}:${entry.lessonId}`));

export function hasListening(id: number, course = 1) {
  return recordings.has(`${course}:${id}`);
}

export function listeningHref(id: number, course = 1) {
  return hasListening(id, course)
    ? `./text-and-audio.html?v=9&lesson=${id}${course === 1 ? "" : `&course=${course}`}`
    : undefined;
}
