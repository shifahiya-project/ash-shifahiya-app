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
 * to next. Read out as a sentence, it would sound like the text. «Аль-Мифтах»
 * calls it `heading`, «Логика Исра» numbers its levels and gives the third to
 * these — the two above it are the lesson's own title, which the screen already
 * shows.
 */
const HEADING_ROWS = new Set(["heading", "heading3"]);

/**
 * Rows that mark the text without belonging to it: a rule drawn on the page,
 * the translator's remark about the printed original (Russian only), and an
 * inline gloss of a term — the course teaches its terms from its own glossary,
 * and on a reading screen a tap asks for the translation of the line rather
 * than for a dictionary entry.
 *
 * «Логика Исра» adds the furniture of a printed page: the book's name and its
 * publisher over every lesson, and the lesson's own title in four rows —
 * Arabic and Russian, twice, as heading and subheading. The reading screen
 * already carries that title above the text. Its footnotes are references to
 * the works a rule is quoted from («Шарх ас-Сануси», с. 20); read aloud between
 * two sentences of the lesson they would be neither.
 *
 * All of them are skipped with a count, so bringing any back is one line.
 */
const SKIPPED_ROWS = new Set([
  "term", "note", "divider",
  "title", "byline", "heading1", "heading1sub", "heading2", "heading2sub",
  "footnoteBlock",
]);

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
    // «Логика Исра» names itself just «Логика» in the text export, and the
    // course's own tab is already called that. The glossary's own short name
    // tells the two logic books apart, and that is what the list needs.
    bookName: (text, glossary) =>
      text.book?.title_ru === "Логика"
        ? "Логика Исра"
        : text.title_ru ?? glossary.title_ru ?? "",
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
