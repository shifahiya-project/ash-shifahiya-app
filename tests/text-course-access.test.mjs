import assert from "node:assert/strict";
import test from "node:test";

import { textCourseDividerKey } from "../app/text-course-access.ts";
import { part3Summaries } from "../content/part3/manifest.ts";
import { part4Summaries } from "../content/part4/manifest.ts";
import { part5Summaries } from "../content/part5/manifest.ts";
import { part6Summaries } from "../content/part6/manifest.ts";
import { part7Summaries } from "../content/part7/manifest.ts";

const courses = [
  [3, part3Summaries],
  [4, part4Summaries],
  [5, part5Summaries],
  [6, part6Summaries],
  [7, part7Summaries],
];

/** The dividers the lesson list draws, in the order it draws them. */
function dividerKeys(course, summaries) {
  const keys = [];
  summaries.forEach((item, index) => {
    const opensBook = summaries[index - 1]?.book !== item.book;
    if (opensBook) keys.push(textCourseDividerKey(course, item, "book"));
    const opensSection =
      item.section !== undefined && (opensBook || summaries[index - 1]?.section !== item.section);
    if (opensSection) keys.push(textCourseDividerKey(course, item, "section"));
  });
  return keys;
}

// Two books of one course can divide themselves into parts of the same name —
// both logic books open with «Введение и основы» — so a key made of the name
// alone would hand React two siblings claiming to be the same node.
test("no two dividers of a course share a key", () => {
  for (const [course, summaries] of courses) {
    const keys = dividerKeys(course, summaries);
    const seen = new Set();
    const repeated = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
    assert.deepEqual(repeated, [], `часть ${course}: повторяющиеся ключи разделителей`);
  }
});

test("a divider key tells the book from the section it heads", () => {
  const item = { book: "Логика Исра", section: "Введение и основы" };
  const other = { book: "Аль-Мифтах", section: "Введение и основы" };
  assert.notEqual(
    textCourseDividerKey(7, item, "section"),
    textCourseDividerKey(7, other, "section"),
  );
  assert.notEqual(
    textCourseDividerKey(7, item, "book"),
    textCourseDividerKey(7, item, "section"),
  );
  assert.notEqual(
    textCourseDividerKey(6, item, "book"),
    textCourseDividerKey(7, item, "book"),
  );
});
