import { createListeningReview } from "../public/text-and-audio/review.js";
export type { ListeningReviewProgress, ListeningReviewMap } from "../public/text-and-audio/review.js";

const review = createListeningReview();
export const LISTENING_REVIEW_PROGRESS_KEY = review.KEY;
export const LISTENING_REVIEW_OFFSETS = review.OFFSETS;
export const LISTENING_REVIEW_INTERVALS = review.INTERVALS;
export const listeningReviewKey = review.reviewKey;
export const normalizeListeningReviews = review.normalize;
export const mergeListeningReviews = review.merge;
export const resolveListeningReview = review.resolve;
export const nextListeningReviewDate = review.nextDate;
export const dueListeningReviews = review.queue;

/** Refresh due dates at local midnight and when a sleeping tab comes back. */
export function subscribeListeningDay(listener: () => void) {
  let timeout: ReturnType<typeof setTimeout>;
  const refresh = () => {
    clearTimeout(timeout);
    listener();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    timeout = setTimeout(refresh, Math.max(1, midnight.getTime() - Date.now()));
  };
  const visible = () => { if (!document.hidden) refresh(); };
  refresh();
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearTimeout(timeout);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visible);
  };
}
export const listeningDaySnapshot = () => review.localDay();
export const listeningDayServerSnapshot = () => "";
