/**
 * The podcast habit's own corner of localStorage, read the same way the course
 * reads its progress: through useSyncExternalStore, so the server renders an
 * empty snapshot, hydration matches it, and the stored values arrive in the
 * pass React does for any external store. Nothing is copied into state on mount.
 */
import type { PodcastCatalog, PodcastWatch } from "./podcast-catalog.ts";
import { DEFAULT_WINDOW, EMPTY_CATALOG, type LengthWindow } from "./podcast-catalog.ts";
import type { DayPlan } from "./podcast-day.ts";
import type { SyncedPodcasts } from "./merge-progress.ts";
import { podcastDate } from "./podcast-stats.ts";

export const WATCHES_KEY = "shifahiya-podcasts-v1";
export const PLANS_KEY = "shifahiya-podcast-days-v1";
export const CATALOG_KEY = "shifahiya-podcast-catalog-v1";
export const SOURCES_KEY = "shifahiya-podcast-sources-v1";
export const WINDOW_KEY = "shifahiya-podcast-window-v1";
/**
 * The learner's own YouTube Data API key. It stays on the device and is sent
 * only to googleapis.com; a key restricted to the YouTube Data API is meant to
 * be readable by the page that uses it, which is why Google issues browser keys
 * at all. Nothing here ever leaves for our own servers — there are none.
 */
export const API_KEY_KEY = "shifahiya-podcast-key";

export type PodcastState = {
  watches: PodcastWatch[];
  plans: Record<string, DayPlan>;
  /** The list pulled from YouTube on this device, if it has been refreshed here. */
  catalog: PodcastCatalog | null;
  /** Channel handles the learner added on top of the ones the app ships with. */
  sources: string[];
  window: LengthWindow;
  apiKey: string;
};

const EMPTY: PodcastState = {
  watches: [],
  plans: {},
  catalog: null,
  sources: [],
  window: DEFAULT_WINDOW,
  apiKey: "",
};

const listeners = new Set<() => void>();
let snapshot: PodcastState | null = null;

function read<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function readState(): PodcastState {
  return {
    watches: read<PodcastWatch[]>(WATCHES_KEY, []),
    plans: read<Record<string, DayPlan>>(PLANS_KEY, {}),
    catalog: read<PodcastCatalog | null>(CATALOG_KEY, null),
    sources: read<string[]>(SOURCES_KEY, []),
    window: { ...DEFAULT_WINDOW, ...read<Partial<LengthWindow>>(WINDOW_KEY, {}) },
    apiKey: window.localStorage.getItem(API_KEY_KEY) ?? "",
  };
}

function publish() {
  snapshot = null;
  for (const listener of listeners) listener();
}

/**
 * Days older than this stop being kept as plans. The watch log is the record
 * worth having; a pinned episode from last spring is just clutter, and the map
 * would otherwise grow for as long as the habit lasts.
 */
const PLAN_HISTORY_DAYS = 30;

function prunePlans(plans: Record<string, DayPlan>, today: string): Record<string, DayPlan> {
  const cutoff = podcastDate(-PLAN_HISTORY_DAYS, new Date(`${today}T12:00:00Z`));
  return Object.fromEntries(Object.entries(plans).filter(([date]) => date >= cutoff));
}

