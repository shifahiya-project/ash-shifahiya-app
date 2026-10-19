import assert from 'node:assert/strict';
import test from 'node:test';
import { createListeningPlayback } from '../public/text-and-audio/playback.js';

const playback = createListeningPlayback();
class Storage {
  items = new Map();
  getItem(key) { return this.items.get(key) ?? null; }
  setItem(key, value) { this.items.set(key, String(value)); }
}
const context = { courseId: 2, lessonId: 11, key: playback.studyKey(2, 11) };
const values = { position: 123, duration: 900, rate: 1.25, loop: false, finished: false };

test('closing a continuation preserves its position, and a new play reopens it', () => {
  const storage = new Storage();
  playback.checkpoint(storage, context, values, true, 10);
  playback.dismiss(storage, context.key);
  assert.equal(playback.active(storage).dismissed, true);
  playback.checkpoint(storage, context, { ...values, position: 124 }, false, 20);
  assert.equal(playback.active(storage).dismissed, true, 'Closing cleanup must not reopen the player');
  assert.equal(playback.active(storage).position, 124);
  playback.checkpoint(storage, context, { ...values, position: 125 }, true, 30);
  assert.equal(playback.active(storage).dismissed, false);
});

test('background saves cannot replace the last chosen lesson or revive finished audio', () => {
  const storage = new Storage();
  playback.checkpoint(storage, context, values, true, 10);
  const other = { courseId: 1, lessonId: 87, key: playback.studyKey(1, 87) };
  playback.checkpoint(storage, other, values, true, 20);
  playback.checkpoint(storage, context, values, false, 30);
  assert.equal(playback.active(storage).key, other.key);
  playback.checkpoint(storage, other, { ...values, position: 0, finished: true }, false, 40);
  playback.checkpoint(storage, other, values, false, 50);
  assert.equal(playback.active(storage).finished, true);
  playback.checkpoint(storage, other, { ...values, position: 1 }, true, 60);
  assert.equal(playback.active(storage).finished, false);
});

test('normal and review positions stay separate while preferences are shared', () => {
  const storage = new Storage();
  storage.setItem(context.key, JSON.stringify({ position: 42, showText: false, fontSize: 36 }));
  const review = { ...context, key: 'shifahiya-p2-listening-review-11-2026-10-19-1-v1' };
  playback.savePosition(storage, review, 180, { rate: 1.5, loop: true });
  assert.equal(JSON.parse(storage.getItem(review.key)).position, 180);
  assert.deepEqual(JSON.parse(storage.getItem(context.key)), { position: 42, showText: false, fontSize: 36, rate: 1.5, loop: true });
});

test('legacy unfinished recordings remain discoverable without resurrecting a closed player', () => {
  const storage = new Storage();
  const catalog = [{ courseId: 2, lessonId: 11, duration: 900 }];
  storage.setItem(context.key, JSON.stringify({ position: 100, rate: 1.25 }));
  assert.equal(playback.latest(storage, catalog).position, 100);
  playback.checkpoint(storage, context, values, true);
  playback.dismiss(storage, context.key);
  assert.equal(playback.latest(storage, catalog).dismissed, true);
  assert.equal(playback.normalize({ ...context, ...values, key: 'unrelated-storage-key' }), null);
  assert.equal(playback.normalize({ ...context, ...values, position: Infinity }), null);
});

class Audio extends EventTarget {
  readyState = 0;
  duration = NaN;
  seeking = false;
  value = 0;
  get currentTime() { return this.value; }
  set currentTime(value) { this.value = value; this.seeking = true; }
  finishSeek() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
}
test('restoration waits for metadata and a completed seek before accepting position saves', () => {
  const audio = new Audio();
  const restoration = playback.restore(audio, 1200);
  audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(restoration.ready(), false);
  audio.readyState = 1;
  audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(restoration.ready(), false, 'Unknown duration must not reset the saved position');
  audio.duration = 3600;
  audio.dispatchEvent(new Event('durationchange'));
  assert.equal(audio.currentTime, 1200);
  assert.equal(restoration.ready(), false);
  audio.finishSeek();
  assert.equal(restoration.ready(), true);
  restoration.dispose();
});

test('restoration retries when an early seek did not stick', () => {
  const audio = new Audio();
  audio.readyState = 1; audio.duration = 3600;
  const restoration = playback.restore(audio, 1800);
  audio.value = 0; audio.seeking = false;
  audio.dispatchEvent(new Event('canplay'));
  assert.equal(audio.currentTime, 1800);
  audio.finishSeek();
  assert.equal(restoration.ready(), true);
  restoration.dispose();
});
