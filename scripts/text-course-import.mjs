// The machinery behind the importers of the text courses — the fourth, the
// fifth, and whatever comes after them. All of them are built the same way:
// a cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method pairs. What differs is the data and the quirks of one
// export, and that is what stays in the script of each course.
//
// One book at a time. An import reads the books already on disk and continues
// the numbering after them; a book already loaded is re-imported onto its own
// numbers, because a learner's progress is stored under them.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const UNITS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** The variable of a lesson file is its number in words, as in the other courses. */
export function numberName(n) {
  if (n < 20) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + UNITS[n % 10];
  return `OneHundred${n > 100 ? numberName(n - 100) : ""}`;
}

/** The glossary's own type names, kept as they come. */
const KINDS = new Set([
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
]);

/**
 * Fatha before shadda, not after. The two orders look identical on screen and
 * are different sequences of code points, so an exact comparison — a lookup, a
 * deduplication, a regex typed from one file and run against another — can
 * quietly disagree with itself. NFC is that canonical order: shadda's combining
 * class is 33 and a vowel's is 30, so normalising sorts the vowel first.
 */
export const nfc = (text) => (text ?? "").normalize("NFC");

/** Markdown quotation the export sometimes carries over from its source. */
const unquote = (text) => nfc(text ?? "").replace(/^\s*>+\s*/, "").trim();

const quote = (value) => JSON.stringify(value);

/**
 * Which lesson an entry of the export belongs to. Every shape so far says it
 * differently: a bare number under `lesson` or `number`, and — in the newest —
 * the whole lesson header under `lesson`, its number inside.
 */
const lessonNumberOf = (entry) =>
  (typeof entry.lesson === "object" && entry.lesson !== null ? entry.lesson.number : entry.lesson) ??
  entry.number;

/**
 * The text export has come in five shapes so far. The first laid every row of
 * the book in one `items` array, each row saying which lesson it belongs to;
 * the next nested the rows inside the lesson as `lessons[].blocks[]`; the one
 * after that keeps the lesson headers apart from the rows and lists the rows as
 * `lesson_blocks[]`; the fourth nests the header itself, as
 * `lessons[].lesson.number`; the newest is `lessons[].blocks[]` again, naming
 * its keys `titleRu`/`titleAr` and calling a row of text `text` rather than
 * `pair`. The rows themselves are the same, so they are read into one list here.
 */
function rowsOf(text) {
  if (Array.isArray(text.items)) return text.items;
  const nested = Array.isArray(text.lesson_blocks)
    ? text.lesson_blocks
    : (text.lessons ?? []).filter((lesson) => Array.isArray(lesson.blocks));
  return nested.flatMap((entry) =>
    (entry.blocks ?? []).map((block) => ({ ...block, lesson: lessonNumberOf(entry) })));
}

/**
 * The lesson headers — number, and the title in both languages. A shape that
 * nests the header hands it over as it is; the rest already are one.
 */
const headersOf = (text) =>
  (text.lessons ?? []).map((lesson) =>
    typeof lesson.lesson === "object" && lesson.lesson !== null ? lesson.lesson : lesson);

/** The lesson's printed title, under whichever pair of keys the export uses. */
const printedTitle = (named) => ({
  ru: named.ru ?? named.title_ru ?? named.titleRu ?? "",
  ar: named.ar ?? named.title_ar ?? named.titleAr ?? "",
});

function renderWord(word) {
  return `    { arabic: ${quote(word.arabic)}, russian: ${quote(word.russian)}, kind: ${quote(word.kind)} },`;
}

function renderFragment(fragment) {
  const marked = [fragment.heading && "heading: true", fragment.verse && "verse: true"]
    .filter(Boolean)
    .map((flag) => `, ${flag}`)
    .join("");
  return `    { arabic: ${quote(fragment.arabic)}, russian: ${quote(fragment.russian)}${marked} },`;
}

function render(lesson, prefix) {
  const words = lesson.words.length
    ? `[\n${lesson.words.map(renderWord).join("\n")}\n  ]`
    : "[]";
  return `import type { TextCourseLesson } from "../types";

export const ${prefix}Lesson${numberName(lesson.id)}: TextCourseLesson = {
  id: ${lesson.id},
  book: ${quote(lesson.book)},${lesson.section ? `\n  section: ${quote(lesson.section)},` : ""}${
    lesson.chapter ? `\n  chapter: ${quote(lesson.chapter)},` : ""
  }
  arabicTitle: ${quote(lesson.arabicTitle)},
  title: ${quote(lesson.title)},
  words: ${words},
  fragments: [
${lesson.fragments.map(renderFragment).join("\n")}
  ],
};
`;
}

