// Builds a static copy of the site into .static-site/ for hosting that serves
// plain files (GitHub Pages and the like). Run with: npm run build:static
//
// The app renders entirely in the browser and keeps progress in localStorage,
// so a snapshot of each page plus the client assets is the whole site. The
// build must be produced with STATIC_BASE=./ so that asset URLs are relative
// and the site works from a subdirectory.
import { existsSync } from "node:fs";
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
  //
  // Matched by what the URL says rather than by the syntax around it: the entry
  // chunk is fetched from an inline `import("./assets/…")`, which carries
  // neither src= nor href= and is what a rewrite by attribute alone misses.
  // The lookbehind keeps ../assets/, already rewritten above, from being
  // mistaken for a ./assets/ of its own.
  if (depth > 0) {
    html = html.replace(/(?<!\.)\.\/(assets\/|favicon\.svg)/g, `${prefix}$1`);
  }

  const stillAbsolute = html.match(/(?:src|href)="\/(?!\/)/g);
  if (stillAbsolute) throw new Error(`${path}: ${stillAbsolute.length} absolute asset URLs left`);

  return html;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("dist/client/", root), output, { recursive: true });
for (const name of WORKER_ONLY) await rm(new URL(name, output), { recursive: true, force: true });

/**
 * Every asset a page names has to exist where that page will look for it.
 *
 * Checked by resolving the reference against the page's own location, exactly
 * as a browser resolves it, rather than by pattern-matching the markup: the
 * entry chunk is reached through a bare `import()` specifier, so a rewrite rule
 * that only knows about attributes can leave a page that renders and then never
 * becomes interactive — the failure this check exists to catch.
 */
async function verifyAssets(html, file) {
  const page = new URL(file, output);
  const referenced = new Set(html.match(/(?:\.\.?\/)+assets\/[\w.-]+/g) ?? []);
  if (referenced.size === 0) throw new Error(`${file} references no assets at all`);

  for (const reference of referenced) {
    const resolved = new URL(reference, page);
    if (!existsSync(resolved)) {
      throw new Error(`${file}: ${reference} resolves to ${resolved.pathname}, which does not exist`);
    }
  }
  return referenced.size;
}

let total = 0;
for (const page of PAGES) {
  const html = await render(page);
  const target = new URL(page.file, output);
  await mkdir(new URL(".", target), { recursive: true });
  await writeFile(target, html);
  await verifyAssets(html, page.file);
  total += html.length;

  // Unknown paths land on the course, which is the site's front door.
  if (page.path === "/") await writeFile(new URL("404.html", output), html);
}

// Keeps GitHub Pages from running Jekyll, which would drop files it dislikes.
await writeFile(new URL(".nojekyll", output), "");

console.log(`.static-site готов — ${PAGES.length} страницы, ${(total / 1024).toFixed(1)} КБ разметки`);
