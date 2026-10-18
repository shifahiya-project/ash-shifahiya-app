/** Milliseconds per independently recorded playback session, keyed by course:id. */
export type ListeningTime = Record<string, number>;
export function createListeningTime(): {
  KEY: string;
  normalize(value: unknown): ListeningTime;
  merge(mine: unknown, theirs: unknown): ListeningTime;
  seconds(value: unknown): number;
  tracker(options: {
    course: number;
    read(): unknown;
    write(value: ListeningTime): void;
    now(): number;
    makeId(): string;
  }): { start(): void; stop(): void; flush(): void };
};
