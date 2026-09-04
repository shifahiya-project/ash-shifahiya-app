// Builds the second course from the two exports the translator produces:
// a cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method sentence pairs.
//
//   npm run part2:import -- <glossary.json> <text.json>
//
// Through npm, because reading the lessons already on disk means importing
// .ts files: type stripping is only on by default from Node 22.18, and this
// project supports 22.13 upward. The npm script carries the flag that the rest
// of the project's tooling already runs with.
//
// One book at a time. The second course runs through six of them, each export
// numbering its lessons from one, so an import reads the books already on disk
// and continues the numbering after them: the second book's lesson one becomes
// lesson fifteen of the course. Importing a book that is already loaded
// replaces it in place, keeping its numbers.
//
// The glossary is already cumulative against the first course, so every entry
// here is a word the learner has not met. Each entry carries the sentence it
// appears in, and this script locates the word inside that sentence: the
// exercise puts its blank exactly there.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const UNITS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** The variable of a lesson file is its number in words, as in the first course. */
function numberName(n) {
  if (n < 20) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + UNITS[n % 10];
  return `OneHundred${n > 100 ? numberName(n - 100) : ""}`;
}

/**
 * Corrections to the exports, each one confirmed against the text itself.
 *
 * A row the OCR mangled: the story's Arabic name was lost and the printed page
 * number took its place, so the export marks the heading as an ordinary pair
 * and the story goes on without a title. The Russian name survived, and it is
 * enough to open the story; the Arabic one stays empty rather than invented.
 *
 * The other way round happens too: a line inside a text that looks like a
 * heading and was marked as one. «الشَّاعِرُ:» is not the name of a story, it is
 * the second half of "как сказал поэт:" before the verse it introduces, and as
 * a heading it would tear the text about clothing in two.
 */
const TEXT_FIXES = {
  "p2-s8-039": { type: "title", ar: "", ru: "Осёл и бык" },
  "p3-s5-015": { type: "pair" },
};

/**
 * A word whose example sentence does not contain it. جَوّ ("air") was given the
 * sentence about الْجَوَاب ("the answer") — two different words that merely look
 * alike. The replacement points at a sentence of the same lesson where the word
 * really stands, and the Arabic is cut from that sentence rather than typed
 * out, so its vowel marks are the text's own.
 */
const CONTEXT_FIXES = {
  // The entry is keyed by the sentence the export attached to it, not by the
  // word: an Arabic key typed by hand would differ from the file in its vowel
  // marks and match nothing.
  "p2-s3-037": {
    sourceId: "p2-s3-038",
    fromWord: "الذرات",
    russian: "…из частиц, витающих в воздухе, — пыли и насекомых",
  },
};

/** The glossary's own type names, kept as they come. */
const KINDS = new Set(["verb", "noun", "masdar", "participle", "adj", "adverb", "expression"]);

function skeleton(text) {
  return text.replace(/[ً-ْٰـ]/g, "").replace(/[^ء-ي]/g, "");
}

// Arabic writes several one-letter words joined to the next one, and hangs the
// pronouns on the end, so a word in running text rarely looks like its
// dictionary form. Both ends are peeled before comparing.
// The article is unmistakable, so it comes off even a two-letter word — الْجَوّ
// is جَوّ. A single letter could belong to the word itself, so it only comes off
// when three letters remain.
const ARTICLES = ["وال", "فال", "بال", "كال", "لل", "ال"];
const PREFIXES = [...ARTICLES, "و", "ف", "ب", "ك", "ل", "س", "ي", "ت", "ن", "أ", "م"];
const SUFFIXES = ["هما", "كما", "هن", "هم", "كم", "كن", "نا", "ها", "ني", "ه", "ك", "ي", "ات", "ان", "ين", "ون", "ا", "ت", "ن"];

function stems(word) {
  const bare = skeleton(word);
  const out = new Set([bare]);
  for (const prefix of PREFIXES) {
    const least = ARTICLES.includes(prefix) ? 2 : 3;
    if (bare.startsWith(prefix) && bare.length - prefix.length >= least) out.add(bare.slice(prefix.length));
  }
  for (const form of [...out]) {
    for (const suffix of SUFFIXES) {
      if (form.endsWith(suffix) && form.length - suffix.length >= 3) out.add(form.slice(0, -suffix.length));
    }
  }
  return out;
}

/** A hollow or weak root loses its ا و ي, so أَصَابَ and يُصِبْ share only صب. */
const strong = (form) => form.replace(/[اوىي]/g, "");