/**
 * Imports one book of one text course.
 *
 * @param {object} course           what tells this course from the others
 * @param {string} course.prefix    `part4` — the name its files and exports carry
 * @param {string} course.directory where the lessons live
 * @param {string} course.title     «четвёртая часть», for the closing report
 * @param {(text: object, glossary: object) => string} course.bookName
 * @param {(entry: object, named: object, text: object) => {section?: string, chapter?: string}} course.divide
 * @param {((named: object) => {ru: string, ar: string})=} course.titleOf
 * @param {Set<string>=} course.pairRows     rows that are the text itself (default: `pair`)
 * @param {Set<string>=} course.verseRows    rows of verse the book comments on
 * @param {Set<string>} course.headingRows  rows that head a piece of text
 * @param {Set<string>} course.skippedRows  rows that mark the text without being it
 * @param {object} course.fixes     TITLE_FIXES, TEXT_FIXES, GLOSSARY_FIXES, SKIPPED_IDS
 * @param {string} glossaryPath
 * @param {string} textPath
 */
export async function importTextCourse(course, glossaryPath, textPath) {
  const {
    prefix, directory, title: courseTitle, bookName, divide, titleOf,
    pairRows = new Set(["pair"]), verseRows = new Set(),
    headingRows, skippedRows,
    fixes: {
      TITLE_FIXES = {}, TEXT_FIXES = {}, GLOSSARY_FIXES = {}, SKIPPED_IDS = {},
    } = {},
  } = course;

  const knownRows = new Set([...pairRows, ...verseRows, ...headingRows, ...skippedRows]);
  await mkdir(directory, { recursive: true });

  const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
  const text = JSON.parse(await readFile(textPath, "utf8"));

  const book = nfc(bookName(text, glossary)).trim();
  // Only for the closing report. The newest export writes it as a sentence
  // («Автор: муфтий …»), and a glossary that does not know the author says so
  // in words rather than leaving the field out — neither is a name.
  const author = nfc(text.author_ru ?? text.authorRu ?? glossary.author_ru ?? "")
    .replace(/^\s*Автор:\s*/u, "")
    .trim();
  if (!book) throw new Error("в выгрузке нет названия книги");

  const fragmentsByLesson = new Map();
  const dropped = [];
  const skipped = [];
  const byName = [];
  // Keyed by book: every export numbers its rows from `l1-b1`, so a bare id
  // would carry one book's skip into another — «Тавдихат» has an `l2-b2` of its
  // own, and it is a sentence of the commentary.
  const skippedHere = SKIPPED_IDS[book] ?? {};
  let patched = 0;
  let headings = 0;
  let verses = 0;
  for (const item of rowsOf(text)) {
    // A kind nobody taught this script stops the import: slipping through
    // unnoticed, it would be read to the learner as text of the book.
    if (!knownRows.has(item.type)) {
      throw new Error(`неизвестный тип строки «${item.type}» (${item.id}) — научите импортёр, что это`);
    }
    if (skippedRows.has(item.type)) {
      skipped.push(item.type);
      continue;
    }
    // A row the export typed as text although it is markup. Named one by one
    // rather than matched by shape, and checked against what it still says: a
    // corrected export stops the import instead of silently losing a line.
    const named = skippedHere[item.id];
    if (named) {
      if (nfc(item.ar ?? "").trim() !== named.arabic) {
        throw new Error(`пропуск строки ${item.id} больше не совпадает: «${nfc(item.ar ?? "").trim()}»`);
      }
      byName.push(item.id);
      continue;
    }
    const arabic = unquote(item.ar);
    let russian = unquote(item.ru);
    for (const fix of TEXT_FIXES[item.id] ?? []) {
      if (!russian.includes(fix.from)) {
        throw new Error(`правка текста ${item.id} больше не совпадает: «${fix.from}»`);
      }
      russian = russian.replace(fix.from, fix.to);
      patched += 1;
    }
    // A row without a single Arabic letter is markup from the source, not text.
    if (!/[ء-ي]/.test(arabic)) {
      dropped.push({ lesson: item.lesson, arabic, russian });
      continue;
    }
    if (!fragmentsByLesson.has(item.lesson)) fragmentsByLesson.set(item.lesson, []);
    const fragment = { arabic, russian };
    if (headingRows.has(item.type)) {
      fragment.heading = true;
      headings += 1;
    }
    if (verseRows.has(item.type)) {
      fragment.verse = true;
      verses += 1;
    }
    fragmentsByLesson.get(item.lesson).push(fragment);
  }

  // Both exports number the same lessons and name them the same way. A glossary
  // lesson whose title has drifted from the text's is a sign the two files are
  // not from the same edition, and the course would then teach words for a
  // lesson the learner is not reading.
  const titles = new Map(headersOf(text).map((lesson) => [lesson.number, lesson]));

  let retitled = 0;
  let mended = 0;

  const lessons = glossary.lessons.map((entry) => {
    const named = titles.get(entry.number);
    if (!named) throw new Error(`урок ${entry.number} есть в словаре, но не в тексте`);
    const printed = titleOf ? titleOf(named) : printedTitle(named);

    const fromGlossary = entry.title_ru.trim();
    const fromText = printed.ru.trim();
    const fix = TITLE_FIXES[book]?.[entry.number];
    let lessonTitle = fromText;
    if (fromGlossary !== fromText) {
      if (!fix || fix.glossary !== fromGlossary || fix.text !== fromText) {
        throw new Error(
          `урок ${entry.number} назван по-разному: «${fromGlossary}» в словаре, «${fromText}» в тексте`,
        );
      }
      retitled += 1;
    }

    const words = entry.entries.map((word) => {
      if (!KINDS.has(word.type)) {
        throw new Error(`урок ${entry.number}: неизвестный тип слова «${word.type}» (${word.id})`);
      }
      const patch = GLOSSARY_FIXES[word.id];
      let arabic = nfc(word.arabic).trim();
      let russian = nfc(word.russian).trim();
      for (const [field, value] of [["arabic", arabic], ["russian", russian]]) {
        const rule = patch?.[field];
        if (!rule) continue;
        if (value !== rule.from) {
          throw new Error(`правка словаря ${word.id} больше не совпадает: «${value}»`);
        }
        if (field === "arabic") arabic = rule.to;
        else russian = rule.to;
        mended += 1;
      }
      return { arabic, russian, kind: word.type };
    });

    const { section, chapter } = divide(entry, named, text);

    return {
      id: entry.number,
      book,
      section: section || undefined,
      chapter: chapter || undefined,
      arabicTitle: nfc(entry.title_ar ?? printed.ar ?? "").trim(),
      title: nfc(lessonTitle),
      words,
      fragments: fragmentsByLesson.get(entry.number) ?? [],
    };
  });

  // A lesson without new words is normal here and is read, not drilled: the
  // glossary is cumulative against every course before this one, so deep into a
  // book a lesson can meet nothing new. A lesson without text is not: it would
  // have nothing to open.
  for (const lesson of lessons) {
    if (!lesson.fragments.length) throw new Error(`урок ${lesson.id} остался без текста`);
  }

  const fileName = (id) => `lesson-${String(id).padStart(3, "0")}.ts`;

  /** The lessons of the books already imported, read back from what is on disk. */
  const files = (await readdir(directory)).filter((file) => /^lesson-\d+\.ts$/.test(file));
  const imported = (
    await Promise.all(
      files.map(async (file) => {
        const loaded = await import(pathToFileURL(`${directory}${file}`).href);
        return { file, lesson: Object.values(loaded)[0] };
      }),
    )
  ).sort((a, b) => a.lesson.id - b.lesson.id);

  const already = imported.filter(({ lesson }) => lesson.book === book);
  const lastId = imported.length ? imported.at(-1).lesson.id : 0;

  // A book already loaded keeps the numbers it has; a new one continues after
  // the last. Numbers are what a learner's progress is stored under, so a
  // re-import must not shift the books that follow: if it would, the import
  // stops and says which ones have to be laid down again after it.
  const offset = already.length ? already[0].lesson.id - 1 : lastId;
  if (already.length && already.at(-1).lesson.id !== lastId && lessons.length !== already.length) {
    const following = [
      ...new Set(
        imported
          .filter(({ lesson }) => lesson.id > already.at(-1).lesson.id)
          .map(({ lesson }) => lesson.book),
      ),
    ];
    throw new Error(
      `«${book}» переимпортируется с другим числом уроков (${already.length} → ${lessons.length}), ` +
        `а после неё уже загружены: ${following.join(", ")}. Перезалейте их следом за ней.`,
    );
  }

  for (const lesson of lessons) lesson.id += offset;

  for (const lesson of lessons) {
    await writeFile(`${directory}${fileName(lesson.id)}`, render(lesson, prefix), "utf8");
  }

  // A book re-imported shorter than before leaves its last files behind, and
  // the glob that loads lessons would go on serving them.
  for (const { lesson, file } of already) {
    if (lesson.id > offset + lessons.length) await rm(`${directory}${file}`);
  }

  // The manifest is rebuilt over the whole course, not over this book alone.
  const whole = [
    ...imported.filter(({ lesson }) => lesson.book !== book).map(({ lesson }) => lesson),
    ...lessons,
  ].sort((a, b) => a.id - b.id);

  const summaries = whole
    .map((lesson) =>
      [
        "  {",
        `    id: ${lesson.id},`,
        `    book: ${quote(lesson.book)},`,
        ...(lesson.section ? [`    section: ${quote(lesson.section)},`] : []),
        ...(lesson.chapter ? [`    chapter: ${quote(lesson.chapter)},`] : []),
        `    arabicTitle: ${quote(lesson.arabicTitle)},`,
        `    title: ${quote(lesson.title)},`,
        `    wordCount: ${lesson.words.length},`,
        `    fragmentCount: ${lesson.fragments.length},`,
        "  },",
      ].join("\n"),
    )
    .join("\n");

  const generatedBy = `scripts/import-${prefix}.mjs`;
  await writeFile(
    `${directory}manifest.ts`,
    `// Generated by ${generatedBy} — do not edit by hand.
//
// The home screen needs every lesson's card but none of its words, so the
// summaries ship in the entry chunk and the lessons load on demand.
import type { TextCourseSummary } from "../types";

export const ${prefix}Summaries: TextCourseSummary[] = [
${summaries}
];
`,
    "utf8",
  );

  // Every word of the course in lesson order, loaded on demand beside a lesson.
  // A lesson bringing one or two words cannot fill three options out of itself,
  // so a question there borrows its wrong answers from the words already met,
  // and this is where they come from.
  const glossaryLines = whole
    .flatMap((lesson) =>
      lesson.words.map(
        (word) =>
          `  { lesson: ${lesson.id}, arabic: ${quote(word.arabic)}, ` +
          `russian: ${quote(word.russian)}, kind: ${quote(word.kind)} },`,
      ),
    )
    .join("\n");

  const glossaryType = `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}GlossaryEntry`;
  await writeFile(
    `${directory}glossary.ts`,
    `// Generated by ${generatedBy} — do not edit by hand.
//
// The whole course's words in lesson order, so a lesson too short to fill three
// options can borrow the ones already met. It loads as its own chunk beside the
// lesson, not with the home screen.
import type { TextCourseWord } from "../types";

export type ${glossaryType} = TextCourseWord & { lesson: number };

export const ${prefix}Glossary: ${glossaryType}[] = [
${glossaryLines}
];
`,
    "utf8",
  );

  const count = (list, pick) => list.reduce((total, lesson) => total + pick(lesson), 0);
  const words = (lesson) => lesson.words.length;
  const fragments = (lesson) => lesson.fragments.length;
  console.log(
    `«${book}»${author ? ` (${author})` : ""}: уроки ${lessons[0].id}–${lessons.at(-1).id} · ` +
      `${count(lessons, words)} слов · ${count(lessons, fragments)} фрагментов текста`,
  );
  console.log(
    `вся ${courseTitle}: ${whole.length} уроков · ${count(whole, words)} слов · ` +
      `${count(whole, fragments)} фрагментов`,
  );
  const wordless = whole.filter((lesson) => !lesson.words.length).map((lesson) => lesson.id);
  if (wordless.length) console.log(`уроков без новых слов (только чтение): ${wordless.join(", ")}`);
  if (headings) console.log(`заголовков внутри уроков: ${headings}`);
  if (verses) console.log(`строк стиха: ${verses}`);
  if (skipped.length) {
    const counted = skipped.reduce((all, type) => ({ ...all, [type]: (all[type] ?? 0) + 1 }), {});
    const named = Object.entries(counted).map(([type, n]) => `${type} — ${n}`).join(", ");
    console.log(`пропущено строк разметки: ${skipped.length} (${named})`);
  }
  const unfound = Object.keys(skippedHere).filter((id) => !byName.includes(id));
  if (unfound.length) throw new Error(`строк из SKIPPED_IDS нет в выгрузке: ${unfound.join(", ")}`);
  if (byName.length) console.log(`пропущено строк по имени: ${byName.length}`);
  if (patched) console.log(`правок текста применено: ${patched}`);
  if (retitled) console.log(`уроков переименовано по сверенному тексту: ${retitled}`);
  if (mended) console.log(`правок словаря применено: ${mended}`);
  if (dropped.length) {
    console.log(`отброшено строк без арабского: ${dropped.length}`);
    for (const line of dropped) {
      console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
    }
  }
}
