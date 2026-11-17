// Versioned fiqh progress: old numerical lesson IDs belong to the legacy edition.
export const PART4_REVISION = "tuhfat-2026-11-17";
export const PART4_SOURCE_DATE = "2026-11-17";
export const PART4_LESSON_COUNT = 159;

const legacyWordCounts = [29, 30, 17, 2, 3, 12, 13, 8, 16, 27, 14, 14, 13, 14, 9, 5, 27, 19, 11, 5, 6, 2, 2, 3, 3, 5, 2, 9, 0, 2, 0, 25, 8, 17, 10, 23, 13, 7, 10, 2, 6, 3, 2, 6, 7, 2, 3, 3, 1, 0, 1, 1, 5, 8, 0, 4, 12, 2, 0, 4, 1, 4, 4, 3, 5, 5, 3, 7, 3, 8, 1, 4, 5, 2, 5, 5, 7, 6, 2, 0, 8, 4, 4, 2, 7, 9, 3, 4, 1, 6, 4, 8, 5, 2, 0, 5, 1, 3, 0, 8, 0, 4, 1, 0, 8, 2, 8, 4, 1, 3, 13, 2, 1, 0, 8, 9, 8, 9, 7, 14, 14, 6, 10, 7, 5, 0, 8, 5, 6, 5, 6, 3, 4, 4, 2, 4, 6, 6, 3, 9, 7, 9, 9, 9, 3];
export const part4LegacySummaries = legacyWordCounts.map((wordCount, index) => ({ id: index + 1, wordCount }));

// The author requested a fully fresh reading edition; no old lesson closes a new one.
export const part4CompletionSources: Record<number, number[]> = {};
