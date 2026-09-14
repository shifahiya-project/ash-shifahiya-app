// Builds the ninth course — أُصُول الْفِقْه, the roots of the law — from the two
// exports the translator produces: a cumulative glossary of the words each
// lesson introduces, and the lesson's text as Frank-method pairs.
//
//   npm run part9:import -- <glossary.json> <text.json>
//
// The machinery it shares with the courses before it lives in
// text-course-import.mjs. What stays here is this book's own shape.
import { fileURLToPath } from "node:url";
import { importTextCourse, nfc } from "./text-course-import.mjs";

/** No lesson is named differently by the two exports; the table waits for one. */
const TITLE_FIXES = {};

/** A line of the text the export got wrong. None so far. */
const TEXT_FIXES = {};

/** A glossary entry the text has outrun. None so far. */
const GLOSSARY_FIXES = {};

/** A row the export typed as text although it is markup. None so far. */
const SKIPPED_IDS = {};

/** What this export calls a row of the text itself. */
const PAIR_ROWS = new Set(["text"]);

/**
 * A heading printed inside a lesson: the name of the question the lesson turns
 * to next. Read out as a sentence, it would sound like the text. Both books
 * head their pieces on two levels, as the books of the eighth course did.
 */
const HEADING_ROWS = new Set(["section", "heading"]);

/**
 * Rows that mark the text without belonging to it: a rule drawn on the page and
 * an inline gloss of a term — the course teaches its terms from its own
 * glossary, and on a reading screen a tap asks for the translation of the line
 * rather than for a dictionary entry. Skipped with a count, so bringing either
 * back is one line.
 */
const SKIPPED_ROWS = new Set(["divider", "term"]);

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part9:import -- <glossary.json> <text.json>");
  process.exit(1);
}

await importTextCourse(
  {
    prefix: "part9",
    directory: fileURLToPath(new URL("../content/part9/", import.meta.url)),
    title: "девятая часть",
    // The text export carries the book's full printed title — «„Кафв аль-асар“ —
    // комментарий к „аль-Мухтасар…“», set in capitals for the other one — while
    // the glossary keeps the short name the list needs, as the name of its own
    // file minus the suffix.
    bookName: (text, glossary) =>
      (glossary.title_ru ?? "").replace(/\s*—\s*накопительный словарь\s*$/u, "") ||
      text.titleRu ||
      "",
    // Both books walk the same ground in the same order — what the words of
    // the Qur'an indicate, command and prohibition, the sunna, ijmā‘, qiyās —
    // and each part is one unbroken run of lessons, so each heads its piece of
    // the list. A second level neither of them has.
    divide: (entry) => ({ section: nfc(entry.section_ru ?? "").trim() }),
    pairRows: PAIR_ROWS,
    headingRows: HEADING_ROWS,
    skippedRows: SKIPPED_ROWS,
    fixes: { TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES, SKIPPED_IDS },
  },
  glossaryPath,
  textPath,
);
