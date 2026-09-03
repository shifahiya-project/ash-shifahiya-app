// Builds the third course from the two exports the translator produces:
// a cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method pairs.
//
//   node scripts/import-part3.mjs <словарь.json> <текст.json>
//
// Unlike the second course, this one is a single book: «Основы исламского
// вероубеждения» in twenty lessons. There is no numbering to continue and no
// shelf to keep in order — an import lays down the whole course at once and
// clears whatever lesson files a longer earlier import left behind.
//
// The glossary carries no example sentences of its own («Контекстные примеры не
// приводятся»), and this script does not invent any: a word of the third course
// is taught by its dictionary form and its meaning, and met again whole in the
// lesson's text. That is why nothing here looks for the word inside a sentence,
// as the second course's importer does.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
 * The glossary's own type names, kept as they come — as in the second course.
 * This book is a scholarly text, so its list is a different one: «term» is by
 * far the largest group, and proper names and particles appear where stories
 * had participles and adverbs.
 */
const KINDS = new Set([
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
]);

/** Markdown quotation the export sometimes carries over from its source. */
const unquote = (text) => (text ?? "").replace(/^\s*>+\s*/, "").trim();

const quote = (value) => JSON.stringify(value);

function renderWord(word) {
  return `    { arabic: ${quote(word.arabic)}, russian: ${quote(word.russian)}, kind: ${quote(word.kind)} },`;
}

function renderFragment(fragment) {
  return `    { arabic: ${quote(fragment.arabic)}, russian: ${quote(fragment.russian)} },`;
}

function render(lesson) {
  return `import type { Part3Lesson } from "../types";

export const part3Lesson${numberName(lesson.id)}: Part3Lesson = {
  id: ${lesson.id},
  section: ${quote(lesson.section)},
  arabicTitle: ${quote(lesson.arabicTitle)},
  title: ${quote(lesson.title)},
  words: [
${lesson.words.map(renderWord).join("\n")}
  ],
  fragments: [
${lesson.fragments.map(renderFragment).join("\n")}
  ],
};
`;
}

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: node scripts/import-part3.mjs <словарь.json> <текст.json>");
  process.exit(1);
}

const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
const text = JSON.parse(await readFile(textPath, "utf8"));

const book = (text.title_ru ?? glossary.title_ru ?? "").trim();
const author = (text.author_ru ?? glossary.author ?? "").trim();
if (!book) throw new Error("в выгрузке нет названия книги (title_ru)");

// The text is one continuous treatise: its rows are pairs and nothing else.
// A row of a kind nobody taught this script stops the import rather than
// slipping through — read to the learner, an unrecognised heading would sound
// like a sentence of the book.
const fragmentsByLesson = new Map();
const dropped = [];
for (const item of text.items) {
  if (item.type !== "pair") {
    throw new Error(`неизвестный тип строки «${item.type}» (${item.id}) — научите импортёр, что это`);
  }
  const arabic = unquote(item.ar);
  const russian = unquote(item.ru);
  // Строка без единой арабской буквы — след разметки исходника, а не текст.
  if (!/[ء-ي]/.test(arabic)) {
    dropped.push({ lesson: item.lesson, arabic, russian });
    continue;
  }
  if (!fragmentsByLesson.has(item.lesson)) fragmentsByLesson.set(item.lesson, []);
  fragmentsByLesson.get(item.lesson).push({ arabic, russian });
}

// Both exports number the same twenty lessons and name them the same way. A
// glossary lesson whose title has drifted from the text's is a sign the two
// files are not from the same edition, and the course would then teach words
// for a lesson the learner is not reading.
const titles = new Map(text.lessons.map((lesson) => [lesson.number, lesson]));

const lessons = glossary.lessons.map((entry) => {
  const named = titles.get(entry.number);
  if (!named) throw new Error(`урок ${entry.number} есть в словаре, но не в тексте`);
  if (named.ru.trim() !== entry.title_ru.trim()) {
    throw new Error(
      `урок ${entry.number} назван по-разному: «${entry.title_ru}» в словаре, «${named.ru}» в тексте`,
    );
  }

  const words = entry.entries.map((word) => {
    if (!KINDS.has(word.type)) {
      throw new Error(`урок ${entry.number}: неизвестный тип слова «${word.type}» (${word.id})`);
    }
    return { arabic: word.arabic.trim(), russian: word.russian.trim(), kind: word.type };
  });

  return {
    id: entry.number,
    section: (entry.section ?? named.section ?? "").trim(),
    arabicTitle: (entry.title_ar ?? named.ar ?? "").trim(),
    title: entry.title_ru.trim(),
    words,
    fragments: fragmentsByLesson.get(entry.number) ?? [],
  };
});

for (const lesson of lessons) {
  if (!lesson.words.length) throw new Error(`урок ${lesson.id} остался без слов`);
  if (!lesson.fragments.length) throw new Error(`урок ${lesson.id} остался без текста`);
}

const directory = fileURLToPath(new URL("../content/part3/", import.meta.url));
await mkdir(directory, { recursive: true });

const fileName = (id) => `lesson-${String(id).padStart(2, "0")}.ts`;
const wanted = new Set(lessons.map((lesson) => fileName(lesson.id)));

for (const lesson of lessons) {
  await writeFile(`${directory}${fileName(lesson.id)}`, render(lesson), "utf8");
}

// A book re-imported shorter than before leaves its last files behind, and the
// glob that loads lessons would go on serving them.
for (const file of await readdir(directory)) {
  if (/^lesson-\d+\.ts$/.test(file) && !wanted.has(file)) await rm(`${directory}${file}`);
}

const summaries = lessons
  .map((lesson) =>
    [
      "  {",
      `    id: ${lesson.id},`,
      `    section: ${quote(lesson.section)},`,
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
  `// Generated by scripts/import-part3.mjs — do not edit by hand.
//
// The third course's home screen needs every lesson's card but none of its
// words, so the summaries ship in the entry chunk and the lessons load on demand.
import type { Part3Summary } from "../types";

/** The course is one book, so its name stands over the list rather than on each card. */
export const PART3_BOOK = ${quote(book)};
export const PART3_AUTHOR = ${quote(author)};

export const part3Summaries: Part3Summary[] = [
${summaries}
];
`,
  "utf8",
);

const count = (pick) => lessons.reduce((total, lesson) => total + pick(lesson), 0);
console.log(
  `«${book}» (${author}): уроки ${lessons[0].id}–${lessons.at(-1).id} · ` +
    `${count((lesson) => lesson.words.length)} слов · ` +
    `${count((lesson) => lesson.fragments.length)} фрагментов текста`,
);
if (dropped.length) {
  console.log(`отброшено строк без арабского: ${dropped.length}`);
  for (const line of dropped) console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
}
