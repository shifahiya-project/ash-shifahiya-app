// Replace the complete fourth course from the source-linked 2026-11-17 edition.
// Both the original exports and their validated prepared JSON are accepted.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { importPart4Revision } from "./import-part4-revision.mjs";

const [glossaryPath, readingPath] = process.argv.slice(2);
if (!glossaryPath || !readingPath) {
  console.error("usage: npm run part4:import -- <glossary.json> <text.json>");
  process.exit(1);
}

let temporary;
try {
  let [glossary, reading] = await Promise.all(
    [glossaryPath, readingPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  if (glossary.revision !== "2026-11-17" || reading.revision !== "2026-11-17") {
    temporary = await mkdtemp(join(tmpdir(), "part4-revision-"));
    await promisify(execFile)("python3", [
      fileURLToPath(new URL("./prepare-part4-revision.py", import.meta.url)),
      glossaryPath, readingPath, temporary,
    ]);
    [glossary, reading] = await Promise.all(
      ["glossary.json", "reading.json"].map(async (name) =>
        JSON.parse(await readFile(join(temporary, name), "utf8"))),
    );
  }
  const directory = fileURLToPath(new URL("../content/part4/", import.meta.url));
  const reviewAddresses = JSON.parse(await readFile(join(directory, "review-addresses.json"), "utf8"));
  const { totals } = await importPart4Revision({ glossary, reading, reviewAddresses, directory });
  console.log(`Тухфат аль-фукаха: ${totals.lessons} уроков · ${totals.words} слов · ${totals.fragments} фрагментов`);
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
