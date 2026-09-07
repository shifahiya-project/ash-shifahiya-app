// Builds the fifth course — грамматика: сарф и нахв — from the two exports the
// translator produces: a cumulative glossary of the words each lesson
// introduces, and the lesson's text as Frank-method pairs.
//
//   npm run part5:import -- <glossary.json> <text.json>
//
// The machinery it shares with the fourth course lives in
// text-course-import.mjs. What stays here is this course's own shape: it runs
// two books at once, a lesson of «Тайсир ас-сарф» and a lesson of «Ан-Нахв
// аль-вадых» in turn, and its export names its rows its own way.
import { fileURLToPath } from "node:url";
import { importTextCourse, nfc } from "./text-course-import.mjs";

/** No lesson is named differently by the two exports; the table waits for one. */
const TITLE_FIXES = {};

/** A line of the text the export got wrong. None so far. */
const TEXT_FIXES = {};

/** A glossary entry the text has outrun. None so far. */
const GLOSSARY_FIXES = {};

/**
 * A heading printed inside a lesson. These books teach in named steps — «Примеры»,
 * «Разбор», «Правило», «Упражнение» — and the step's name is not a sentence of
 * the lesson: read out as one, it would sound like the text.
 */
const HEADING_ROWS = new Set(["section", "topic", "subtopic"]);

/**
 * Rows that mark the text without belonging to it: a rule drawn on the page,
 * and the translator's remark about the printed original — Russian only, and
 * about the book rather than in it. Both are skipped with a count.
 */
const SKIPPED_ROWS = new Set(["divider", "note"]);

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part5:import -- <glossary.json> <text.json>");
  process.exit(1);
}

await importTextCourse(
  {
    prefix: "part5",
    directory: fileURLToPath(new URL("../content/part5/", import.meta.url)),
    title: "пятая часть",
    // The export titles the course «Сарф и нахв: единый чередующийся курс»; the
    // list needs the name, and what follows the colon says how it is built.
    bookName: (text) => (text.title_ru ?? "").split(":")[0],
    titleOf: (named) => ({ ru: named.source_title_ru, ar: named.source_title_ar }),
    /**
     * The two books alternate lesson by lesson, so neither of them heads a run
     * of the list and neither can be a section — a divider on every card is not
     * a divider. Which book a lesson comes from is named on the card itself,
     * where it turns over as often as it likes.
     */
    divide: (entry, named, text) => {
      const books = new Map((text.source_books ?? []).map((book) => [book.key, book.title_ru]));
      return { chapter: nfc(books.get(named.book) ?? named.book_ru ?? "").trim() };
    },
    headingRows: HEADING_ROWS,
    skippedRows: SKIPPED_ROWS,
    fixes: { TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES },
  },
  glossaryPath,
  textPath,
);
