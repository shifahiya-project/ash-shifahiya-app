// Builds the eighth course — hadith science — from the two exports the
// translator produces: a cumulative glossary of the words each lesson
// introduces, and the lesson's text as Frank-method pairs.
//
//   npm run part8:import -- <glossary.json> <text.json>
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
 * Rows the export typed as text although they are the بَاب's own table of
 * contents: opening a بَاب, «Аль-Мадхаль» lists the فَصْل-s it holds, then draws a
 * rule, and only then begins the first one. Every فَصْل named here the book
 * reaches again as a real heading, vowelled — two of them in this same lesson,
 * the rest in the lessons that follow — so nothing is lost by leaving the list
 * out, and reading it aloud between two sentences would be reading the contents
 * page to the learner.
 *
 * They are the only rows of either book that came without vowels at all, which
 * is what a contents line lifted from the source looks like. Named one by one,
 * and each checked against what it still says: a corrected export stops the
 * import rather than quietly losing a line. Keyed by book, because both exports
 * number their rows from `l1-b1`.
 */
const SKIPPED_IDS = {
  "Аль-Мадхаль": {
    "l2-b2": { arabic: "الفصل الأول: تقسيم الأخبار إلى متواتر ومشهور وواحد" },
    "l2-b3": { arabic: "الفصل الثاني: الخبر المتواتر" },
    "l2-b4": { arabic: "الفصل الثالث: الخبر المشهور" },
    "l2-b5": { arabic: "الفصل الرابع: خبر الواحد" },
    "l6-b3": { arabic: "الفصل الأول: العقل" },
    "l6-b4": { arabic: "الفصل الثاني: الإسلام" },
    "l6-b5": { arabic: "الفصل الثالث: الضبط" },
    "l6-b6": { arabic: "الفصل الرابع: العدالة" },
    "l10-b4": { arabic: "الفصل الأول: نصوص الإمام أبي حنيفة في تقديم الخبر" },
    "l14-b2": { arabic: "الفصل الأول: الحديث الصحيح" },
    "l14-b3": { arabic: "الفصل الثاني: الحديث الحسن" },
    "l14-b4": { arabic: "الفصل الثالث: الحديث الضعيف" },
  },
};

/** What this export calls a row of the text itself. */
const PAIR_ROWS = new Set(["text"]);

/**
 * A بَيْت of the poem the book explains. «Тавдихат» is a commentary on the
 * Tantawi poem: a line of verse, then the prose that unfolds it, all the way
 * through — and the line is not one more sentence of the prose. The export sets
 * it apart, the printed book sets it apart, and so does the reading screen.
 */
const VERSE_ROWS = new Set(["verse"]);

/**
 * A heading printed inside a lesson: the name of the question the lesson turns
 * to next. Read out as a sentence, it would sound like the text. Both books
 * head their pieces on two levels and name them as the fiqh book did —
 * `section` for the larger, `heading` for the one inside it.
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
  console.error("usage: npm run part8:import -- <glossary.json> <text.json>");
  process.exit(1);
}

await importTextCourse(
  {
    prefix: "part8",
    directory: fileURLToPath(new URL("../content/part8/", import.meta.url)),
    title: "восьмая часть",
    // The text export carries the book's full printed title; the glossary keeps
    // the short name the list needs («Тавдихат», not «Ясные разъяснения к
    // „Тантавийской поэме“»), as the name of its own file minus the suffix.
    bookName: (text, glossary) =>
      (glossary.title_ru ?? "").replace(/\s*—\s*накопительный словарь\s*$/u, "") ||
      text.titleRu ||
      "",
    // Both books divide themselves into parts — the report and its kinds, the
    // conditions of a sound hadith, the Hanafi rules — and each part is one
    // unbroken run of lessons, so each heads its piece of the list. A second
    // level neither of them has.
    divide: (entry) => ({ section: nfc(entry.section_ru ?? "").trim() }),
    pairRows: PAIR_ROWS,
    verseRows: VERSE_ROWS,
    headingRows: HEADING_ROWS,
    skippedRows: SKIPPED_ROWS,
    fixes: { TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES, SKIPPED_IDS },
  },
  glossaryPath,
  textPath,
);
