// Builds the fourth course from the two exports the translator produces: a
// cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method pairs. The same pair of files the third course takes,
// and the same three passes of a lesson, so this importer is the third one's
// twin — what differs is written down where it happens.
//
//   npm run part4:import -- <glossary.json> <text.json>
//
// Through npm, because reading the lessons already on disk means importing
// .ts files: type stripping is only on by default from Node 22.18, and this
// project supports 22.13 upward. The npm script carries the flag that the rest
// of the project's tooling already runs with.
//
// One book at a time. An import reads the books already on disk and continues
// the numbering after them; a book already loaded is re-imported onto its own
// numbers, because a learner's progress is stored under them.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const UNITS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** The variable of a lesson file is its number in words, as in the other courses. */
function numberName(n) {
  if (n < 20) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + UNITS[n % 10];
  return `OneHundred${n > 100 ? numberName(n - 100) : ""}`;
}

/**
 * A lesson the two exports name differently. There are none in this book — both
 * files came out of the same edition — and the table stays because a later
 * re-export is where they appear: the check below passes only when both sides
 * read exactly as written here, and any other divergence stops the import.
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

/** The glossary's own type names, kept as they come — as in the third course. */
const KINDS = new Set([
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
]);

/**
 * The kinds of row the text export uses. A `pair` is a piece of the book with
 * its translation; a `section` is a heading the book prints inside a lesson,
 * and it is kept as a heading rather than read out as a sentence of the
 * argument. A kind nobody taught this script stops the import: slipping
 * through unnoticed, it would be read to the learner as text of the book.
 */
const ROWS = new Set(["pair", "section"]);

/**
 * Fatha before shadda, not after. The two orders look identical on screen and
 * are different sequences of code points, so an exact comparison — a lookup, a
 * deduplication, a regex typed from one file and run against another — can
 * quietly disagree with itself. NFC is that canonical order: shadda's combining
 * class is 33 and a vowel's is 30, so normalising sorts the vowel first.
 */
const nfc = (text) => (text ?? "").normalize("NFC");

/** Markdown quotation the export sometimes carries over from its source. */
const unquote = (text) => nfc(text ?? "").replace(/^\s*>+\s*/, "").trim();

const quote = (value) => JSON.stringify(value);

function renderWord(word) {
  return `    { arabic: ${quote(word.arabic)}, russian: ${quote(word.russian)}, kind: ${quote(word.kind)} },`;
}

function renderFragment(fragment) {
  const heading = fragment.heading ? ", heading: true" : "";
  return `    { arabic: ${quote(fragment.arabic)}, russian: ${quote(fragment.russian)}${heading} },`;
}

