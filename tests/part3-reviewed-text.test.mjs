import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyPart3ReviewedText, part3TextFingerprint } from "../scripts/part3-reviewed-text.mjs";

const root = new URL("../", import.meta.url);
const cleanup = JSON.parse(await readFile(new URL("scripts/part3-main-text.json", root), "utf8"));
const vocabulary = JSON.parse(await readFile(new URL("scripts/part3-vocabulary-review.json", root), "utf8"));
const rawReviews = await Promise.all(["bakri", "kursavi"].map(async (name) =>
  JSON.parse(await readFile(new URL(`scripts/${name}-text-corrections.json`, root), "utf8"))));
const course = [];
for (let id = 1; id <= 37; id++) {
  const imported = await import(new URL(`content/part3/lesson-${String(id).padStart(2, "0")}.ts`, root));
  course.push(structuredClone(Object.values(imported)[0]));
}

function restoreVocabulary(lesson) {
  for (const addition of vocabulary.additions.filter((entry) => entry.lesson === lesson.id)
    .sort((a, b) => b.position - a.position)) {
    assert.deepEqual(lesson.words[addition.position - 1], addition.entry);
    lesson.words.splice(addition.position - 1, 1);
  }
  for (const edit of vocabulary.edits.filter((entry) => entry.lesson === lesson.id)) {
    assert.deepEqual(lesson.words[edit.word - 1], edit.after);
    lesson.words[edit.word - 1] = structuredClone(edit.before);
  }
}

function mainTextBook(book) {
  const lessons = structuredClone(course.filter((lesson) => lesson.book === book));
  for (const lesson of lessons) {
    restoreVocabulary(lesson);
    lesson.id -= cleanup.books[book].offset;
  }
  return lessons;
}

// Restore the exact documented input, including removed source footnotes.
// This exercises all review guards against the published data, not a mock subset.
function sourceBook(book, original) {
  const { offset } = cleanup.books[book];
  const lessons = structuredClone(course.filter((lesson) => lesson.book === book));
  for (const lesson of lessons) {
    restoreVocabulary(lesson);
    for (const entry of cleanup.droppedFragments.filter((entry) => entry.lesson === lesson.id)
      .sort((a, b) => a.fragment - b.fragment)) {
      lesson.fragments.splice(entry.fragment - 1, 0, structuredClone(entry.before));
    }
    for (const entry of cleanup.corrections.filter((entry) => entry.lesson === lesson.id)) {
      for (const field of ["arabic", "russian"]) {
        if (entry[field]) lesson.fragments[entry.fragment - 1][field] = entry[field].before;
      }
    }
    if (original) {
      const review = rawReviews.find((entry) => entry.book === book);
      for (const [collection, key, entries] of [
        ["fragments", "fragment", review.corrections], ["words", "word", review.wordCorrections ?? []],
      ]) {
        for (const entry of entries.filter((entry) => entry.lesson === lesson.id)) {
          for (const field of ["arabic", "russian"]) {
            if (entry[field]) lesson[collection][entry[key] - 1][field] = entry[field].before;
          }
        }
      }
    }
    lesson.id -= offset;
  }
  return lessons;
}

for (const [book, edition] of Object.entries(cleanup.books)) {
  test(`${book}: original and both reviewed stages produce the same edition and keep word positions`, () => {
    const expected = structuredClone(course.filter((lesson) => lesson.book === book));
    for (const lesson of expected) lesson.id -= edition.offset;
    assert.equal(part3TextFingerprint(expected), vocabulary.books[book].sha256);
    const mainText = mainTextBook(book);
    assert.equal(part3TextFingerprint(mainText), edition.sha256, "the original review fingerprint stays valid");
    for (const input of [sourceBook(book, true), sourceBook(book, false), mainText, structuredClone(expected)]) {
      applyPart3ReviewedText(book, input);
      assert.deepEqual(input, expected);
      applyPart3ReviewedText(book, input);
      assert.deepEqual(input, expected, "a repeated review is idempotent");
    }
    for (const lesson of mainTextBook(book)) {
      const result = expected.find((entry) => entry.id === lesson.id);
      for (const [index, word] of lesson.words.entries()) {
        const edit = vocabulary.edits.find((entry) => entry.lesson === lesson.id + edition.offset && entry.word === index + 1);
        assert.deepEqual(result.words[index], edit?.after ?? word, "existing word addresses stay stable");
      }
    }
    assert.equal(expected.reduce((n, lesson) => n + lesson.words.length, 0), vocabulary.books[book].words);
    assert.equal(expected.reduce((n, lesson) => n + lesson.words.filter((word) => !word.retired).length, 0),
      vocabulary.books[book].activeWords);
    assert.equal(expected.reduce((n, lesson) => n + lesson.fragments.length, 0), edition.fragments);
  });

  test(`${book}: an incompatible export fails without partially changing the caller`, () => {
    const input = sourceBook(book, true);
    input[0].fragments[0].arabic += " تَغْيِيرٌ";
    const saved = structuredClone(input);
    assert.throws(() => applyPart3ReviewedText(book, input));
    assert.deepEqual(input, saved);
  });

  test(`${book}: an incompatible vocabulary export fails atomically`, () => {
    const input = sourceBook(book, true);
    input[0].words[0].russian += " (другая редакция)";
    const saved = structuredClone(input);
    assert.throws(() => applyPart3ReviewedText(book, input));
    assert.deepEqual(input, saved);
  });
}

