/** The learner explicitly marks the text and recording as completed. */
export type ListeningProgress = {
  completed: boolean;
  updatedAt: number;
};

/** Shared with the standalone player; existing lesson scores keep their keys. */
export const LISTENING_PROGRESS_KEY = "shifahiya-listening-progress-v1";

/** Ignore malformed records from storage, backups or another device. */
export function normalizeListeningProgress(value: unknown): Record<number, ListeningProgress> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<number, ListeningProgress> = {};
  for (const [id, item] of Object.entries(value)) {
    const lessonId = Number(id);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(lessonId) || lessonId <= 0) continue;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Partial<ListeningProgress>;
    if (typeof record.completed !== "boolean" || typeof record.updatedAt !== "number") continue;
    if (!Number.isFinite(record.updatedAt) || record.updatedAt < 0) continue;
    const previous = normalized[lessonId];
    if (!previous || record.updatedAt > previous.updatedAt
      || (record.updatedAt === previous.updatedAt && record.completed)) {
      normalized[lessonId] = { completed: record.completed, updatedAt: record.updatedAt };
    }
  }
  return normalized;
}
