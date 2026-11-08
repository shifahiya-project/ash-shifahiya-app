import { readFileSync } from "node:fs";

const review = JSON.parse(readFileSync(new URL("./kursavi-text-corrections.json", import.meta.url), "utf8"));

// The importer numbers each book from one before assigning course-wide IDs.
// Keep both fragment and vocabulary positions stable for learner progress.
export function applyKursaviTextCorrections(book, lessons) {
  if (book !== review.book) return;
  for (const [collection, position, changes] of [
    ["fragments", "fragment", review.corrections],
    ["words", "word", review.wordCorrections],
  ]) {
    for (const correction of changes) {
      const lesson = lessons.find((item) => item.id === correction.lesson - 20);
      const item = lesson?.[collection][correction[position] - 1];
      if (!item) throw new Error(`Missing reviewed Kursavi ${collection} ${correction.lesson}.${correction[position]}`);
      for (const field of ["arabic", "russian"]) {
        const change = correction[field];
        if (!change || item[field] === change.after) continue;
        if (item[field] !== change.before) {
          throw new Error(`Reviewed Kursavi text changed at ${correction.lesson}.${correction[position]} (${field}); compare the source before importing`);
        }
        item[field] = change.after;
      }
    }
  }
}
