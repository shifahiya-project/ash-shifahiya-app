// Turns a Frank-method parallel text (the JSON the translator exports: a flat
// list of ar/ru sentence pairs grouped by lesson) into the reading sections the
// course serves, one file per section.
//
//   node scripts/import-reading.mjs <path-to.json>
//
// The host lesson for each section is chosen here rather than by hand: the
// texts go to the lightest lessons of the stretch, so that a learner meets them
// where the lesson itself asks least of them.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { lessonSummaries } = await import("../content/manifest.ts");

/**
 * The book's name, kept here rather than read from the export: the verified
 * export calls it «Мабдауль усуль», but the book is «Мабдауль кыраат».
 */
const SOURCE_TITLE = "Мабдауль кыраат. Часть 1";

const FIRST_LESSON = 35;
const LAST_LESSON = 96;
const NUMBERS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen", "Twenty", "TwentyOne", "TwentyTwo", "TwentyThree",
  "TwentyFour", "TwentyFive",
];

/**
 * Lessons that can take a text: inside the stretch and without a grammar
 * block, which would already give the lesson a part of its own. Being split in
 * two does not disqualify a lesson — reading is a screen beside the lesson,
 * not a third part of it — and once the lessons cover the book in full, almost
 * every one of them is split, so requiring a whole lesson left nowhere to put
 * the texts. Of those, the ones with the fewest exercises, spread over the range.
 */
export function hostLessons(count) {
  const free = lessonSummaries.filter(
    (item) =>
      item.id >= FIRST_LESSON &&
      item.id <= LAST_LESSON &&
      item.grammarQuestionCount === 0,
  );
  return free
    .slice()
    .sort((a, b) => a.questionCount - b.questionCount || a.id - b.id)
    .slice(0, count)
    .map((item) => item.id)
    .sort((a, b) => a - b);
}

/**
 * Where each of the book's fifty texts begins, by the id of its first pair.
 *
 * The section is what the export groups by, but the book numbers its texts
 * across sections, two to a section. The first export marked them with title
 * rows; later ones carry the pairs alone, so the division is kept here — it is
 * the book's, not ours, and a re-import must not lose it.
 */
const TEXT_STARTS = {
  "s1-001": "Текст 1",
  "s1-013": "Текст 2",
  "s2-001": "Текст 3",
  "s2-022": "Текст 4",
  "s3-001": "Текст 5",
  "s3-018": "Текст 6",
  "s4-001": "Текст 7",
  "s4-020": "Текст 8",
  "s5-001": "Текст 9",
  "s5-025": "Текст 10",
  "s6-001": "Текст 11",
  "s6-023": "Текст 12",
  "s7-001": "Текст 13",
  "s7-019": "Текст 14",
  "s8-001": "Текст 15",
  "s8-025": "Текст 16",
  "s9-001": "Текст 17",
  "s9-021": "Текст 18",
  "s10-001": "Текст 19",
  "s10-015": "Текст 20",
  "s11-001": "Текст 21",
  "s11-015": "Текст 22",
  "s12-001": "Текст 23",
  "s12-004": "Текст 24",
  "s13-001": "Текст 25",
  "s13-010": "Текст 26",
  "s14-001": "Текст 27",
  "s14-018": "Текст 28",
  "s15-001": "Текст 29",
  "s15-010": "Текст 30",
  "s16-001": "Текст 31",
  "s16-018": "Текст 32",
  "s17-001": "Текст 33",
  "s17-015": "Текст 34",
  "s18-001": "Текст 35",
  "s18-017": "Текст 36",
  "s19-001": "Текст 37",
  "s19-026": "Текст 38",
  "s20-001": "Текст 39",
  "s20-021": "Текст 40",
  "s21-001": "Текст 41",
  "s21-017": "Текст 42",
  "s22-001": "Текст 43",
  "s22-013": "Текст 44",
  "s23-001": "Текст 45",
  "s23-015": "Текст 46",
  "s24-001": "Текст 47",
  "s24-008": "Текст 48",
  "s25-001": "Текст 49",
  "s25-016": "Текст 50",
};

function sectionsOf(payload) {
  const sections = new Map();
  for (const item of payload.items) {
    // Older exports group by "lesson" and mark texts with title rows; newer
    // ones give the pairs alone, grouped by "section".
    const key = item.section ?? item.lesson;
    const section = sections.get(key) ?? { id: key, texts: [] };
    sections.set(key, section);

    if (item.type === "title") {
      section.texts.push({ title: item.ru.trim(), sentences: [] });
      continue;
    }

    // A title row has already opened the text this pair belongs to, so the
    // table only opens one when the current text has something in it.
    const opens = TEXT_STARTS[item.id];
    if (!section.texts.length || (opens && section.texts.at(-1).sentences.length)) {
      section.texts.push({ title: opens ?? `Текст ${section.texts.length + 1}`, sentences: [] });
    }
    section.texts.at(-1).sentences.push({ arabic: item.ar.trim(), russian: item.ru.trim() });
  }
  return [...sections.values()]
    .sort((a, b) => a.id - b.id)
    .map((section, index) => ({ ...section, id: index + 1, texts: section.texts.filter((text) => text.sentences.length) }));
}

function render(section, lessonId, source) {
  const texts = section.texts
    .map((text) => {
      const sentences = text.sentences
        .map((line) => `        { arabic: ${JSON.stringify(line.arabic)}, russian: ${JSON.stringify(line.russian)} },`)
        .join("\n");
      return `    {\n      title: ${JSON.stringify(text.title)},\n      sentences: [\n${sentences}\n      ],\n    },`;
    })
    .join("\n");

  return `import type { ReadingSection } from "../types";

export const reading${NUMBERS[section.id - 1]}: ReadingSection = {
  id: ${section.id},
  lessonId: ${lessonId},
  source: ${JSON.stringify(source)},
  texts: [
${texts}
  ],
};
`;
}

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/import-reading.mjs <path-to.json>");
  process.exit(1);
}

const payload = JSON.parse(await readFile(source, "utf8"));
const sections = sectionsOf(payload);
const hosts = hostLessons(sections.length);
if (hosts.length < sections.length) {
  console.error(`only ${hosts.length} lessons are free, need ${sections.length}`);
  process.exit(1);
}

const directory = fileURLToPath(new URL("../content/reading/", import.meta.url));
await mkdir(directory, { recursive: true });

for (const [index, section] of sections.entries()) {
  const name = `section-${String(section.id).padStart(2, "0")}.ts`;
  await writeFile(directory + name, render(section, hosts[index], SOURCE_TITLE), "utf8");
}

const summaries = sections
  .map((section, index) => {
    const sentences = section.texts.reduce((total, text) => total + text.sentences.length, 0);
    return `  { id: ${section.id}, lessonId: ${hosts[index]}, textCount: ${section.texts.length}, sentenceCount: ${sentences} },`;
  })
  .join("\n");

await writeFile(
  fileURLToPath(new URL("../content/reading-manifest.ts", import.meta.url)),
  `// Generated by scripts/import-reading.mjs — do not edit by hand.
import type { ReadingSummary } from "./types";

export const READING_SOURCE = ${JSON.stringify(SOURCE_TITLE)};

/** Which lesson carries which text, and how long the text is. */
export const readingSummaries: ReadingSummary[] = [
${summaries}
];

export const readingByLesson = new Map(readingSummaries.map((item) => [item.lessonId, item]));
`,
  "utf8",
);

const total = sections.reduce((sum, section) => sum + section.texts.reduce((count, text) => count + text.sentences.length, 0), 0);
console.log(`${sections.length} sections, ${total} sentences → lessons ${hosts.join(", ")}`);