test("retirement is part of the reviewed fingerprint and cannot silently reactivate a card", () => {
  const edit = vocabulary.edits.find((entry) => entry.after.retired);
  const original = structuredClone(course.filter((lesson) => lesson.book === course.find((entry) => entry.id === edit.lesson).book));
  const book = original[0].book;
  for (const lesson of original) lesson.id -= vocabulary.books[book].offset;
  for (const retired of [false, undefined]) {
    const input = structuredClone(original);
    const word = input.find((lesson) => lesson.id === edit.lesson - vocabulary.books[book].offset).words[edit.word - 1];
    if (retired === undefined) delete word.retired;
    else word.retired = retired;
    assert.notEqual(part3TextFingerprint(input), vocabulary.books[book].sha256);
    const saved = structuredClone(input);
    assert.throws(() => applyPart3ReviewedText(book, input));
    assert.deepEqual(input, saved);
  }
});

test("only the main text reaches lessons, including an untranslated Arabic source passage", () => {
  assert.equal(course.length, 37);
  assert.equal(course.reduce((n, lesson) => n + lesson.words.length, 0), 894);
  assert.equal(course.reduce((n, lesson) => n + lesson.words.filter((word) => !word.retired).length, 0), 893);
  for (const lesson of course) {
    for (const line of lesson.fragments) {
      assert.doesNotMatch(line.arabic + line.russian, /PDF|Примечание редактора|\([1-7]\)|\* \* \*|---/);
    }
  }
  const missing = cleanup.untranslated[0];
  const fragment = course.find((lesson) => lesson.id === missing.lesson).fragments[missing.fragment - 1];
  assert.equal(fragment.arabic, missing.arabic);
  assert.equal(fragment.russian, "");
});

test("the real CLI keeps corrected words and main text when both original books are reimported", async () => {
  const directory = await mkdtemp(join(tmpdir(), "part3-reviewed-"));
  try {
    await mkdir(join(directory, "scripts"));
    await mkdir(join(directory, "content/part3"), { recursive: true });
    await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
    for (const file of await readdir(new URL("scripts/", root))) {
      if (/^(?:import-part3|part3-output|part3-reviewed-text|part3-vocabulary-review|bakri-text-corrections|kursavi-text-corrections|part3-main-text)\.(?:mjs|json)$/.test(file)) {
        await copyFile(new URL(`scripts/${file}`, root), join(directory, "scripts", file));
      }
    }
    for (const file of await readdir(new URL("content/part3/", root))) {
      if (/^lesson-\d+\.ts$/.test(file)) {
        await copyFile(new URL(`content/part3/${file}`, root), join(directory, "content/part3", file));
      }
    }
    for (const book of Object.keys(cleanup.books)) {
      const source = sourceBook(book, true);
      assert(source.every((lesson) => lesson.words.every((word) => !Object.hasOwn(word, "retired"))),
        "the source glossary has no application-specific retirement metadata");
      const glossary = { title_ru: book, lessons: source.map((lesson) => ({
        number: lesson.id, title_ru: lesson.title, title_ar: lesson.arabicTitle, section: lesson.section,
        entries: lesson.words.map((word, i) => ({ id: `source-${lesson.id}-${i}`, arabic: word.arabic,
          russian: word.russian, type: word.kind })),
      })) };
      const text = { title_ru: book, lessons: source.map((lesson) => ({ number: lesson.id,
        ru: lesson.title, ar: lesson.arabicTitle })), items: source.flatMap((lesson) =>
        lesson.fragments.map((line, i) => ({ type: "pair", id: `source-${lesson.id}-${i}`,
          lesson: lesson.id, ar: line.arabic, ru: line.russian }))) };
      await writeFile(join(directory, "glossary.json"), JSON.stringify(glossary));
      await writeFile(join(directory, "text.json"), JSON.stringify(text));
      execFileSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning",
        "scripts/import-part3.mjs", "glossary.json", "text.json"], { cwd: directory, stdio: "pipe" });
    }
    for (const file of await readdir(new URL("content/part3/", root))) {
      if (/^(?:lesson-\d+|manifest)\.ts$/.test(file)) {
        assert.equal(await readFile(join(directory, "content/part3", file), "utf8"),
          await readFile(new URL(`content/part3/${file}`, root), "utf8"), file);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
