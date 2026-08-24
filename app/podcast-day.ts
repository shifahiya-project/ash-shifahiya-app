/**
 * Which episode today is. Pure, so the rule can be tested without a browser.
 *
 * The point of pinning is that the day's episode must not change when the page
 * is reloaded. A habit is easier to keep when the thing to do is already
 * decided: a fresh random episode on every reload turns the app into a slot
 * machine and gives the learner a reason to keep pulling instead of watching.
 */
import { hash, seededShuffle } from "../content/questions.ts";
import {
  DEFAULT_WINDOW,
  eligibleVideos,
  type LengthWindow,
  type PodcastCatalog,
} from "./podcast-catalog.ts";

/**
 * The episodes a single day has been given.
 *
 * `videoIds` is a list rather than one id because the daily goal is a floor and
 * not a ceiling: the first entry meets the goal, every «Посмотреть ещё» appends
 * another. `skipped` remembers what «Другое» turned down, so a rejected episode
 * is not offered again the same day.
 */
export type DayPlan = {
  date: string;
  videoIds: string[];
  skipped: string[];
};

export function emptyPlan(date: string): DayPlan {
  return { date, videoIds: [], skipped: [] };
}

/**
 * The order today's candidates are considered in.
 *
 * Seeded by the date, so the choice holds all day and across devices, and the
 * whole library gets a turn instead of the newest episode winning every day.
 */
function orderedFor(
  catalog: PodcastCatalog,
  watchedIds: Iterable<string>,
  date: string,
  window: LengthWindow,
) {
  return seededShuffle(eligibleVideos(catalog, watchedIds, window), hash(date));
}

/**
 * Fills the day's plan with one episode if it has none yet.
 *
 * An episode already pinned stays pinned even once it has been watched: the
 * card on screen has to keep showing what the learner just finished. It is
 * dropped only when it leaves the catalog or falls outside the length window,
 * which is to say when the sources or the settings changed under it.
 */
export function planForDay(
  catalog: PodcastCatalog,
  watchedIds: Iterable<string>,
  date: string,
  stored: DayPlan | undefined,
  window: LengthWindow = DEFAULT_WINDOW,
): DayPlan {
  const plan = stored?.date === date ? stored : emptyPlan(date);
  const known = new Map(catalog.videos.map((video) => [video.id, video]));
  const pinned = plan.videoIds.filter((id) => {
    const video = known.get(id);
    return video !== undefined && video.seconds >= window.min && video.seconds <= window.max;
  });

  if (pinned.length > 0) {
    return pinned.length === plan.videoIds.length ? plan : { ...plan, videoIds: pinned };
  }

  const seen = new Set([...watchedIds, ...plan.skipped]);
  const next = orderedFor(catalog, seen, date, window)[0];
  return next ? { ...plan, videoIds: [next.id] } : { ...plan, videoIds: pinned };
}

/**
 * Turns down the episode on screen and pins the next candidate in its place.
 *
 * The refused episode goes on `skipped` rather than back into the pool: it is
 * still unwatched, so it can come round on another day, but offering it again
 * this afternoon would just repeat a decision the learner already made.
 */
export function withAnotherPick(
  catalog: PodcastCatalog,
  watchedIds: Iterable<string>,
  plan: DayPlan,
  window: LengthWindow = DEFAULT_WINDOW,
): DayPlan {
  const current = plan.videoIds[plan.videoIds.length - 1];
  if (!current) return plan;

  const skipped = plan.skipped.includes(current) ? plan.skipped : [...plan.skipped, current];
  const seen = new Set([...watchedIds, ...skipped, ...plan.videoIds]);
  const next = orderedFor(catalog, seen, plan.date, window)[0];
  // Nothing left to swap to: keep the episode rather than empty the screen.
  if (!next) return plan;

  return { ...plan, videoIds: [...plan.videoIds.slice(0, -1), next.id], skipped };
}

/**
 * Adds one more episode to a day whose goal is already met. The extra episodes
 * are pinned the same way, so they too survive a reload.
 */
export function withExtraEpisode(
  catalog: PodcastCatalog,
  watchedIds: Iterable<string>,
  plan: DayPlan,
  window: LengthWindow = DEFAULT_WINDOW,
): DayPlan {
  const seen = new Set([...watchedIds, ...plan.skipped, ...plan.videoIds]);
  const next = orderedFor(catalog, seen, plan.date, window)[0];
  return next ? { ...plan, videoIds: [...plan.videoIds, next.id] } : plan;
}

/** The episode on screen: the last one the day pinned. */
export function currentVideoId(plan: DayPlan): string | undefined {
  return plan.videoIds[plan.videoIds.length - 1];
}