function dictionaryForms(entry) {
  return entry.arabic
    .replace(/[،()]/g, " ")
    .split(/\s+/)
    .filter((form) => /[ء-ي]/.test(form));
}

/**
 * The word as it will stand on the answer button: what the sentence carries
 * around it — a comma, a full stop, a bracket — belongs to the sentence and
 * stays there, in the text around the blank.
 */
const trimEdges = (token) => token.replace(/^[^ء-ي]+/, "").replace(/[^ء-يً-ْٰ]+$/, "");

/** Finds the word inside its own context sentence, or returns null. */
function locate(entry) {
  const tokens = (entry.context_ar ?? "").split(/\s+/).filter((token) => /[ء-ي]/.test(token));
  const forms = dictionaryForms(entry).map((form) => ({ stems: stems(form), strong: strong(skeleton(form)) }));

  for (const pass of ["exact", "prefix", "root"]) {
    for (const token of tokens) {
      const tokenStems = stems(token);
      for (const form of forms) {
        for (const a of tokenStems) {
          for (const b of form.stems) {
            if (pass === "exact" && a === b) return trimEdges(token);
            if (pass === "prefix" && a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
              return trimEdges(token);
            }
          }
          if (pass === "root" && form.strong.length >= 3 && strong(a) === form.strong) return trimEdges(token);
        }
      }
    }
  }
  return null;
}

const quote = (value) => JSON.stringify(value);

function renderWord(word) {
  const lines = [
    `      arabic: ${quote(word.arabic)},`,
    `      russian: ${quote(word.russian)},`,
    `      kind: ${quote(word.kind)},`,
    `      contextArabic: ${quote(word.contextArabic)},`,
    `      contextRussian: ${quote(word.contextRussian)},`,
  ];
  if (word.contextForm) lines.push(`      contextForm: ${quote(word.contextForm)},`);
  return `    {\n${lines.join("\n")}\n    },`;
}

function renderStory(story) {
  const sentences = story.sentences
    .map((line) => `        { arabic: ${quote(line.arabic)}, russian: ${quote(line.russian)} },`)
    .join("\n");
  return [
    "    {",
    `      arabicTitle: ${quote(story.arabicTitle)},`,
    `      title: ${quote(story.title)},`,
    "      sentences: [",
    sentences,
    "      ],",
    "    },",
  ].join("\n");
}

function render(lesson) {
  return `import type { Part2Lesson } from "../types";

export const part2Lesson${numberName(lesson.id)}: Part2Lesson = {
  id: ${lesson.id},
  book: ${quote(lesson.book)},
  title: ${quote(lesson.title)},
  words: [
${lesson.words.map(renderWord).join("\n")}
  ],
  stories: [
${lesson.stories.map(renderStory).join("\n")}
  ],
};
`;
}

const [glossaryPath, textPath] = process.argv.slice(2);
if (!glossaryPath || !textPath) {
  console.error("usage: npm run part2:import -- <glossary.json> <text.json>");
  process.exit(1);
}

const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
const text = JSON.parse(await readFile(textPath, "utf8"));
// The export titles the last two books by name and subtitle at once —
// «Та‘лим аль-мута‘аллим»: обучение учащегося пути приобретения знания. Over
// its lessons the list needs the name, so the quoted part is the book.
const bookName = (title) => title.match(/^\s*«([^»]+)»/)?.[1].trim() ?? title.trim();
const book = bookName(text.title ?? glossary.title);

/**
 * A story printed across a page break carries its heading again on the next
 * page, and the export repeats it. The same name twice running inside one
 * lesson is that repeat, not a second story: the sentences go on where they
 * left off. The trailing full stop the export sometimes adds is ignored.
 */
const sameStory = (a, b) => a && b && a.replace(/[.\s]+$/, "").toLowerCase() === b.replace(/[.\s]+$/, "").toLowerCase();

/** A story running through a third lesson is still «(продолжение)», not twice. */
const continued = (title) => title.replace(/\s*\(продолжение\)$/, "").replace(/[.\s]+$/, "");

/**
 * A heading is not a sentence: the full stop the export sometimes keeps is
 * dropped, and a name that came out of the text in lower case («обезьяна»)
 * is raised, since it stands as the lesson's own name on the card.
 */