export const podcastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Must keep returning the same object until something actually changes. */
  getSnapshot(): PodcastState {
    snapshot ??= readState();
    return snapshot;
  },

  getServerSnapshot(): PodcastState {
    return EMPTY;
  },

  /**
   * Records a watched episode. Watching the same episode twice is not counted
   * twice: the log is what the totals are summed from, and an accidental
   * double-tap would otherwise inflate both the episode count and the minutes.
   */
  markWatched(watch: PodcastWatch) {
    const watches = podcastStore.getSnapshot().watches;
    if (watches.some((item) => item.videoId === watch.videoId)) return;
    window.localStorage.setItem(WATCHES_KEY, JSON.stringify([...watches, watch]));
    publish();
  },

  /** Undo for a mis-tapped «Я посмотрел», which is easy to hit and hard to fix. */
  unmarkWatched(videoId: string) {
    const watches = podcastStore.getSnapshot().watches.filter((item) => item.videoId !== videoId);
    window.localStorage.setItem(WATCHES_KEY, JSON.stringify(watches));
    publish();
  },

  saveNote(videoId: string, note: string) {
    const watches = podcastStore.getSnapshot().watches.map((item) =>
      item.videoId === videoId ? { ...item, note: note.trim() || undefined } : item,
    );
    window.localStorage.setItem(WATCHES_KEY, JSON.stringify(watches));
    publish();
  },

  savePlan(plan: DayPlan) {
    const plans = prunePlans({ ...podcastStore.getSnapshot().plans, [plan.date]: plan }, plan.date);
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    publish();
  },

  saveCatalog(catalog: PodcastCatalog) {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
    publish();
  },

  setSources(handles: string[]) {
    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(handles));
    publish();
  },

  setWindow(next: LengthWindow) {
    window.localStorage.setItem(WINDOW_KEY, JSON.stringify(next));
    publish();
  },

  /**
   * The part of the habit that belongs on every device: what was watched, what
   * each day was offered, and which channels were added. The length window and
   * the API key stay behind — one has no timestamp to merge by, the other is a
   * credential.
   */
  syncedSnapshot(): SyncedPodcasts {
    const state = podcastStore.getSnapshot();
    return { watches: state.watches, plans: state.plans, sources: state.sources };
  },

  /** Writes back the merge of this device and the server. */
  applySynced(next: SyncedPodcasts) {
    window.localStorage.setItem(WATCHES_KEY, JSON.stringify(next.watches));
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(next.plans));
    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(next.sources));
    publish();
  },

  setApiKey(key: string) {
    if (key) window.localStorage.setItem(API_KEY_KEY, key);
    else window.localStorage.removeItem(API_KEY_KEY);
    publish();
  },
};

/**
 * The catalog the app should actually use: the one refreshed on this device if
 * there is one, otherwise the list built at release time. A device that has
 * never been given an API key still has episodes to offer.
 */
export function activeCatalog(state: PodcastState, shipped: PodcastCatalog): PodcastCatalog {
  const stored = state.catalog;
  if (!stored || stored.videos.length === 0) return shipped;
  if (shipped.videos.length === 0) return stored;
  return stored.generatedAt >= shipped.generatedAt ? stored : shipped;
}

export { EMPTY_CATALOG };

/**
 * Today's date, as a second external store.
 *
 * Two reasons it is a store rather than a `new Date()` in the render. The
 * server has no business knowing the learner's timezone, so it renders an empty
 * date and the real one arrives on hydration like every other client value.
 * And a habit app is left open overnight: the subscription re-arms itself at
 * midnight, so the day rolls over on screen instead of waiting for a reload.
 */
const dayListeners = new Set<() => void>();
let midnightTimer: ReturnType<typeof setTimeout> | undefined;

function armMidnight() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  // A minute into the new day, so a clock running slightly fast does not fire
  // while the old date is still the right answer.
  midnightTimer = setTimeout(() => {
    armMidnight();
    for (const listener of dayListeners) listener();
  }, midnight.getTime() - now.getTime() + 60_000);
}

export const todayStore = {
  subscribe(listener: () => void) {
    dayListeners.add(listener);
    if (dayListeners.size === 1) armMidnight();
    return () => {
      dayListeners.delete(listener);
      if (dayListeners.size === 0) clearTimeout(midnightTimer);
    };
  },

  /** A fresh string each call, but equal by value, so React settles at once. */
  getSnapshot: () => podcastDate(),

  /** The server does not know what day it is where the learner is. */
  getServerSnapshot: () => "",
};
