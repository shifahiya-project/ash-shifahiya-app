// Builds the third course from the two exports the translator produces:
// a cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method pairs.
//
//   npm run part3:import -- <glossary.json> <text.json>
//
// Through npm, because reading the lessons already on disk means importing
// .ts files: type stripping is only on by default from Node 22.18, and this
// project supports 22.13 upward. The npm script carries the flag that the rest
// of the project's tooling already runs with.
//
// One book at a time, like the second course. An import reads the books already
// on disk and continues the numbering after them, so the second book's lesson
// one becomes lesson twenty-one of the course. A book already loaded is
// re-imported onto its own numbers: a learner's progress is stored under them,
// so they must not shift.
//
// The glossary carries no example sentences of its own («Контекстные примеры не
// приводятся»), and this script does not invent any: a word of the third course
// is taught by its dictionary form and its meaning, and met again whole in the
// lesson's text. That is why nothing here looks for the word inside a sentence,
// as the second course's importer does.
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
 * The corrected edition of the text renamed four lessons after they were
 * checked against what the lesson actually says, and the glossary — which was
 * not exported again — still carries the old names. A retitling is not a
 * different edition, so each one is recorded here, verified against the text:
 * the check passes only when both sides read exactly as written below, and any
 * other divergence still stops the import.
 */
const TITLE_FIXES = {
  // Keyed by book as well as by number: every book numbers its lessons from
  // one, so a bare number would carry a fix from one book into another.
  "Основы исламского вероубеждения": {
    4: { glossary: "Сальбийские (отрицающие) атрибуты", text: "Отрицающие атрибуты (ас-сифат ас-сальбийя)" },
    8: { glossary: "Тексты, создающие впечатление уподобления", text: "Тексты, внушающие мысль об уподоблении" },
    11: { glossary: "Миссия пророков и посланников и их качества", text: "Направление пророков и посланников и их качества" },
    20: { glossary: "Критерии такфира", text: "Правила такфира" },
  },
};

/**
 * Two places the corrected edition's own sweep ran over. Unifying حُدُوث on
 * «возникновение во времени» was right, but it also caught خَلْق in the fifth
 * section's heading — where the Arabic reads مَسْأَلَةُ خَلْقِ الْقُرْآنِ, «the question
 * of the Qur'an being created», which is the very distinction the same sweep
 * was drawing, and which the lesson's own title still states correctly — and it
 * left a participle stranded in the instrumental after the verb it agreed with
 * was cut. Both are quoted here exactly, so a re-export that fixes or changes
 * them stops the import rather than passing quietly.
 */
const TEXT_FIXES = {
  "hab-0218": [
    { from: "вопрос о возникновения во времени Корана", to: "вопрос о сотворённости Корана" },
  ],
  "hab-0219": [
    {
      from: "они — возникающие акциденции, следующими одна за другой",
      to: "они — возникающие акциденции, следующие одна за другой",
    },
  ],
};

/**
 * A word of the glossary the corrected text has since outrun. The edition
 * settled the transliteration — ‘ for ayn, ’ for hamza — and the glossary was
 * left with one straight apostrophe, which would show the learner two spellings
 * of the same sound in one lesson. Keyed by the entry's id, and checked: a fix
 * that no longer matches stops the import instead of passing quietly.
 */
const GLOSSARY_FIXES = {
  "hab-vocab-0543": {
    russian: {
      from: "таби'ины; поколение мусульман, встретившее сподвижников",
      to: "таби‘ины; поколение мусульман, встретившее сподвижников",
    },
  },
};

/**
 * The glossary's own type names, kept as they come — as in the second course.
 * This book is a scholarly text, so its list is a different one: «term» is by
 * far the largest group, and proper names and particles appear where stories
 * had participles and adverbs.
 */
const KINDS = new Set([
  "verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle",
]);

/**
 * Fatha before shadda, not after. The two orders look identical on screen and
 * are different sequences of code points, so an exact comparison — a lookup, a
 * deduplication, a regex typed from one file and run against another — can
 * quietly disagree with itself. NFC is that canonical order: shadda's combining
 * class is 33 and a vowel's is 30, so normalising sorts the vowel first.
 * Verified on this data that it reorders diacritics and changes nothing else.
 */
const nfc = (text) => (text ?? "").normalize("NFC");

/** Markdown quotation the export sometimes carries over from its source. */
const unquote = (text) => nfc(text ?? "").replace(/^\s*>+\s*/, "").trim();

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
  book: ${quote(lesson.book)},${lesson.section ? `\n  section: ${quote(lesson.section)},` : ""}
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
  console.error("usage: npm run part3:import -- <glossary.json> <text.json>");
  process.exit(1);
}

const directory = fileURLToPath(new URL("../content/part3/", import.meta.url));
await mkdir(directory, { recursive: true });

const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
const text = JSON.parse(await readFile(textPath, "utf8"));

const book = nfc(text.title_ru ?? glossary.title_ru ?? "").trim();
const author = nfc(text.author_ru ?? glossary.author ?? "").trim();
if (!book) throw new Error("в выгрузке нет названия книги (title_ru)");

// The text is one continuous treatise: its rows are pairs and nothing else.
// A row of a kind nobody taught this script stops the import rather than
// slipping through — read to the learner, an unrecognised heading would sound
// like a sentence of the book.
const fragmentsByLesson = new Map();
const dropped = [];
let patched = 0;
for (const item of text.items) {
  if (item.type !== "pair") {
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
  fragmentsByLesson.get(item.lesson).push({ arabic, russian });
}

// Both exports number the same twenty lessons and name them the same way. A
// glossary lesson whose title has drifted from the text's is a sign the two
// files are not from the same edition, and the course would then teach words
// for a lesson the learner is not reading.
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
    let russian = word.russian.trim();
    if (patch?.russian) {
      if (russian !== patch.russian.from) {
        throw new Error(`правка словаря ${word.id} больше не совпадает: «${russian}»`);
      }
      russian = patch.russian.to;
      mended += 1;
    }
    return { arabic: nfc(word.arabic).trim(), russian: nfc(russian), kind: word.type };
  });

  return {
    id: entry.number,
    book,
    // The بَاب comes from the glossary on purpose. The first book's corrected
    // text calls it «Часть первая», which is right for the book's own headings
    // but not for this screen: the app already numbers its three courses
    // «Часть 1…3», and the two would read as one scale. The book's own word —
    // «Баб» — does not collide with anything. A book that runs straight through
    // has no division, and none is invented for it.
    section: nfc(entry.section ?? named.section ?? "").trim() || undefined,
    arabicTitle: nfc(entry.title_ar ?? named.ar ?? "").trim(),
    title: nfc(title),
    words,
    fragments: fragmentsByLesson.get(entry.number) ?? [],
  };
});

for (const lesson of lessons) {
  if (!lesson.words.length) throw new Error(`урок ${lesson.id} остался без слов`);
  if (!lesson.fragments.length) throw new Error(`урок ${lesson.id} остался без текста`);
}

const fileName = (id) => `lesson-${String(id).padStart(2, "0")}.ts`;

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

export const part3Summaries: Part3Summary[] = [
${summaries}
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
  `вся третья часть: ${course.length} уроков · ${count(course, words)} слов · ` +
    `${count(course, fragments)} фрагментов`,
);
if (patched) console.log(`правок текста применено: ${patched}`);
if (retitled) console.log(`уроков переименовано по сверенному тексту: ${retitled}`);
if (mended) console.log(`правок словаря применено: ${mended}`);
if (dropped.length) {
  console.log(`отброшено строк без арабского: ${dropped.length}`);
  for (const line of dropped) console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
}
