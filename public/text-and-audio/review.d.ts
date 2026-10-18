export type ListeningReviewProgress = {
  active: boolean;
  studiedOn: string;
  repeatedOn: string[];
  updatedAt: number;
};
export type ListeningReviewMap = Record<string, ListeningReviewProgress>;
export type ListeningCompletion = { completed: boolean; updatedAt: number };
export type ReviewCatalogEntry = { courseId?: number; lessonId: number; courseTitle?: string; duration?: number };
export function createListeningReview(): {
  KEY: string;
  OFFSETS: number[];
  INTERVALS: number[];
  localDay(date?: Date): string;
  addDays(day: string, days: number): string;
  reviewKey(course: number, lesson: number): string;
  normalize(value: unknown): ListeningReviewMap;
  merge(mine: unknown, theirs: unknown): ListeningReviewMap;
  resolve(saved?: ListeningReviewProgress, completion?: ListeningCompletion): ListeningReviewProgress | undefined;
  setStudied(previous: ListeningReviewProgress | undefined, active: boolean, today?: string, now?: number): ListeningReviewProgress;
  nextDate(record?: ListeningReviewProgress): string | null;
  complete(previous: ListeningReviewProgress | undefined, today?: string, now?: number): ListeningReviewProgress | undefined;
  plan(record: ListeningReviewProgress): { stage: number; date: string; done: boolean }[];
  queue<T extends ReviewCatalogEntry>(catalog: readonly T[], progress: unknown, completions?: Record<number, ListeningCompletion>, today?: string): (T & { review: ListeningReviewProgress; nextReview: string })[];
};
