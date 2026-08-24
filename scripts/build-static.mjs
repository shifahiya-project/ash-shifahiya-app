// Builds a static copy of the site into .static-site/ for hosting that serves
// plain files (GitHub Pages and the like). Run with: npm run build:static
//
// The app renders entirely in the browser and keeps progress in localStorage,
// so a snapshot of each page plus the client assets is the whole site. The
// build must be produced with STATIC_BASE=./ so that asset URLs are relative
// and the site works from a subdirectory.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

// Files the Worker build leaves in dist/client that a plain file host neither
// reads nor should serve.
const WORKER_ONLY = [".assetsignore", "_headers", ".vite"];

// Every page the site has. `depth` is how many directories deep the file sits,
// which decides what an absolute URL has to be rewritten to: the course sits at
// the root and reaches assets through ./, the podcast screen lives one level
// down and reaches the same assets through ../.
// `path` is asked of the Worker and `file` is where the answer is written:
// Next normalises a trailing slash with a redirect, so the page has to be
// requested without one and still saved as the directory's index.
const PAGES = [
  { path: "/", file: "index.html", depth: 0 },
  { path: "/podcasts", file: "podcasts/index.html", depth: 1 },
];

const root = new URL("../", import.meta.url);
const output = new URL(".static-site/", root);

const { default: worker } = await import(new URL("dist/server/index.js", root).href);

async function render({ path, depth }) {
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  if (!response.ok) throw new Error(`${path} rendered with status ${response.status}`);
  let html = await response.text();

  // Absolute URLs would resolve against the domain root, which is wrong under a
  // subdirectory. Lesson chunks already import each other by relative
  // specifier; only the entry needs rewriting — in the markup and, because
  // React rebuilds the head during hydration, in the escaped payload as well.
  const prefix = depth === 0 ? "./" : "../".repeat(depth);
  html = html.replace(/(src|href)="\/(?!\/)/g, `$1="${prefix}`);
  html = html.replace(/\\"\/(assets\/|favicon\.svg)/g, `\\"${prefix}$1`);

  // The STATIC_BASE=./ build already emits the asset URLs relative to the
  // document, which is only correct for a page sitting at the root. A page one
  // level down would resolve ./assets/ inside its own directory and get a 404,
  // so those need the same prefix as the absolute ones.
  if (depth > 0) {
    html = html.replace(/(src|href)="\.\/(assets\/|favicon\.svg)/g, `$1="${prefix}$2`);
    html = html.replace(/\\"\.\/(assets\/|favicon\.svg)/g, `\\"${prefix}$1`);
  }

  const stillAbsolute = html.match(/(?:src|href)="\/(?!\/)/g);
  if (stillAbsolute) throw new Error(`${path}: ${stillAbsolute.length} absolute asset URLs left`);

  // A path that still points into the page's own directory would only fail once
  // the site is deployed, where it is far more expensive to notice.
  const misrooted = depth > 0 && html.match(/(?:src|href)="\.\/assets\//g);
  if (misrooted) throw new Error(`${path}: ${misrooted.length} asset URLs left below the page`);

  return html;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("dist/client/", root), output, { recursive: true });
for (const name of WORKER_ONLY) await rm(new URL(name, output), { recursive: true, force: true });

let total = 0;
for (const page of PAGES) {
  const html = await render(page);
  const target = new URL(page.file, output);
  await mkdir(new URL(".", target), { recursive: true });
  await writeFile(target, html);
  total += html.length;

  // Unknown paths land on the course, which is the site's front door.
  if (page.path === "/") await writeFile(new URL("404.html", output), html);
}

// Keeps GitHub Pages from running Jekyll, which would drop files it dislikes.
await writeFile(new URL(".nojekyll", output), "");

console.log(`.static-site готов — ${PAGES.length} страницы, ${(total / 1024).toFixed(1)} КБ разметки`);
