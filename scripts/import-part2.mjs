// Builds the second course from the two exports the translator produces:
// a cumulative glossary of the words each lesson introduces, and the lesson's
// text as Frank-method sentence pairs.
//
//   node scripts/import-part2.mjs <glossary.json> <text.json>
//
// The glossary is already cumulative against the first course, so every entry
// here is a word the learner has not met. Each entry carries the sentence it
// appears in, and this script locates the word inside that sentence: the
// exercise puts its blank exactly there.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const NUMBERS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen", "Twenty",
];

const numberName = (n) => NUMBERS[n - 1] ?? `Number${n}`;

/** The glossary's own type names, kept as they come. */
const KINDS = new Set(["verb", "noun", "masdar", "participle", "adj", "adverb", "expression"]);

function skeleton(text) {
  return text.replace(/[ً-ْٰـ]/g, "").replace(/[^ء-ي]/g, "");
}

// Arabic writes several one-letter words joined to the next one, and hangs the
// pronouns on the end, so a word in running text rarely looks like its
// dictionary form. Both ends are peeled before comparing.
const PREFIXES = ["وال", "فال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ك", "ل", "س", "ي", "ت", "ن", "أ", "م"];
const SUFFIXES = ["هما", "كما", "هن", "هم", "كم", "كن", "نا", "ها", "ني", "ه", "ك", "ي", "ات", "ان", "ين", "ون", "ا", "ت", "ن"];

function stems(word) {
  const bare = skeleton(word);
  const out = new Set([bare]);
  for (const prefix of PREFIXES) {
    if (bare.startsWith(prefix) && bare.length - prefix.length >= 3) out.add(bare.slice(prefix.length));
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
            if (pass === "exact" && a === b) return token;
            if (pass === "prefix" && a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
              return token;
            }
          }
          if (pass === "root" && form.strong.length >= 3 && strong(a) === form.strong) return token;
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
  console.error("usage: node scripts/import-part2.mjs <glossary.json> <text.json>");
  process.exit(1);
}

const glossary = JSON.parse(await readFile(glossaryPath, "utf8"));
const text = JSON.parse(await readFile(textPath, "utf8"));
const book = text.title ?? glossary.title;

// The text carries its stories as title rows between the pairs.
const storiesByLesson = new Map();
const dropped = [];
let current = null;
for (const item of text.items) {
  const lesson = item.lesson ?? current?.lesson;
  if (item.type === "title") {
    current = { lesson, arabicTitle: item.ar.trim(), title: item.ru.trim(), sentences: [] };
    if (!storiesByLesson.has(lesson)) storiesByLesson.set(lesson, []);
    storiesByLesson.get(lesson).push(current);
    continue;
  }
  if (!current || current.lesson !== lesson) {
    current = { lesson, arabicTitle: "", title: `Текст ${(storiesByLesson.get(lesson)?.length ?? 0) + 1}`, sentences: [] };
    if (!storiesByLesson.has(lesson)) storiesByLesson.set(lesson, []);
    storiesByLesson.get(lesson).push(current);
  }
  // Строка без единой арабской буквы — след разметки исходника (номер
  // страницы, потерявший заголовок, одинокая точка), а не предложение текста.
  const arabic = item.ar.trim();
  if (!/[ء-ي]/.test(arabic)) {
    dropped.push({ lesson, arabic, russian: item.ru.trim() });
    continue;
  }
  current.sentences.push({ arabic, russian: item.ru.trim() });
}

let located = 0;
let missing = 0;
const lessons = glossary.lessons.map((entry) => {
  const id = entry.lesson;
  const stories = (storiesByLesson.get(id) ?? []).filter((story) => story.sentences.length);
  const words = entry.entries.map((word) => {
    const contextForm = locate(word);
    if (contextForm) located += 1;
    else missing += 1;
    return {
      arabic: word.arabic.trim(),
      russian: word.russian.trim(),
      kind: KINDS.has(word.type) ? word.type : "noun",
      contextArabic: (word.context_ar ?? "").trim(),
      contextRussian: (word.context_ru ?? "").trim(),
      ...(contextForm ? { contextForm } : {}),
    };
  });
  return { id, book, title: stories[0]?.title ?? `Урок ${id}`, words, stories };
});

const directory = fileURLToPath(new URL("../content/part2/", import.meta.url));
await mkdir(directory, { recursive: true });
for (const lesson of lessons) {
  await writeFile(`${directory}lesson-${String(lesson.id).padStart(2, "0")}.ts`, render(lesson), "utf8");
}

const summaries = lessons
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

const totalWords = lessons.reduce((n, lesson) => n + lesson.words.length, 0);
const totalSentences = lessons.reduce(
  (n, lesson) => n + lesson.stories.reduce((m, story) => m + story.sentences.length, 0),
  0,
);
console.log(
  `${lessons.length} уроков · ${totalWords} слов · ${totalSentences} фраз · ` +
    `слово найдено в контексте: ${located}, не найдено: ${missing}`,
);
if (dropped.length) {
  console.log(`отброшено строк без арабского: ${dropped.length}`);
  for (const line of dropped) console.log(`  урок ${line.lesson}: ${JSON.stringify(line.arabic)} — ${line.russian}`);
}