function render(lesson) {
  const words = lesson.words.length
    ? `[\n${lesson.words.map(renderWord).join("\n")}\n  ]`
    : "[]";
  return `import type { TextCourseLesson } from "../types";

export const part4Lesson${numberName(lesson.id)}: TextCourseLesson = {
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

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part4:import -- <glossary.json> <text.json>");
  process.exit(1);
}

const directory = fileURLToPath(new URL("../content/part4/", import.meta.url));
await mkdir(directory, { recursive: true });

const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
const text = JSON.parse(await readFile(textPath, "utf8"));

const book = nfc(text.title_ru ?? glossary.title_ru ?? "").trim();
const author = nfc(text.author_ru ?? glossary.author_ru ?? "").trim();
if (!book) throw new Error("в выгрузке нет названия книги (title_ru)");

const fragmentsByLesson = new Map();
const dropped = [];
let patched = 0;
let headings = 0;
for (const item of text.items) {
  if (!ROWS.has(item.type)) {
    throw new Error(`неизвестный тип строки «${item.type}» (${item.id}) — научите импортёр, что это`);
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
  if (item.type === "section") {
    fragment.heading = true;
    headings += 1;
  }
  fragmentsByLesson.get(item.lesson).push(fragment);
}

// Both exports number the same lessons and name them the same way. A glossary
// lesson whose title has drifted from the text's is a sign the two files are
// not from the same edition, and the course would then teach words for a lesson
// the learner is not reading.
const titles = new Map(text.lessons.map((lesson) => [lesson.number, lesson]));

let retitled = 0;
let mended = 0;

const lessons = glossary.lessons.map((entry) => {
  const named = titles.get(entry.number);
  if (!named) throw new Error(`урок ${entry.number} есть в словаре, но не в тексте`);

  const fromGlossary = entry.title_ru.trim();
  const fromText = named.ru.trim();
  const fix = TITLE_FIXES[book]?.[entry.number];
  let title = fromText;
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

  // The export carries the book's two levels in one field, joined by a middot:
  // «Книга очищения · Глава о хадасе». They are told apart here because they
  // behave differently — a كِتَاب is one unbroken run of lessons and heads it in
  // the list, while a بَاب turns over every second lesson and can come round
  // again later, so it is named on the lesson's own card.
  const [section, chapter] = nfc(entry.chapter ?? named.chapter ?? "")
    .split("·")
    .map((part) => part.trim());

  return {
    id: entry.number,
    book,
    section: section || undefined,
    chapter: chapter || undefined,
    arabicTitle: nfc(entry.title_ar ?? named.ar ?? "").trim(),
    title: nfc(title),
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
async function loadImported() {
  const files = (await readdir(directory)).filter((file) => /^lesson-\d+\.ts$/.test(file));
  const loaded = await Promise.all(
    files.map(async (file) => {
      const loaded = await import(pathToFileURL(`${directory}${file}`).href);
      return { file, lesson: Object.values(loaded)[0] };
    }),
  );
  return loaded.sort((a, b) => a.lesson.id - b.lesson.id);
}

const imported = await loadImported();
const already = imported.filter(({ lesson }) => lesson.book === book);
const lastId = imported.length ? imported.at(-1).lesson.id : 0;

// A book already loaded keeps the numbers it has; a new one continues after the
// last. Numbers are what a learner's progress is stored under, so a re-import
// must not shift the books that follow: if it would, the import stops and says
// which ones have to be laid down again after it.
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
  await writeFile(`${directory}${fileName(lesson.id)}`, render(lesson), "utf8");
}

// A book re-imported shorter than before leaves its last files behind, and the
// glob that loads lessons would go on serving them.
for (const { lesson, file } of already) {
  if (lesson.id > offset + lessons.length) await rm(`${directory}${file}`);
}

// The manifest is rebuilt over the whole course, not over this book alone.
const course = [
  ...imported.filter(({ lesson }) => lesson.book !== book).map(({ lesson }) => lesson),
  ...lessons,
].sort((a, b) => a.id - b.id);

const summaries = course
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

await writeFile(
  `${directory}manifest.ts`,
  `// Generated by scripts/import-part4.mjs — do not edit by hand.
//
// The fourth course's home screen needs every lesson's card but none of its
// words, so the summaries ship in the entry chunk and the lessons load on demand.
import type { TextCourseSummary } from "../types";

export const part4Summaries: TextCourseSummary[] = [
${summaries}
];
`,
  "utf8",
);

// Every word of the course in lesson order, loaded on demand beside a lesson.
// Twenty-five lessons of this book bring one or two words — not enough to fill
// three options out of the lesson alone — so a question there borrows its wrong
// answers from the words already met, and this is where they come from.
const glossaryLines = course
  .flatMap((lesson) =>
    lesson.words.map(
      (word) =>
        `  { lesson: ${lesson.id}, arabic: ${quote(word.arabic)}, ` +
        `russian: ${quote(word.russian)}, kind: ${quote(word.kind)} },`,
    ),
  )
  .join("\n");

await writeFile(
  `${directory}glossary.ts`,
  `// Generated by scripts/import-part4.mjs — do not edit by hand.
//
// The whole course's words in lesson order, so a lesson too short to fill three
// options can borrow the ones already met. It loads as its own chunk beside the
// lesson, not with the home screen.
import type { TextCourseWord } from "../types";

export type Part4GlossaryEntry = TextCourseWord & { lesson: number };

export const part4Glossary: Part4GlossaryEntry[] = [
${glossaryLines}
];
`,
  "utf8",
);

const count = (list, pick) => list.reduce((total, lesson) => total + pick(lesson), 0);
const words = (lesson) => lesson.words.length;
const fragments = (lesson) => lesson.fragments.length;
console.log(
  `«${book}» (${author}): уроки ${lessons[0].id}–${lessons.at(-1).id} · ` +
    `${count(lessons, words)} слов · ${count(lessons, fragments)} фрагментов текста`,
);
console.log(
  `вся четвёртая часть: ${course.length} уроков · ${count(course, words)} слов · ` +
    `${count(course, fragments)} фрагментов`,
);
const wordless = course.filter((lesson) => !lesson.words.length).map((lesson) => lesson.id);
if (wordless.length) console.log(`уроков без новых слов (только чтение): ${wordless.join(", ")}`);
if (headings) console.log(`заголовков внутри уроков: ${headings}`);
if (patched) console.log(`правок текста применено: ${patched}`);
if (retitled) console.log(`уроков переименовано по сверенному тексту: ${retitled}`);
if (mended) console.log(`правок словаря применено: ${mended}`);
if (dropped.length) {
  console.log(`отброшено строк без арабского: ${dropped.length}`);
  for (const line of dropped) console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
}
