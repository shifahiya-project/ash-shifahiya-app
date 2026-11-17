import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPart4Revision, importPart4Revision } from "../scripts/import-part4-revision.mjs";

const russianHeadings = new Map([
  ["h-139-2", "Первый раздел: «Твоё дело в твоих руках»"],
  ["h-139-30", "Второй раздел: слова «выбирай»"],
  ["h-140-0", "Третий раздел: слова «ты разведена, если пожелаешь»"],
  ["h-140-7", "Четвёртый раздел: слова «разведи себя сама»"],
]);

// A complete independent export exercises the fixed edition contract without
// requiring the uploaded ZIP files or reading any developer-specific path.
function completeEdition() {
  const glossary = { title_ru: "Тухфат аль-фукаха", revision: "2026-11-17", format_version: 2, lessons: [] };
  const reading = { title_ru: glossary.title_ru, revision: glossary.revision, lessons: [], items: [] };
  const reviewAddresses = { revision: "tuhfat-2026-11-17", addresses: {} };
  let pairNumber = 0;
  let wordNumber = 0;
  let contextNumber = 0;
  for (let number = 1; number <= 159; number += 1) {
    const book = Math.ceil(number / 18);
    const chapter = `Книга ${book}`;
    const title = `Урок ${number}`;
    const titleAr = number % 2 ? "بَابٌ" : "";
    const lesson = { number, title_ru: title, title_ar: titleAr, chapter, book,
      previous_number: null, entries: [], contexts: [] };
    glossary.lessons.push(lesson);
    reading.lessons.push({ number, ru: title, ar: titleAr, chapter, book, previous: null });
    const headingBlocks = new Set([0]);
    if (number === 1) for (let index = 1; index <= 21; index += 1) headingBlocks.add(index);
    if (number === 139) { headingBlocks.add(2); headingBlocks.add(30); }
    if (number === 140) headingBlocks.add(7);
    const pairCount = number === 1 ? 61 : 28;
    const lessonPairs = [];
    for (let block = 0; block < pairCount + headingBlocks.size; block += 1) {
      const heading = headingBlocks.has(block);
      let sourceId = null;
      if (!heading) {
        pairNumber += 1;
        sourceId = number === 104 && lessonPairs.length === 0 ? 6464 : pairNumber;
      }
      const id = heading ? `h-${number}-${block}` : `p-${sourceId}`;
      const row = { id, lesson: number, type: heading ? "heading" : "pair",
        ar: russianHeadings.has(id) ? "" : `كِتَابٌ ${number}، بَابٌ ${block}.`,
        ru: russianHeadings.get(id) ?? `Основной текст урока ${number}, абзац ${block}.`,
        source: { id: sourceId, block, kind: heading ? "heading" : "pair" } };
      if (heading) row.source.level = number % 3 + 1;
      else lessonPairs.push(row);
      reading.items.push(row);
    }
    for (const row of lessonPairs.slice(0, number <= 101 ? 5 : 4)) {
      contextNumber += 1;
      const context = { id: row.id, kind: row.type, source_id: row.source.id,
        arabic: row.ar, russian: row.ru, entry_ids: [] };
      lesson.contexts.push(context);
      for (let count = 0; count < (contextNumber <= 170 ? 2 : 1); count += 1) {
        wordNumber += 1;
        const teak = number === 104 && row.id === "p-6464" && count === 0;
        const id = teak ? "tfq-vocab-0661" : `fixture-word-${wordNumber}`;
        const source = { id, contextId: context.id, contextKind: context.kind,
          contextSourceId: context.source_id, oldLesson: null, origin: "fixture", extra: { retained: true } };
        lesson.entries.push({ id, lesson: number, number: lesson.entries.length + 1,
          global_number: wordNumber, type: "term", arabic: teak ? "ساج" : "كِتَابٌ",
          russian: `Термин ${wordNumber}`, context_key: row.id, source_kind: row.type, source });
        context.entry_ids.push(id);
        reviewAddresses.addresses[id] = { lessonId: 1, index: wordNumber + 100 };
      }
    }
  }
  assert.equal(pairNumber, 4485);
  assert.equal(contextNumber, 737);
  assert.equal(wordNumber, 907);
  return { glossary, reading, reviewAddresses };
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "part4-import-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("the complete replacement preserves all source rows, headings and stable word addresses", () => {
  const source = completeEdition();
  const before = structuredClone(source);
  const built = buildPart4Revision(source);
  assert.deepEqual(source, before, "building must not alter either source export");
  assert.deepEqual(built.totals, { lessons: 159, words: 907, contexts: 737,
    pairs: 4485, headings: 183, fragments: 4668, russianOnlyHeadings: 4 });
  assert.deepEqual(built.lessons.map((lesson) => lesson.id), Array.from({ length: 159 }, (_, index) => index + 1));
  assert.equal(built.files.size, 162);
  assert.match(built.files.get("lesson-159.ts"), /export const part4LessonOneHundredFiftyNine/);
  assert.equal(built.lessons[1].arabicTitle, "", "an absent Arabic title must not be invented");
  const fragments = built.lessons.flatMap((lesson) => lesson.fragments);
  source.reading.items.forEach((row, index) => {
    assert.equal(fragments[index].arabic, row.ar.normalize("NFC"));
    assert.equal(fragments[index].russian, row.ru);
    assert.equal(fragments[index].sourceId, row.id);
    assert.equal(fragments[index].heading, row.type === "heading" ? true : undefined);
    assert.equal(fragments[index].headingLevel, row.source.level);
  });
  assert.deepEqual(new Map(fragments.filter((row) => row.arabic === "").map((row) =>
    [row.sourceId, row.russian])), russianHeadings);
  const addresses = built.allWords.map((word) => `${word.reviewLessonId}:${word.reviewIndex}`);
  assert.equal(new Set(addresses).size, 907);
  built.allWords.forEach((word) => {
    assert.equal(word.reviewLessonId, source.reviewAddresses.addresses[word.source.id].lessonId);
    assert.equal(word.reviewIndex, source.reviewAddresses.addresses[word.source.id].index);
    assert.deepEqual(word.source.extra, { retained: true });
  });
  assert.match(built.files.get("glossary.ts"), /"reviewIndex":/);
  assert.match(built.files.get("glossary.ts"), /"source":/);
  const reverseMap = JSON.parse(built.files.get("review-map.ts").match(/= (\{[\s\S]*\});/u)[1]);
  assert.equal(Object.keys(reverseMap).length, 907);
  built.allWords.forEach((word) => assert.equal(
    reverseMap[`${word.reviewLessonId}-${word.reviewIndex}`], word.lesson,
  ));
});

