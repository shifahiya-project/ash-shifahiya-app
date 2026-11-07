import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyPart3ReviewedText, part3TextFingerprint } from "../scripts/part3-reviewed-text.mjs";

const root = new URL("../", import.meta.url);
const cleanup = JSON.parse(await readFile(new URL("scripts/part3-main-text.json", root), "utf8"));
const rawReviews = await Promise.all(["bakri", "kursavi"].map(async (name) =>
  JSON.parse(await readFile(new URL(`scripts/${name}-text-corrections.json`, root), "utf8"))));
const course = [];
for (let id = 1; id <= 37; id++) {
  const imported = await import(new URL(`content/part3/lesson-${String(id).padStart(2, "0")}.ts`, root));
  course.push(structuredClone(Object.values(imported)[0]));
}

// Restore the exact documented input, including removed source footnotes.
// This exercises all review guards against the published data, not a mock subset.
function sourceBook(book, original) {
  const { offset } = cleanup.books[book];
  const lessons = structuredClone(course.filter((lesson) => lesson.book === book));
  for (const lesson of lessons) {
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
  test(`${book}: original and reviewed exports produce the same main text and keep word positions`, () => {
    const expected = structuredClone(course.filter((lesson) => lesson.book === book));
    for (const lesson of expected) lesson.id -= edition.offset;
    assert.equal(part3TextFingerprint(expected), edition.sha256);
    for (const original of [true, false]) {
      const input = sourceBook(book, original);
      applyPart3ReviewedText(book, input);
      assert.deepEqual(input, expected);
      applyPart3ReviewedText(book, input);
      assert.deepEqual(input, expected, "a repeated review is idempotent");
    }
    assert.equal(expected.reduce((n, lesson) => n + lesson.words.length, 0), edition.words);
    assert.equal(expected.reduce((n, lesson) => n + lesson.fragments.length, 0), edition.fragments);
  });

  test(`${book}: an incompatible export fails without partially changing the caller`, () => {
    const input = sourceBook(book, true);
    input[0].fragments[0].arabic += " تَغْيِيرٌ";
    const saved = structuredClone(input);
    assert.throws(() => applyPart3ReviewedText(book, input));
    assert.deepEqual(input, saved);
  });
}

test("only the main text reaches lessons, including an untranslated Arabic source passage", () => {
  assert.equal(course.length, 37);
  assert.equal(course.reduce((n, lesson) => n + lesson.words.length, 0), 887);
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
      if (/^(?:import-part3|part3-output|part3-reviewed-text|bakri-text-corrections|kursavi-text-corrections|part3-main-text)\.(?:mjs|json)$/.test(file)) {
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