function storyTitle(russian) {
  const clean = russian.trim().replace(/[.\s]+$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// The text carries its stories as title rows between the pairs, and what the
// export calls that row changed from book to book: «title» in Мабдауль кыраат,
// «text_title» in Кыраа рашида, and in the last two books the name says which
// level of the book it heads. All of them head a piece of text, so all of them
// open a story.
const TITLE_TYPES = new Set([
  "title", "text_title", "book_title", "major_title", "section_title", "chapter_title",
]);

// Rows that mark the text without being part of it: «(١) Часть 1» divides one
// story into printed parts, and a table of contents lists what comes later.
// Neither carries a sentence of its own.
const MARKUP_TYPES = new Set(["subheading", "toc_item"]);

// Markdown the export carries over from its source and that is not text: the
// quotation mark a line opens with, and the backslash that escapes a character
// with a meaning in markdown. A dash written «\-» is a dash, and read to the
// learner the backslash is a stray mark in the middle of an Arabic sentence.
const unquote = (text) =>
  (text ?? "")
    .replace(/^\s*>+\s*/, "")
    .replace(/\\([^\p{L}\p{N}\s])/gu, "$1")
    .trim();

const storiesByLesson = new Map();
const dropped = [];
let markup = 0;
let current = null;
for (const raw of text.items) {
  const item = TEXT_FIXES[raw.id] ? { ...raw, ...TEXT_FIXES[raw.id] } : raw;
  const lesson = item.lesson ?? current?.lesson;
  if (MARKUP_TYPES.has(item.type)) {
    markup += 1;
    continue;
  }
  // Every book so far named its rows differently. A name nobody taught this
  // script stops the import: passed through, an unread heading would be read
  // to the learner as a sentence of the story.
  if (item.type !== "pair" && !TITLE_TYPES.has(item.type)) {
    throw new Error(`неизвестный тип строки «${item.type}» (${item.id}) — научите импортёр, что это`);
  }
  if (TITLE_TYPES.has(item.type)) {
    // The heading printed again after a break repeats the name of what is
    // already being read. Inside one lesson that is the same story going on;
    // across the boundary it is the lesson before that was reading it, so the
    // rest of it is named as the continuation it is.
    const repeats = current && sameStory(continued(current.title), continued(item.ru));
    if (repeats && current.lesson === lesson) continue;
    current = {
      lesson,
      arabicTitle: unquote(item.ar),
      title: repeats ? `${continued(storyTitle(unquote(item.ru)))} (продолжение)` : storyTitle(unquote(item.ru)),
      sentences: [],
    };
    if (!storiesByLesson.has(lesson)) storiesByLesson.set(lesson, []);
    storiesByLesson.get(lesson).push(current);
    continue;
  }
  if (!current || current.lesson !== lesson) {
    // The book's own lesson division cuts a story in two often enough: the
    // sentences that open a lesson before any heading are the end of what the
    // lesson before was reading, and they are named after it rather than
    // «Текст 1», which tells the learner nothing.
    const carried = current?.lesson !== undefined && current.lesson !== lesson ? current : null;
    current = {
      lesson,
      arabicTitle: carried?.arabicTitle ?? "",
      title: carried ? `${continued(carried.title)} (продолжение)` : `Текст ${(storiesByLesson.get(lesson)?.length ?? 0) + 1}`,
      sentences: [],
    };
    if (!storiesByLesson.has(lesson)) storiesByLesson.set(lesson, []);
    storiesByLesson.get(lesson).push(current);
  }
  // A row without a single Arabic letter is a trace of the source's markup —
  // a page number that lost its heading, a lone full stop — not a sentence.
  const arabic = unquote(item.ar);
  if (!/[ء-ي]/.test(arabic)) {
    dropped.push({ lesson, arabic, russian: unquote(item.ru) });
    continue;
  }
  current.sentences.push({ arabic, russian: unquote(item.ru) });
}

/**
 * Replaces the example of a word the export mismatched. The Arabic is sliced
 * out of the referenced sentence, so it cannot drift from the text; a fix that
 * no longer matches stops the import instead of passing quietly.
 */
function applyContextFix(word, sentences) {
  const fix = CONTEXT_FIXES[word.source_id];
  if (!fix) return word;

  const sentence = sentences.get(fix.sourceId);
  if (!sentence) throw new Error(`context fix points at a missing sentence: ${fix.sourceId}`);

  const tokens = sentence.ar.split(/\s+/);
  const at = tokens.findIndex((token) => skeleton(token) === fix.fromWord);
  if (at < 0) throw new Error(`context fix cannot find ${fix.fromWord} in ${fix.sourceId}`);

  return {
    ...word,
    context_ar: tokens.slice(at).join(" ").trim(),
    context_ru: fix.russian,
  };
}

const byId = new Map(text.items.map((item) => [item.id, item]));

const directory = fileURLToPath(new URL("../content/part2/", import.meta.url));
await mkdir(directory, { recursive: true });

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

// A book already loaded keeps the numbers it has; a new one continues after
// the last. Numbers are what a learner's progress is stored under, so a
// re-import must not shift the books that follow: if it would, the import
// stops and says which books have to be laid down again after it.
const offset = already.length ? already[0].lesson.id - 1 : lastId;
if (already.length && already.at(-1).lesson.id !== lastId && glossary.lessons.length !== already.length) {
  const following = [...new Set(imported.filter(({ lesson }) => lesson.id > already.at(-1).lesson.id).map(({ lesson }) => lesson.book))];
  throw new Error(
    `«${book}» переимпортируется с другим числом уроков (${already.length} → ${glossary.lessons.length}), ` +
      `а после неё уже загружены: ${following.join(", ")}. Перезалейте их следом за ней.`,
  );
}

let located = 0;
let missing = 0;
const lessons = glossary.lessons.map((entry) => {
  const id = offset + entry.lesson;
  const stories = (storiesByLesson.get(entry.lesson) ?? []).filter((story) => story.sentences.length);
  const words = entry.entries.map((raw) => {
    const word = applyContextFix(raw, byId);
    const contextForm = locate(word);
    if (contextForm) located += 1;
    else missing += 1;
    return {
      arabic: word.arabic.trim(),
      russian: word.russian.trim(),
      kind: KINDS.has(word.type) ? word.type : "noun",
      contextArabic: unquote(word.context_ar),
      contextRussian: unquote(word.context_ru),
      ...(contextForm ? { contextForm } : {}),
    };
  });
  return { id, book, title: stories[0]?.title ?? `Урок ${id}`, words, stories };
});

const fileName = (id) => `lesson-${String(id).padStart(2, "0")}.ts`;

for (const lesson of lessons) {
  await writeFile(`${directory}${fileName(lesson.id)}`, render(lesson), "utf8");
}

// A book re-imported shorter than before leaves its last files behind, and the
// glob that loads lessons would go on serving them.
for (const { lesson, file } of already) {
  if (lesson.id > offset + lessons.length) await rm(`${directory}${file}`);
}

// The manifest is rebuilt over the whole course, not over this book alone.
const course = [...imported.filter(({ lesson }) => lesson.book !== book).map(({ lesson }) => lesson), ...lessons]
  .sort((a, b) => a.id - b.id);

const summaries = course
  .map((lesson) => {
    const sentences = lesson.stories.reduce((total, story) => total + story.sentences.length, 0);
    return [
      "  {",
      `    id: ${lesson.id},`,
      `    book: ${quote(lesson.book)},`,
      `    title: ${quote(lesson.title)},`,
      `    wordCount: ${lesson.words.length},`,
      `    storyCount: ${lesson.stories.length},`,
      `    sentenceCount: ${sentences},`,
      `    storyTitles: [${lesson.stories.map((story) => quote(story.title)).join(", ")}],`,
      "  },",
    ].join("\n");
  })
  .join("\n");

await writeFile(
  `${directory}manifest.ts`,
  `// Generated by scripts/import-part2.mjs — do not edit by hand.
//
// The second course's home screen needs every lesson's card but none of its
// words, so the summaries ship in the entry chunk and the lessons load on demand.
import type { Part2Summary } from "../types";

export const part2Summaries: Part2Summary[] = [
${summaries}
];
`,
  "utf8",
);

const count = (list, pick) => list.reduce((n, lesson) => n + pick(lesson), 0);
const words = (lesson) => lesson.words.length;
const sentences = (lesson) => lesson.stories.reduce((n, story) => n + story.sentences.length, 0);

console.log(
  `«${book}»: уроки ${lessons[0].id}–${lessons.at(-1).id} · ${count(lessons, words)} слов · ` +
    `${count(lessons, sentences)} фраз · слово найдено в контексте: ${located}, не найдено: ${missing}`,
);
console.log(
  `вся вторая часть: ${course.length} уроков · ${count(course, words)} слов · ${count(course, sentences)} фраз`,
);
if (markup) console.log(`строк разметки пропущено (подзаголовки частей, оглавление): ${markup}`);
if (dropped.length) {
  console.log(`отброшено строк без арабского: ${dropped.length}`);
  for (const line of dropped) console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
}
