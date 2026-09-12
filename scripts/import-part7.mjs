// Builds the seventh course — мантик, логика — from the two exports the
// translator produces: a cumulative glossary of the words each lesson
// introduces, and the lesson's text as Frank-method pairs.
//
//   npm run part7:import -- <glossary.json> <text.json>
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

/**
 * A heading printed inside a lesson: the name of the question the lesson turns
 * to next. Read out as a sentence, it would sound like the text.
 */
const HEADING_ROWS = new Set(["heading"]);

/**
 * Rows that mark the text without belonging to it: a rule drawn on the page,
 * the translator's remark about the printed original (Russian only), and an
 * inline gloss of a term — the course teaches its terms from its own glossary,
 * and on a reading screen a tap asks for the translation of the line rather
 * than for a dictionary entry. All three are skipped with a count.
 */
const SKIPPED_ROWS = new Set(["term", "note", "divider"]);

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part7:import -- <glossary.json> <text.json>");
  process.exit(1);
}

await importTextCourse(
  {
    prefix: "part7",
    directory: fileURLToPath(new URL("../content/part7/", import.meta.url)),
    title: "седьмая часть",
    bookName: (text, glossary) => text.title_ru ?? glossary.title_ru ?? "",
    titleOf: (named) => ({ ru: named.ru, ar: named.ar }),
    // The book divides itself into four parts — the introduction, then
    // concepts, propositions and the syllogism — and each is one unbroken run
    // of lessons, so each heads its piece of the list. A second level it does
    // not have.
    divide: (entry) => ({ section: nfc(entry.section_ru ?? "").trim() }),
    headingRows: HEADING_ROWS,
    skippedRows: SKIPPED_ROWS,
    fixes: { TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES },
  },
  glossaryPath,
  textPath,
);
