// Imports Nasafi's tafsir without adding, removing or reordering vocalisation.
// Usage: npm run part11:import -- <glossary.json> <book-data.json>
import { fileURLToPath } from "node:url";
import { importTextCourse } from "./text-course-import.mjs";

/** Match the two exports before any generated lesson is written. */
export function prepareNasafi(glossary, text) {
  if (!Array.isArray(glossary.lessons) || !Array.isArray(text.lessons) ||
      !glossary.lessons.length || glossary.lessons.length !== text.lessons.length) {
    throw new Error("число уроков словаря и текста тафсира не совпадает");
  }
  const named = new Map(text.lessons.map((lesson) => [lesson.id, lesson]));
  if (named.size !== text.lessons.length) throw new Error("повтор номера урока тафсира");
  const blockIds = new Set();
  const wordIds = new Set();
  for (const [index, entry] of glossary.lessons.entries()) {
    const lesson = named.get(entry.number);
    if (entry.number !== index + 1 || text.lessons[index].id !== entry.number || !lesson ||
        entry.surah !== lesson.surah || entry.name !== lesson.name ||
        entry.firstAyah !== lesson.first || entry.lastAyah !== lesson.last ||
        entry.topic !== lesson.topic || entry.arabicTitle !== lesson.arabic) {
      throw new Error(`урок ${entry.number}: словарь и текст тафсира не согласованы`);
    }
    if (!Array.isArray(lesson.blocks) || !lesson.blocks.length || !Array.isArray(entry.entries)) {
      throw new Error(`урок ${entry.number}: нет текста или словаря`);
    }
    for (const block of lesson.blocks) {
      if (!block.id || blockIds.has(block.id) || !["heading", "tafsir", "verse"].includes(block.kind) ||
          typeof block.ar !== "string" || !/[ء-ي]/u.test(block.ar) ||
          typeof block.ru !== "string" || !block.ru.trim()) {
        throw new Error(`урок ${entry.number}: неполный или неизвестный блок ${block.id}`);
      }
      blockIds.add(block.id);
    }
    for (const word of entry.entries) {
      if (!word.id || wordIds.has(word.id) || word.lesson !== entry.number ||
          typeof word.arabic !== "string" || !/[ء-ي]/u.test(word.arabic) ||
          typeof word.russian !== "string" || !word.russian.trim()) {
        throw new Error(`урок ${entry.number}: неполное слово ${word.id}`);
      }
      wordIds.add(word.id);
    }
  }
  if (glossary.lessonCount !== glossary.lessons.length || glossary.entryCount !== wordIds.size) {
    throw new Error("сводные числа словаря тафсира не совпадают с данными");
  }
  return {
    glossary: {
      ...glossary,
      lessons: glossary.lessons.map((entry) => ({
        ...entry,
        title_ru: entry.topic,
        title_ar: entry.arabicTitle,
        section: `Сура ${entry.surah} · ${entry.name}`,
        chapter: `Аяты ${entry.ayahs}`,
        entries: entry.entries.map((word) => ({ ...word, type: word.kind })),
      })),
    },
    text: {
      ...text,
      lessons: text.lessons.map((lesson) => ({
        ...lesson,
        number: lesson.id,
        titleRu: lesson.topic,
        titleAr: lesson.arabic,
        blocks: lesson.blocks.map((block) => ({ ...block, type: block.kind })),
      })),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [glossaryPath, textPath] = process.argv.slice(2);
  if (!glossaryPath || !textPath) {
    console.error("usage: npm run part11:import -- <glossary.json> <book-data.json>");
    process.exit(1);
  }
  await importTextCourse({
    prefix: "part11",
    directory: fileURLToPath(new URL("../content/part11/", import.meta.url)),
    title: "одиннадцатая часть",
    bookName: (text) => text.title,
    divide: (entry) => ({ section: entry.section, chapter: entry.chapter }),
    pairRows: new Set(["tafsir"]),
    headingRows: new Set(["heading"]),
    ayahRows: new Set(["verse"]),
    skippedRows: new Set(),
    preserveArabic: true,
    prepare: prepareNasafi,
  }, glossaryPath, textPath);
}
