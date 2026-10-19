export type PlaybackContext = { courseId: number; lessonId: number; key: string };
export type ListeningPlayback = PlaybackContext & {
  position: number; duration: number; rate: number; loop: boolean;
  updatedAt: number; dismissed: boolean; finished: boolean;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function createListeningPlayback(): {
  KEY: string;
  studyKey(course: number, lesson: number): string;
  normalize(value: unknown): ListeningPlayback | null;
  active(storage: StorageLike): ListeningPlayback | null;
  latest(storage: StorageLike, catalog: readonly {courseId?: number; lessonId: number; duration?: number}[]): ListeningPlayback | null;
  checkpoint(storage: StorageLike, context: PlaybackContext, values: {
    position: number; duration: number; rate: number; loop: boolean; finished: boolean;
  }, activate?: boolean, now?: number): ListeningPlayback | null;
  dismiss(storage: StorageLike, key: string): void;
  savePosition(storage: StorageLike, context: PlaybackContext, position: number, preferences: Record<string, unknown>): void;
  restore(audio: HTMLMediaElement, position: number): {ready(): boolean; dispose(): void};
};
