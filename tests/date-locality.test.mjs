// The course names days by the learner's own calendar, not by UTC.
//
// Every date in the app — a review's due day, a streak's active day, the name
// of a backup file — is produced by taking noon on the local clock and reading
// the date off it. Noon is what makes that safe for nearly every offset: it is
// twelve hours from either edge of the day. But the reading itself used to go
// through toISOString, which answers in UTC, and noon at +13 or +14 is still
// the evening *before* in UTC. A learner in Samoa or Kiribati therefore got a
// course running a whole day behind the one on their wall.
//
// The offsets are set through TZ before the modules are imported, because that
// is the only way to ask the question at all: the bug is invisible anywhere
// between -11 and +12, which is where every developer of this course sits.
import test from "node:test";
import assert from "node:assert/strict";

/** What the calendar on the wall says, in the same YYYY-MM-DD shape. */
function wallDate(date = new Date()) {
  return date.toLocaleDateString("sv-SE");
}

/** Offsets the day is named from. The last two are where the bug lived. */
const ZONES = [
  "UTC",
  "Europe/Moscow", // +3, the course's own readers
  "America/Los_Angeles", // -8
  "Pacific/Midway", // -11, the western edge
  "Pacific/Chatham", // +12:45, a quarter-hour offset
  "Pacific/Tongatapu", // +13
  "Pacific/Kiritimati", // +14, the furthest ahead there is
];

test("every date helper names the day the learner's own calendar names", async () => {
  for (const zone of ZONES) {
    process.env.TZ = zone;
    // Fresh imports per zone: a module that cached a date would answer for the
    // zone it was first loaded in.
    const stamp = `${zone}-${Date.now()}`;
    const { topicDate } = await import(`../app/topic-schedule.ts?${stamp}`);
    const { readingDate } = await import(`../app/reading-review.ts?${stamp}`);
    const { podcastDate } = await import(`../app/podcast-stats.ts?${stamp}`);

    const today = wallDate();
    assert.equal(topicDate(), today, `topicDate in ${zone}`);
    assert.equal(readingDate(), today, `readingDate in ${zone}`);
    // The podcast habit already read the calendar this way; the others now
    // agree with it, which is what lets the two halves share a streak.
    assert.equal(podcastDate(), today, `podcastDate in ${zone}`);
  }
});

test("counting days forward and back stays on the local calendar", async () => {
  for (const zone of ZONES) {
    process.env.TZ = zone;
    const stamp = `offsets-${zone}-${Date.now()}`;
    const { topicDate } = await import(`../app/topic-schedule.ts?${stamp}`);
    const { readingDate } = await import(`../app/reading-review.ts?${stamp}`);

    for (const days of [-31, -1, 0, 1, 3, 7, 16, 35, 90]) {
      const expected = wallDate(
        // Noon local, moved by whole days, read off the wall clock.
        (() => {
          const date = new Date();
          date.setHours(12, 0, 0, 0);
          date.setDate(date.getDate() + days);
          return date;
        })(),
      );
      assert.equal(topicDate(days), expected, `topicDate(${days}) in ${zone}`);
      assert.equal(readingDate(days), expected, `readingDate(${days}) in ${zone}`);
    }
  }
});

test("the same helper called at midnight and at noon names one day", async () => {
  // A learner studying just after midnight must not be put on yesterday, which
  // is the other shape the UTC reading took: at -11 it was the far edge that
  // moved rather than the near one.
  for (const zone of ZONES) {
    process.env.TZ = zone;
    const stamp = `edges-${zone}-${Date.now()}`;
    const { topicDate } = await import(`../app/topic-schedule.ts?${stamp}`);

    for (const hour of [0, 1, 12, 22, 23]) {
      const moment = new Date();
      moment.setHours(hour, 30, 0, 0);
      assert.equal(topicDate(0, moment), wallDate(moment), `${hour}:30 in ${zone}`);
    }
  }
});
