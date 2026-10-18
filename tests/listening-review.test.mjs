import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createListeningReview } from "../public/text-and-audio/review.js";

const review = createListeningReview();
const study = () => review.setStudied(undefined, true, "2026-10-18", 100);

test("the seven audio reviews follow the supplied year-long calendar", () => {
  let record = study();
  const dates = ["2026-10-19", "2026-10-21", "2026-10-25", "2026-11-08", "2026-12-17", "2027-04-16", "2027-10-18"];
  assert.deepEqual(review.plan(record).slice(1).map(item => item.date), dates);
  for (const day of dates) {
    assert.equal(review.nextDate(record), day);
    record = review.complete(record, day, record.updatedAt + 1);
  }
  assert.equal(record.repeatedOn.length, 7);
  assert.equal(review.nextDate(record), null);
  assert.deepEqual(review.complete(record, "2028-10-18", 1000), record);
});

test("a late audio review retains the next interval from its actual date", () => {
  const late = review.complete(study(), "2026-10-24", 200);
  assert.equal(review.nextDate(late), "2026-10-26");
  assert.equal(review.plan(late).at(-1).date, "2027-10-23");
});

test("early listens and repeated clicks cannot consume another stage", () => {
  assert.deepEqual(review.complete(study(), "2026-10-18", 200), study());
  const first = review.complete(study(), "2026-10-19", 200);
  assert.deepEqual(review.complete(first, "2026-10-19", 300), first);
  assert.deepEqual(review.complete(first, "2026-10-20", 300), first);
});

test("cancelling and restoring an initial mark preserves the earned reviews", () => {
  const first = review.complete(study(), "2026-10-19", 200);
  const cancelled = review.setStudied(first, false, "2026-10-20", 300);
  assert.equal(review.nextDate(cancelled), null);
  const restored = review.setStudied(cancelled, true, "2026-10-20", 400);
  assert.equal(review.nextDate(restored), "2026-10-21");
  assert.deepEqual(restored.repeatedOn, ["2026-10-19"]);
});

test("legacy completions supply their study date without changing the saved marker", () => {
  const completion = { completed: true, updatedAt: new Date(2026, 9, 18, 12).getTime() };
  const derived = review.resolve(undefined, completion);
  assert.equal(derived.studiedOn, "2026-10-18");
  assert.equal(review.nextDate(derived), "2026-10-19");
  const cancelled = review.resolve(derived, { completed: false, updatedAt: completion.updatedAt + 1 });
  assert.equal(review.nextDate(cancelled), null);
  assert.equal(completion.completed, true);
  assert.equal(review.resolve({ ...derived, active: false }, completion).active, true, 'Simultaneous marks settle on completion');
});

test("the queue spans later courses, excludes the first course, and orders overdue lessons", () => {
  const catalog = [{ courseId: 1, lessonId: 1 }, { courseId: 2, lessonId: 1 }, { courseId: 3, lessonId: 1 }, { courseId: 3, lessonId: 2 }];
  const earlier = review.setStudied(undefined, true, "2026-10-17", 100);
  const queued = review.queue(catalog, { "3:1": earlier, "2:1": study() }, {}, "2026-10-19");
  assert.deepEqual(queued.map(item => [item.courseId, item.lessonId]), [[3, 1], [2, 1]]);
  assert.deepEqual(review.queue(catalog, { "3:1": review.setStudied(earlier, false) }, {}, "2026-10-19"), []);
});

test("bad backup records cannot invent reviews or break the queue", () => {
  const valid = study();
  const records = review.normalize({
    "2:1": valid,
    "1:1": valid,
    "02:1": valid,
    "3:0": valid,
    "3:1": { ...valid, studiedOn: "2026-02-30" },
    "3:2": { ...valid, repeatedOn: ["2026-10-18"] },
    "3:3": { ...valid, repeatedOn: ["2026-10-19", "2026-10-20"] },
    "3:4": { ...valid, updatedAt: Infinity },
    "3:5": { ...valid, studiedOn: "9999-12-31" },
  });
  assert.deepEqual(records, { "2:1": valid });
});

