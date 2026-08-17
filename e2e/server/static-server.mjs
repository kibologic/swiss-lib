/*
 * CROSS-001-B: minimal static + SSR server for the Playwright conformance harness.
 *
 * There is no reusable "serve a build" utility in this monorepo (checked: cli/src/server/
 * unified-server.ts is CLI-scoped Express machinery; runtime/src/runtime/dev-server.ts
 * delegates to the external @swissjs/swite package, which this repo cannot resolve
 * standalone). So this is a deliberately small, dependency-free Node http server:
 *
 *  - GET /fixtures/<name>.html   -> runs the matching fixture's server-side render
 *                                   (renderToString, real @swissjs/core) and returns a
 *                                   full HTML document with a native <script type="module">
 *                                   import map pointing at the built runtime/dist so the
 *                                   SAME browser-native ESM loading path the shipped
 *                                   product uses (see CLAUDE.md's import-map workaround)
 *                                   is what Playwright actually exercises.
 *  - GET /dist/<path>            -> serves runtime/dist/<path> verbatim (the client bundle).
 *  - GET /fixtures/client/<name>.js -> serves the fixture's client entry module.
 *
 * No build step, no bundler: fixtures are plain .mjs files importing @swissjs/core's
 * built dist directly, exactly as a real SwissJS app's import map does.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(E2E_ROOT, '..');
const DIST_DIR = path.join(REPO_ROOT, 'runtime', 'dist');
const FIXTURES_DIR = path.join(E2E_ROOT, 'fixtures');
// runtime/dist/index.js imports the bare specifier "reflect-metadata" (decorator
// metadata support, required in both Node and browser per index.ts's own comment).
// Real SwissJS apps resolve this the same way Alpine ERP does (see CLAUDE.md's
// import-map workaround) -- serve the package's entry file and map the bare
// specifier to it.
const REFLECT_METADATA_PATH = path.join(REPO_ROOT, 'node_modules', 'reflect-metadata', 'Reflect.js');

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath)] ?? 'application/octet-stream';
}

async function serveFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${filePath}`);
  }
}

/**
 * Build the HTML document for a fixture: SSR string (if a .ssr.mjs module exists) +
 * import map + client entry. Fixtures without a .ssr.mjs (e.g. compiled-parity, which
 * is deliberately CSR-only to isolate the compiled-artifact execution question from
 * SSR/hydration) render into an empty #app and mount fully client-side.
 */
async function renderFixturePage(fixtureName) {
  const ssrModulePath = path.join(FIXTURES_DIR, `${fixtureName}.ssr.mjs`);
  const clientModulePath = path.join(FIXTURES_DIR, `${fixtureName}.client.mjs`);
  const clientExists = await stat(clientModulePath).catch(() => null);
  if (!clientExists) return null;

  const ssrExists = await stat(ssrModulePath).catch(() => null);
  let html = '';
  if (ssrExists) {
    // pathToFileURL, not raw string interpolation: on Windows a bare "C:\..." path is
    // not a valid ESM specifier (ERR_UNSUPPORTED_ESM_URL_SCHEME).
    const moduleUrl = pathToFileURL(ssrModulePath);
    moduleUrl.searchParams.set('t', String(Date.now()));
    const mod = await import(moduleUrl.href);
    html = mod.renderMarkup();
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SwissJS conformance fixture: ${fixtureName}</title>
    <script type="importmap">
      { "imports": {
          "@swissjs/core": "/dist/index.js",
          "reflect-metadata": "/vendor/reflect-metadata.js"
      } }
    </script>
  </head>
  <body>
    <div id="app">${html}</div>
    <script type="module" src="/fixtures/client/${fixtureName}.client.mjs"></script>
  </body>
</html>`;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/dist/')) {
      await serveFile(res, path.join(DIST_DIR, pathname.slice('/dist/'.length)));
      return;
    }

    if (pathname === '/vendor/reflect-metadata.js') {
      await serveFile(res, REFLECT_METADATA_PATH);
      return;
    }

    if (pathname.startsWith('/fixtures/client/')) {
      await serveFile(res, path.join(FIXTURES_DIR, pathname.slice('/fixtures/client/'.length)));
      return;
    }

    const fixtureMatch = pathname.match(/^\/fixtures\/([\w-]+)\.html$/);
    if (fixtureMatch) {
      const html = await renderFixturePage(fixtureMatch[1]);
      if (html === null) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`No fixture named "${fixtureMatch[1]}"`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
}

// Allow running standalone: `node server/static-server.mjs [port]`
// Compares resolved file:// URLs (not raw string concatenation) so this works on
// Windows too, where process.argv[1] uses backslashes and import.meta.url does not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 4173);
  createServer().listen(port, () => {
    console.log(`[e2e static server] listening on http://localhost:${port}`);
  });
}
