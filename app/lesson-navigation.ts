import type { Lesson } from "../content/types";

/** Keep original deck indices: review cards use them as persistent addresses. */
export function nextPopulatedDeck(lesson: Lesson, start: number, end: number): number | null {
  for (let index = start; index < end; index += 1) {
    if (lesson.decks[index]?.words.length) return index;
  }
  return null;
}
