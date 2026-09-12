// Builds the fourth course — ханафитский фикх по «Тухфат аль-фукаха» — from the
// two exports the translator produces: a cumulative glossary of the words each
// lesson introduces, and the lesson's text as Frank-method pairs.
//
//   npm run part4:import -- <glossary.json> <text.json>
//
// Through npm, because reading the lessons already on disk means importing
// .ts files: type stripping is only on by default from Node 22.18, and this
// project supports 22.13 upward. The npm script carries the flag that the rest
// of the project's tooling already runs with.
//
// The machinery — numbering, the manifest, the glossary chunk, the checks —
// lives in text-course-import.mjs and is shared with the fifth course. What
// stays here is this book: how its export names things, and the corrections it
// needs.
import { fileURLToPath } from "node:url";
import { importTextCourse, nfc } from "./text-course-import.mjs";

/**
 * A lesson the two exports name differently. There are none in this book — both
 * files came out of the same edition — and the table stays because a later
 * re-export is where they appear: the check passes only when both sides read
 * exactly as written here, and any other divergence stops the import.
 */
const TITLE_FIXES = {
  // Keyed by book as well as by number: every book numbers its lessons from
  // one, so a bare number would carry a fix from one book into another.
};

/** A line of the text the export got wrong. None in this book so far. */
const TEXT_FIXES = {};

/**
 * A word of the glossary that came in without vowel marks, which a teaching
 * course does not show. The text spells the same word سَاجَةً, so the dictionary
 * form is vowelled from it rather than guessed. Keyed by the entry's id, and
 * checked: a fix that no longer matches stops the import instead of passing
 * quietly.
 */
const GLOSSARY_FIXES = {
  "tfq-vocab-0661": { arabic: { from: "ساج", to: "سَاجٌ" } },
};

/**
 * A heading the book prints inside a lesson. It is kept as a heading rather
 * than read out as a sentence of the argument. The export named it `section`
 * in the first six books and `heading` in the ones after; both head a piece of
 * text, so both open one.
 */
const HEADING_ROWS = new Set(["section", "heading"]);

/**
 * Rows that mark the text without belonging to it. A `divider` is a rule drawn
 * on the page; a `note` is the translator's remark about the printed original,
 * in Russian only. A `term` is an inline gloss of an Arabic term — the course
 * teaches those from its own glossary, where nearly every one of them already
 * stands, and on a reading screen the learner taps a line expecting its
 * translation, not a dictionary entry. All three are skipped with a count.
 */
const SKIPPED_ROWS = new Set(["term", "note", "divider"]);

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part4:import -- <glossary.json> <text.json>");
  process.exit(1);
}

await importTextCourse(
  {
    prefix: "part4",
    directory: fileURLToPath(new URL("../content/part4/", import.meta.url)),
    title: "четвёртая часть",
    bookName: (text, glossary) => text.title_ru ?? glossary.title_ru ?? "",
    // The export carries the book's two levels in one field, joined by a
    // middot: «Книга очищения · Глава о хадасе». They are told apart here
    // because they behave differently — a كِتَاب is one unbroken run of lessons
    // and heads it in the list, while a بَاب turns over every second lesson and
    // can come round again later, so it is named on the lesson's own card.
    divide: (entry, named) => {
      const [section, chapter] = nfc(entry.chapter ?? named.chapter ?? "")
        .split("·")
        .map((part) => part.trim());
      return { section, chapter };
    },
    headingRows: HEADING_ROWS,
    skippedRows: SKIPPED_ROWS,
    fixes: { TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES },
  },
  glossaryPath,
  textPath,
);
