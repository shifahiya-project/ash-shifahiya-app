/**
 * The podcast habit: one Arabic episode a day, from channels the learner picks.
 *
 * This module is the shared vocabulary of that feature and stays pure — no
 * storage, no network, no clock beyond what a caller passes in — so the tests
 * can import it directly and the daily pick can be reasoned about on paper.
 */

/** A YouTube channel the episodes are drawn from. */
export type PodcastChannel = {
  /** The `UC…` channel id. Empty until the catalog has been imported. */
  id: string;
  /** The `@handle`, which is what the learner actually pastes in. */
  handle: string;
  title: string;
  /**
   * The channel's own uploads playlist (`UU…`). Listing it costs one quota unit,
   * where searching the channel would cost a hundred.
   */
  uploadsPlaylistId: string;
};

export type PodcastVideo = {
  /** The eleven-character YouTube video id. */
  id: string;
  channelId: string;
  title: string;
  /** ISO timestamp, used to prefer newer episodes when nothing else separates them. */
  publishedAt: string;
  /** Real running time, read from the API rather than guessed from the title. */
  seconds: number;
};

export type PodcastCatalog = {
  /** When the list was last pulled from YouTube; shown so a stale list is visible. */
  generatedAt: string;
  channels: PodcastChannel[];
  videos: PodcastVideo[];
};

/**
 * One episode, watched. This is the whole record of the habit: a day is green
 * because a row here carries its date.
 *
 * `auto` separates the two ways a watch is recorded, because they are not
 * equally trustworthy. Watching inside the app is measured — the player reports
 * how far it actually got. Watching in the YouTube app cannot be measured at
 * all: YouTube gives no third-party app access to a viewer's watch history, so
 * there the learner presses «Я посмотрел» and the app takes their word for it.
 */
export type PodcastWatch = {
  videoId: string;
  channelId: string;
  title: string;
  /** Local calendar day, which is the unit the whole streak is counted in. */
  date: string;
  /** The episode's running time, credited to the totals. */
  seconds: number;
  auto: boolean;
  watchedAt: number;
  /** «ماذا فهمت؟» — an optional line, in any language, about what came across. */
  note?: string;
};

export const EMPTY_CATALOG: PodcastCatalog = { generatedAt: "", channels: [], videos: [] };

/**
 * The length window an episode has to fall into.
 *
 * Short on purpose: the habit is built by the day it is not missed, not by the
 * minutes watched. Anything under five minutes is a clip rather than a podcast,
 * and anything over fifteen is the thing that gets postponed to tomorrow.
 */
export const MIN_SECONDS = 5 * 60;
export const MAX_SECONDS = 15 * 60;

/** How long today's episode may run, as the learner has it set. */
export type LengthWindow = { min: number; max: number };

export const DEFAULT_WINDOW: LengthWindow = { min: MIN_SECONDS, max: MAX_SECONDS };

/**
 * Reads a YouTube `contentDetails.duration` (ISO 8601, `PT11M42S`) into seconds.
 *
 * The API omits the parts that are zero and keeps hours for the long ones, so
 * every field is optional. An unparseable value yields 0, which the length
 * filter then drops — better than admitting an episode of unknown length.
 */
export function parseDuration(duration: string): number {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration ?? "");
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/** `11:42`, or `1:02:30` once an episode runs past the hour. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** `8 ч 42 мин` for the totals, where a running time to the second means nothing. */
export function formatTotalTime(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
}

/**
 * Pulls the handle out of whatever the learner pasted: a full channel URL with
 * its tracking query, a bare `@handle`, or the handle without its `@`.
 *
 * Returns the handle in its canonical `@lowercase` form, or an empty string
 * when there is no handle in the input at all.
 */
export function parseChannelHandle(input: string): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";

  // A URL carries the handle in its first path segment; the query is noise.
  const fromUrl = /(?:youtube\.com|youtu\.be)\/@([A-Za-z0-9._-]+)/i.exec(trimmed);
  if (fromUrl) return `@${fromUrl[1].toLowerCase()}`;

  // Reject the other YouTube URL shapes rather than mistaking a path for a
  // handle: /channel/UC…, /c/Name and /user/Name are not handles.
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return "";

  const bare = /^@?([A-Za-z0-9._-]+)$/.exec(trimmed);
  return bare ? `@${bare[1].toLowerCase()}` : "";
}

/** Handles match case-insensitively: YouTube shows them cased, links are not. */
export function sameHandle(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The episodes that may be offered today: inside the length window, from a
 * channel that is still in the sources, and not watched before.
 *
 * Ordered newest first so that any two candidates the pick cannot otherwise
 * separate resolve toward the fresher episode.
 */
export function eligibleVideos(
  catalog: PodcastCatalog,
  watchedIds: Iterable<string>,
  window: LengthWindow = DEFAULT_WINDOW,
): PodcastVideo[] {
  const seen = new Set(watchedIds);
  const channels = new Set(catalog.channels.map((channel) => channel.id));
  return catalog.videos
    .filter((video) => !seen.has(video.id))
    .filter((video) => video.seconds >= window.min && video.seconds <= window.max)
    .filter((video) => channels.has(video.channelId))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

/** The channel an episode came from, for the line under its title. */
export function channelOf(catalog: PodcastCatalog, video: PodcastVideo): PodcastChannel | undefined {
  return catalog.channels.find((channel) => channel.id === video.channelId);
}

/**
 * YouTube's own thumbnail, which needs no API key and no stored URL: the path
 * is derived from the video id. `mqdefault` exists for every video, where the
 * higher-resolution names are missing on some and would render as a broken box.
 */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
