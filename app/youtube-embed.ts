/**
 * The embedded player, and the one thing it is here for: knowing whether an
 * episode was actually watched.
 *
 * This is the only place the app can measure anything. Inside the iframe the
 * player reports its own position, so «watched» can mean what it should mean —
 * most of the episode actually played. Outside it, in the YouTube app, nothing
 * can be measured: YouTube gives no third-party app read access to a viewer's
 * watch history, so that path ends in the learner pressing a button and the app
 * believing them. Both are honest; only one is automatic.
 */

/** How much of an episode has to play before the day is marked done by itself. */
export const WATCHED_RATIO = 0.8;

/** How often the position is read while an episode plays. */
export const POLL_MS = 2000;

type PlayerEvent = { data: number; target: YouTubePlayer };

export type YouTubePlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

type PlayerOptions = {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: PlayerEvent) => void;
    onStateChange?: (event: PlayerEvent) => void;
  };
};

type YouTubeApi = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";

let pending: Promise<YouTubeApi> | undefined;

/**
 * Loads YouTube's iframe API once, on the first play.
 *
 * Deliberately not loaded with the page: it is the only third-party script the
 * app has, and a learner who opens the calendar and closes it again should not
 * have fetched anything from YouTube at all.
 */
export function loadPlayerApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    // The API calls one fixed global when it finishes loading, so anything else
    // already waiting on it has to be chained rather than replaced.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube iframe API loaded without a player"));
    };

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      pending = undefined;
      reject(new Error("Не удалось загрузить плеер YouTube"));
    };
    document.head.append(script);
  });

  return pending;
}

/** Whether enough of the episode has played to count it without asking. */
export function isWatchedEnough(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false;
  return position / duration >= WATCHED_RATIO;
}