test("the source-verified teak correction is ID guarded and idempotent", () => {
  const source = completeEdition();
  const word = source.glossary.lessons[103].entries.find((entry) => entry.id === "tfq-vocab-0661");
  const first = buildPart4Revision(source);
  assert.equal(first.allWords.find((entry) => entry.source.id === word.id).arabic, "سَاجٌ".normalize("NFC"));
  word.arabic = "سَاجٌ";
  assert.deepEqual(buildPart4Revision(source).files, first.files);
  word.arabic = "كِتَابٌ";
  assert.throws(() => buildPart4Revision(source), /teak vocalisation fix requires review/);
});

test("a complete import overwrites previous segmentation, removes stale generated lessons and keeps helpers", async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(join(directory, "lesson-001.ts"), "old lesson");
  await writeFile(join(directory, "lesson-160.ts"), "stale lesson");
  await writeFile(join(directory, "lessons.ts"), "helper module");
  await writeFile(join(directory, "review-addresses.json"), "migration metadata");
  const built = await importPart4Revision({ ...completeEdition(), directory });
  const files = await readdir(directory);
  assert.equal(files.filter((name) => /^lesson-\d+\.ts$/u.test(name)).length, 159);
  assert.equal(files.includes("lesson-160.ts"), false);
  assert.equal(await readFile(join(directory, "lessons.ts"), "utf8"), "helper module");
  assert.equal(await readFile(join(directory, "review-addresses.json"), "utf8"), "migration metadata");
  assert.equal(await readFile(join(directory, "lesson-001.ts"), "utf8"), built.files.get("lesson-001.ts"));
  const repeated = await importPart4Revision({ ...completeEdition(), directory });
  assert.deepEqual(repeated.files, built.files);
});

test("late source errors and incompatible editions fail before changing any output", async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(join(directory, "lesson-001.ts"), "untouched lesson");
  await writeFile(join(directory, "manifest.ts"), "untouched manifest");
  const malformedCases = [
    (source) => { source.reading.revision = "old-edition"; },
    (source) => { source.glossary.lessons.at(-1).title_ru = "Другая редакция"; },
    (source) => { source.glossary.lessons.at(-1).contexts.at(-1).arabic = "بَابٌ"; },
    (source) => { source.glossary.lessons.at(-1).contexts.at(-1).entry_ids.push("absent-word"); },
    (source) => {
      const addresses = Object.values(source.reviewAddresses.addresses);
      Object.assign(addresses.at(-1), addresses[0]);
    },
    (source) => { source.reading.items.at(-1).type = "note"; },
    (source) => { source.reading.items.find((row) => row.id === "h-139-2").ar = "مَبْحَثٌ"; },
  ];
  for (const corrupt of malformedCases) {
    const source = completeEdition();
    corrupt(source);
    await assert.rejects(importPart4Revision({ ...source, directory }), /Invalid part4 source:/);
    assert.deepEqual((await readdir(directory)).sort(), ["lesson-001.ts", "manifest.ts"]);
    assert.equal(await readFile(join(directory, "lesson-001.ts"), "utf8"), "untouched lesson");
    assert.equal(await readFile(join(directory, "manifest.ts"), "utf8"), "untouched manifest");
  }
});
