/**
 * Reading a channel's episodes from the YouTube Data API.
 *
 * The same module serves both callers: the importer runs it in Node to build
 * the catalog that ships with the site, and the app runs it in the browser when
 * the learner has supplied their own key. There is no server in between —
 * the site is static files — so the browser talks to googleapis.com directly.
 *
 * The listing is done through each channel's own uploads playlist rather than
 * through `search.list`. Both would answer the question, but a search costs a
 * hundred quota units against a daily budget of ten thousand, where a playlist
 * page costs one: the difference is a hundred refreshes a day versus a hundred
 * refreshes a day for the whole rest of your life.
 */
import { parseDuration, type PodcastCatalog, type PodcastChannel, type PodcastVideo } from "./podcast-catalog.ts";

const API = "https://www.googleapis.com/youtube/v3";

/**
 * How much of a channel's back catalogue to read. Four pages is deep enough to
 * outlast a long habit and shallow enough that a refresh stays cheap.
 */
const MAX_PAGES_PER_CHANNEL = 4;
const PAGE_SIZE = 50;

/**
 * The band an episode has to fall into to be stored at all.
 *
 * Wider than the length window the learner watches by, so that widening the
 * window in settings does not require re-importing. The floor drops Shorts,
 * which are not podcasts; the ceiling drops the multi-hour streams, which no
 * daily habit is going to be built out of.
 */
const KEEP_MIN_SECONDS = 60;
const KEEP_MAX_SECONDS = 60 * 60;

export class YouTubeError extends Error {}

async function call(path: string, params: Record<string, string>, apiKey: string) {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(`${API}/${path}?${query}`);

  if (!response.ok) {
    // The API explains itself in the body; a bare status code would leave the
    // learner guessing between a wrong key, a key without the YouTube Data API
    // switched on, and a day's quota already spent.
    const detail = await response
      .json()
      .then((body) => body?.error?.message ?? "")
      .catch(() => "");
    if (response.status === 403) {
      throw new YouTubeError(
        `YouTube отказал в доступе. Проверьте, что ключ разрешён для YouTube Data API v3 и дневная квота не исчерпана. ${detail}`.trim(),
      );
    }
    if (response.status === 400) {
      throw new YouTubeError(`YouTube не принял запрос — скорее всего, ключ неверен. ${detail}`.trim());
    }
    throw new YouTubeError(`YouTube ответил ${response.status}. ${detail}`.trim());
  }

  return response.json();
}

/** Resolves an `@handle` to the channel and the uploads playlist behind it. */
export async function fetchChannel(handle: string, apiKey: string): Promise<PodcastChannel | null> {
  const body = await call(
    "channels",
    { part: "snippet,contentDetails", forHandle: handle.replace(/^@/, "") },
    apiKey,
  );
  const item = body.items?.[0];
  if (!item) return null;

  return {
    id: item.id,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    title: item.snippet?.title ?? handle,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

/** The video ids in a channel's uploads playlist, newest first, capped. */
async function fetchUploadIds(playlistId: string, apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";

  for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page += 1) {
    const body = await call(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId,
        maxResults: String(PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );
    for (const item of body.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = body.nextPageToken ?? "";
    if (!pageToken) break;
  }

  return ids;
}

/**
 * Durations and titles for a batch of ids.
 *
 * `videos.list` takes fifty ids per call, and the running time is the reason
 * this call exists at all: the playlist tells us what was published, but only
 * this tells us whether it is eleven minutes or two hours.
 */
async function fetchVideoDetails(ids: string[], channelId: string, apiKey: string): Promise<PodcastVideo[]> {
  const videos: PodcastVideo[] = [];

  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const batch = ids.slice(start, start + PAGE_SIZE);
    const body = await call(
      "videos",
      { part: "snippet,contentDetails", id: batch.join(",") },
      apiKey,
    );

    for (const item of body.items ?? []) {
      // A stream that is running or announced has no useful duration yet, and
      // is not something to hand someone as today's episode.
      if (item.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none") continue;

      const seconds = parseDuration(item.contentDetails?.duration ?? "");
      if (seconds < KEEP_MIN_SECONDS || seconds > KEEP_MAX_SECONDS) continue;

      videos.push({
        id: item.id,
        channelId,
        title: item.snippet?.title ?? "",
        publishedAt: item.snippet?.publishedAt ?? "",
        seconds,
      });
    }
  }

  return videos;
}

export type CatalogProgress = (message: string) => void;

/**
 * Builds a catalog for a set of handles.
 *
 * A handle that cannot be resolved is reported and skipped rather than failing
 * the whole refresh: one renamed channel should not cost the learner the other
 * two. A key that is refused, on the other hand, fails everything, because
 * retrying the remaining channels with it is pointless.
 */
export async function fetchCatalog(
  handles: string[],
  apiKey: string,
  onProgress: CatalogProgress = () => {},
): Promise<{ catalog: PodcastCatalog; missing: string[] }> {
  const channels: PodcastChannel[] = [];
  const videos: PodcastVideo[] = [];
  const missing: string[] = [];

  for (const handle of handles) {
    onProgress(`Канал ${handle}…`);
    const channel = await fetchChannel(handle, apiKey);
    if (!channel || !channel.uploadsPlaylistId) {
      missing.push(handle);
      continue;
    }

    const ids = await fetchUploadIds(channel.uploadsPlaylistId, apiKey);
    const found = await fetchVideoDetails(ids, channel.id, apiKey);
    channels.push(channel);
    videos.push(...found);
    onProgress(`${channel.title}: ${found.length} выпусков`);
  }

  return {
    catalog: {
      generatedAt: new Date().toISOString(),
      channels,
      videos: videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)),
    },
    missing,
  };
}
