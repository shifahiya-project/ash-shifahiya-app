import { createListeningTime } from "../public/text-and-audio/time.js";
export type { ListeningTime } from "../public/text-and-audio/time.js";

const time = createListeningTime();
export const LISTENING_TIME_KEY = time.KEY;
export const normalizeListeningTime = time.normalize;
export const mergeListeningTime = time.merge;
export const listeningTimeSeconds = time.seconds;
