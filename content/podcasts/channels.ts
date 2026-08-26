/**
 * The channels the podcast habit starts from.
 *
 * Handles rather than `UC…` ids, because a handle is what a person can read,
 * check and paste. The ids and the uploads playlists are looked up by the
 * importer and land in the generated catalog next door.
 *
 * This list is only the starting point: the learner adds channels in the app's
 * settings by pasting a link, and those are stored on the device.
 */
export const DEFAULT_HANDLES = [
  "@echo_arabic_podcast",
  "@masterarabic1",
  "@arabicspeakingpractice",
];
