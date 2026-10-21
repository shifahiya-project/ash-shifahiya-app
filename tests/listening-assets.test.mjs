import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { listeningHref } from '../app/listening-catalog.ts';

const root = new URL('../public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('text-and-audio/catalog.json', root), 'utf8'));

test('replaced listening assets have content versions that change with their files', async () => {
  const corrected = catalog.find(entry => (entry.courseId ?? 1) === 1 && entry.lessonId === 96);
  assert(new URL(corrected.audioSrc, 'https://example.test/').searchParams.has('v'));
  assert(new URL(corrected.textSrc, 'https://example.test/').searchParams.has('v'));
  for (const entry of catalog) {
    for (const key of ['audioSrc', 'textSrc']) {
      const url = new URL(entry[key], root);
      const version = url.searchParams.get('v');
      if (!version) continue;
      const body = await readFile(url);
      assert.equal(version, createHash('sha256').update(body).digest('hex').slice(0, 16),
        `${entry[key]} must change when its file changes`);
    }
  }
});

test('menu links bypass an older player document and retain the lesson and course', async () => {
  const html = await readFile(new URL('text-and-audio.html', root), 'utf8');
  const script = html.match(/src="(\.\/text-and-audio\/player\.js[^"]+)"/)[1];
  const version = new URL(script, 'https://example.test/').searchParams.get('v');
  assert(version);
  for (const [lesson, course] of [[96, 1], [11, 2]]) {
    const url = new URL(listeningHref(lesson, course), 'https://example.test/');
    assert.equal(url.searchParams.get('v'), version);
    assert.equal(url.searchParams.get('lesson'), String(lesson));
    assert.equal(url.searchParams.get('course') ?? '1', String(course));
  }
});
