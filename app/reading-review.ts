// Types only, so the tests can import this module directly.
import type { ReadingProgress } from "./progress-store";

/**
 * Reading is repeated on its own clock, apart from the Leitner boxes the words
 * use. A text is not a card: it is not forgotten in a day and it is not
 * recalled by halves, so it comes back a few times over a month and then rests.
 */
export const READING_INTERVALS = [2, 4, 7, 15, 31];

const LAST_BOX = READING_INTERVALS.length - 1;

/** The day a review lands on, counted from today at noon like the card dates. */
export function readingDate(daysFromNow = 0, today = new Date()) {
  const date = new Date(today);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

/**
 * Advances a text one step down the schedule. Re-reading it never sends the
 * learner back: the interval only grows, and at the last step it stays there.
 */
export function nextReadingProgress(previous: ReadingProgress | undefined, today = new Date()): ReadingProgress {
  const box = Math.min((previous ? previous.box + 1 : 0), LAST_BOX);
  return {
    box,
    nextReview: readingDate(READING_INTERVALS[box], today),
    lastRead: readingDate(0, today),
    reads: (previous?.reads ?? 0) + 1,
  };
}

/** Lessons whose text is due, in course order. */
export function dueReadingIds(readings: Record<number, ReadingProgress>, today = readingDate()) {
  return Object.entries(readings)
    .filter(([, item]) => item.nextReview <= today)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}
