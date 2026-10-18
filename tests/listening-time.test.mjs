import assert from 'node:assert/strict';
import test from 'node:test';
import { createListeningTime } from '../public/text-and-audio/time.js';
import { normalizeProgress, mergeProgress } from '../app/merge-progress.ts';

const time = createListeningTime();
function session(course = 2, id = 'one') {
  let clock = 0, saved = {}, failing = false;
  const tracker = time.tracker({
    course, now: () => clock, makeId: () => id,
    read: () => saved,
    write: value => { if (failing) throw Error('Storage full'); saved = value; },
  });
  return { tracker, advance: ms => { clock += ms; }, saved: () => saved,
    fail: value => { failing = value; }, restore: value => { saved = value; } };
}

test('valid counters from every course enter the total', () => {
  assert.deepEqual(time.normalize({ '1:old': 5000, '2:one': 1500, '11:two': 2500,
    '0:zero': 50, '2:negative': -1, '2:fraction': 1.5, '2:string': '100',
    '2:infinite': Infinity, '2:empty': 0, 'bad': 3000 }), { '1:old': 5000, '2:one': 1500, '11:two': 2500 });
  assert.equal(time.seconds({ '2:one': 1500, '11:two': 2500 }), 4);
  for (const value of [undefined, null, [], 4]) assert.deepEqual(time.normalize(value), {});
});

test('playback counts wall time, excluding pauses, waiting and seeking gaps', () => {
  const s = session();
  s.advance(60000);
  s.tracker.flush();
  assert.deepEqual(s.saved(), {});
  s.tracker.start();
  s.advance(2000);
  s.tracker.start(); // Duplicate playing events must not reset elapsed time.
  s.tracker.flush();
  s.advance(1000);
  s.tracker.stop();
  s.advance(120000); // Paused or buffering, even after a seek to a later position.
  s.tracker.flush();
  s.tracker.stop();
  assert.equal(time.seconds(s.saved()), 3);
  s.tracker.start();
  s.advance(2500); // The same real time at any playback rate.
  s.tracker.stop();
  assert.equal(s.saved()['2:one'], 5500);
});

test('first-course audio and its repeats accumulate in the same counter', () => {
  const s = session(1);
  s.tracker.start(); s.advance(90000); s.tracker.stop();
  s.advance(10000);
  s.tracker.start(); s.advance(90000); s.tracker.stop();
  assert.deepEqual(s.saved(), { '1:one': 180000 });
});

test('a storage failure keeps the unsaved playback for the next checkpoint', () => {
  const s = session();
  s.tracker.start(); s.advance(1250); s.fail(true); s.tracker.stop();
  assert.deepEqual(s.saved(), {});
  s.advance(10000); s.fail(false); s.tracker.start(); s.advance(750); s.tracker.stop();
  assert.equal(time.seconds(s.saved()), 2);
  s.restore({ '3:other': 3000 });
  s.tracker.flush();
  assert.deepEqual(s.saved(), { '2:one': 2000, '3:other': 3000 });
});

test('sync adds independent sessions once and takes the latest shared checkpoint', () => {
  const mine = normalizeProgress({ listeningTime: { '2:shared': 1000, '2:laptop': 2000 } });
  const theirs = normalizeProgress({ listeningTime: { '2:shared': 1500, '3:phone': 3000 } });
  const merged = mergeProgress(mine, theirs);
  assert.equal(time.seconds(merged.listeningTime), 6);
  assert.deepEqual(merged, mergeProgress(theirs, mine));
  assert.deepEqual(mergeProgress(merged, theirs), merged);
  assert.deepEqual(mergeProgress(merged, normalizeProgress({})).listeningTime, merged.listeningTime);
  assert.deepEqual(time.merge(merged.listeningTime, merged.listeningTime), merged.listeningTime);
});