test("review sync is commutative and a later cancellation survives an older device", () => {
  const first = review.complete(study(), "2026-10-19", 200);
  const cancelled = review.setStudied(first, false, "2026-10-20", 300);
  const old = { "2:1": first }, recent = { "2:1": cancelled, "3:1": study() };
  assert.deepEqual(review.merge(old, recent), review.merge(recent, old));
  assert.equal(review.merge(old, recent)["2:1"].active, false);
  const simultaneous = { "2:1": { ...first, updatedAt: cancelled.updatedAt } };
  assert.deepEqual(review.merge(simultaneous, recent), review.merge(recent, simultaneous));
});

test("a stale-device cancellation preserves reviews earned after the shared history", () => {
  const shared = review.complete(study(), "2026-10-19", 200);
  const laptop = review.complete(shared, "2026-10-21", 300);
  const phone = review.setStudied(shared, false, "2026-10-22", 400);
  const merged = review.merge({ "2:1": laptop }, { "2:1": phone })["2:1"];
  assert.equal(merged.active, false);
  assert.equal(merged.updatedAt, 400);
  assert.deepEqual(merged.repeatedOn, ["2026-10-19", "2026-10-21"]);
  assert.equal(review.nextDate(merged), null);
  const restored = review.setStudied(merged, true, "2026-10-22", 500);
  assert.equal(review.nextDate(restored), "2026-10-25");
});

test("a newer shorter history cannot erase earned stages or change their study day", () => {
  let advanced = study();
  for (const [index, day] of ["2026-10-19", "2026-10-21", "2026-10-25"].entries()) {
    advanced = review.complete(advanced, day, 200 + index);
  }
  const laterStudy = review.setStudied(undefined, true, "2026-10-20", 300);
  const shorter = review.complete(laterStudy, "2026-10-26", 400);
  const merged = review.merge({ "2:1": advanced }, { "2:1": shorter });
  assert.equal(merged["2:1"].studiedOn, "2026-10-18");
  assert.deepEqual(merged["2:1"].repeatedOn, ["2026-10-19", "2026-10-21", "2026-10-25"]);
  assert.deepEqual(review.normalize(merged), merged);
  assert.equal(review.nextDate(merged["2:1"]), "2026-11-08");
});

test("concurrent reviews converge across repeated sync orders without inventing stages", () => {
  const early = review.complete(study(), "2026-10-19", 200);
  const late = review.complete(study(), "2026-10-20", 200);
  const concurrent = review.merge({ "2:1": early }, { "2:1": late })["2:1"];
  assert.deepEqual(concurrent.repeatedOn, ["2026-10-20"]);
  assert.equal(review.nextDate(concurrent), "2026-10-22");
  const laterSecond = review.complete(early, "2026-10-24", 250);
  const earlierSecond = review.complete(late, "2026-10-22", 300);
  const second = review.merge({ "2:1": laterSecond }, { "2:1": earlierSecond })["2:1"];
  assert.deepEqual(second.repeatedOn, ["2026-10-19", "2026-10-24"]);
  assert.equal(review.nextDate(second), "2026-10-28");
  const maps = [study(), early, late, review.complete(early, "2026-10-21", 250),
    laterSecond, earlierSecond, review.setStudied(study(), false, "2026-10-22", 300)].map(item => ({ "2:1": item }));
  for (const a of maps) {
    assert.deepEqual(review.merge(a, a), a);
    for (const b of maps) {
      assert.deepEqual(review.merge(a, b), review.merge(b, a));
      for (const c of maps) {
        assert.deepEqual(review.merge(review.merge(a, b), c), review.merge(a, review.merge(b, c)));
      }
    }
  }
});

test("audio dates survive leap days, DST, and both ends of the local calendar", () => {
  assert.equal(review.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(review.addDays("2026-03-28", 1), "2026-03-29");
  for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/Berlin"]) {
    const script = `import {createListeningReview} from './public/text-and-audio/review.js'; const r=createListeningReview(); console.log(r.localDay(new Date(2026,9,18,12))); console.log(r.nextDate(r.setStudied(undefined,true,'2026-10-18',100)));`;
    const result = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: zone }, encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(result, ["2026-10-18", "2026-10-19"], zone);
  }
});
