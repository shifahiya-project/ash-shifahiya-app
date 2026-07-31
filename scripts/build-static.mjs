// Builds a static copy of the site into .static-site/ for hosting that serves
// plain files (GitHub Pages and the like). Run with: npm run build:static
//
// The app renders entirely in the browser and keeps progress in localStorage,
// so a snapshot of the home page plus the client assets is the whole site. The
// build must be produced with STATIC_BASE=./ so that asset URLs are relative
// and the site works from a subdirectory.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

// Files the Worker build leaves in dist/client that a plain file host neither
// reads nor should serve.
const WORKER_ONLY = [".assetsignore", "_headers", ".vite"];

const root = new URL("../", import.meta.url);
const output = new URL(".static-site/", root);

const { default: worker } = await import(new URL("dist/server/index.js", root).href);

const response = await worker.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`The page rendered with status ${response.status}`);
let html = await response.text();

// Absolute URLs would resolve against the domain root, which is wrong under a
// subdirectory. Lesson chunks already import each other by relative specifier;
// only the entry needs rewriting — in the markup and, because React rebuilds
// the head during hydration, in the escaped payload as well.
html = html.replace(/(src|href)="\/(?!\/)/g, '$1="./');
html = html.replace(/\\"\/(assets\/|favicon\.svg)/g, '\\"./$1');

const stillAbsolute = html.match(/(?:src|href)="\/(?!\/)/g);
if (stillAbsolute) throw new Error(`${stillAbsolute.length} absolute asset URLs left`);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("dist/client/", root), output, { recursive: true });
for (const name of WORKER_ONLY) await rm(new URL(name, output), { recursive: true, force: true });
await writeFile(new URL("index.html", output), html);
// The app has no routing, so any path should land on the same page.
await writeFile(new URL("404.html", output), html);
// Keeps GitHub Pages from running Jekyll, which would drop files it dislikes.
await writeFile(new URL(".nojekyll", output), "");

console.log(`.static-site готов — ${(html.length / 1024).toFixed(1)} КБ разметки`);
