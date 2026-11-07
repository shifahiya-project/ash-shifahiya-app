import { readFileSync } from "node:fs";

const review = JSON.parse(readFileSync(new URL("./bakri-text-corrections.json", import.meta.url), "utf8"));

// Exact field guards prevent an older or differently segmented edition from
// silently receiving a correction intended for another passage. Re-importing
// an already corrected export is safe and does not duplicate any wording.
export function applyBakriTextCorrections(book, lessons) {
  if (book !== review.book) return;
  for (const correction of review.corrections) {
    const lesson = lessons.find((item) => item.id === correction.lesson);
    const fragment = lesson?.fragments[correction.fragment - 1];
    if (!fragment) throw new Error(`Missing reviewed fragment ${correction.lesson}.${correction.fragment}`);
    for (const field of ["arabic", "russian"]) {
      const change = correction[field];
      if (!change) continue;
      if (fragment[field] === change.after) continue;
      if (fragment[field] !== change.before) {
        throw new Error(`Reviewed text changed at ${correction.lesson}.${correction.fragment} (${field}); compare the source before importing`);
      }
      fragment[field] = change.after;
    }
  }
}
