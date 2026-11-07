// Apply the supplied review to the existing course without rebuilding its vocabulary.
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyPart3ReviewedText } from "./part3-reviewed-text.mjs";
import { renderPart3Lesson, writePart3Manifest } from "./part3-output.mjs";

const directory = fileURLToPath(new URL("../content/part3/", import.meta.url));
const files = (await readdir(directory)).filter((file) => /^lesson-\d+\.ts$/.test(file));
const lessons = await Promise.all(files.map(async (file) => {
  const loaded = await import(pathToFileURL(`${directory}${file}`).href);
  return structuredClone(Object.values(loaded)[0]);
}));
lessons.sort((a, b) => a.id - b.id);

const course = [];
for (const book of new Set(lessons.map((lesson) => lesson.book))) {
  const selected = lessons.filter((lesson) => lesson.book === book);
  const offset = selected[0].id - 1;
  for (const lesson of selected) lesson.id -= offset;
  applyPart3ReviewedText(book, selected);
  for (const lesson of selected) lesson.id += offset;
  course.push(...selected);
}
// All books have passed their guards before any file is changed.
for (const lesson of course) {
  const file = `lesson-${String(lesson.id).padStart(2, "0")}.ts`;
  await writeFile(`${directory}${file}`, renderPart3Lesson(lesson), "utf8");
}
await writePart3Manifest(directory, course);
console.log(`Reviewed main text: ${course.length} lessons, ` +
  `${course.reduce((n, lesson) => n + lesson.words.filter((word) => !word.retired).length, 0)} active words, ` +
  `${course.reduce((n, lesson) => n + lesson.fragments.length, 0)} fragments`);
