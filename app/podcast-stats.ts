/**
 * What the learner has actually done, counted from the watch log.
 *
 * Pure on purpose: every function takes the log and the day to count against,
 * so nothing here reads the clock and the tests can sit on any date they like.
 *
 * The whole feature turns on one distinction: **the daily goal is met or it is
 * not**, and separately, **how much was watched**. One episode makes the day
 * green; the second and the fifth only move the counters. Mixing the two would
 * turn a habit tracker into a scoreboard, where a good day makes yesterday look
 * like a failure.
 */
import type { PodcastWatch } from "./podcast-catalog.ts";

/** The date a day is keyed by, in the learner's own timezone rather than UTC. */
export function podcastDate(daysFromNow = 0, today = new Date()): string {
  const date = new Date(today);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** How many episodes were watched on a given day. */
export function watchedOn(watches: PodcastWatch[], date: string): PodcastWatch[] {
  return watches.filter((watch) => watch.date === date);
}

/** One episode is the whole goal, so any watch at all makes the day count. */
export function isGoalMet(watches: PodcastWatch[], date: string): boolean {
  return watches.some((watch) => watch.date === date);
}

/** The days with at least one episode, sorted and without repeats. */
export function activeDates(watches: PodcastWatch[]): string[] {
  return [...new Set(watches.map((watch) => watch.date))].sort();
}

function daysBetween(earlier: string, later: string): number {
  const from = new Date(`${earlier}T12:00:00Z`).getTime();
  const to = new Date(`${later}T12:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

/**
 * The current run of days and the best one ever.
 *
 * A run survives until a day is missed outright, so a streak still shows as
 * live during today before today's episode is watched — the day is not lost
 * until it is over. It breaks once the last active day is older than yesterday.
 */
export function streaks(watches: PodcastWatch[], today = podcastDate()) {
  const dates = activeDates(watches);

  let longest = 0;
  let run = 0;
  let previous = "";
  for (const date of dates) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const last = dates.at(-1);
  if (!last || daysBetween(last, today) > 1) return { current: 0, longest };

  let current = 1;
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (daysBetween(dates[index - 1], dates[index]) !== 1) break;
    current += 1;
  }
  return { current, longest };
}

export type PodcastTotals = {
  /** Days the goal was met — not episodes. */
  days: number;
  episodes: number;
  seconds: number;
};

export function totals(watches: PodcastWatch[]): PodcastTotals {
  return {
    days: activeDates(watches).length,
    episodes: watches.length,
    seconds: watches.reduce((sum, watch) => sum + watch.seconds, 0),
  };
}

/**
 * The month line — «в августе: 21/24 дня».
 *
 * The denominator counts the days that have actually happened, so a month in
 * progress is not scored against days that have not arrived yet.
 */
export function monthProgress(watches: PodcastWatch[], today = podcastDate()) {
  const month = today.slice(0, 7);
  const elapsed = Number(today.slice(8, 10));
  const done = activeDates(watches).filter((date) => date.startsWith(month)).length;
  return { done, elapsed };
}

export type CalendarDay = {
  date: string;
  day: number;
  state: "done" | "missed" | "today" | "future";
  episodes: number;
};

/** Blank cells lead the first week so the month starts under its weekday. */
export type CalendarWeek = (CalendarDay | null)[];

/**
 * The month as weeks running Monday to Sunday.
 *
 * Today is its own state rather than «missed»: the day is still open, and
 * colouring it as a failure before the evening would be both wrong and the
 * kind of nagging that gets an app deleted.
 */
export function monthCalendar(watches: PodcastWatch[], today = podcastDate()): CalendarWeek[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const counts = new Map<string, number>();
  for (const watch of watches) counts.set(watch.date, (counts.get(watch.date) ?? 0) + 1);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay() counts from Sunday; the calendar starts the week on Monday.
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const weeks: CalendarWeek[] = [];
  let week: CalendarWeek = Array(firstWeekday).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    const episodes = counts.get(date) ?? 0;
    const state: CalendarDay["state"] =
      episodes > 0 ? "done" : date === today ? "today" : date < today ? "missed" : "future";
    week.push({ date, day, state, episodes });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}
