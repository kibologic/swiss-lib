/**
 * ROUTER-BROWSER-ENTRY: the package's main entry must load in a browser. A browser
 * `import('@swissjs/router')` fails outright if anything reachable from it imports a Node
 * built-in, so this test walks the static import graph of the main entry and fails on any.
 * Server-only modules live behind the `@swissjs/router/server` subpath.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  const root = specifier.split('/')[0];
  return BUILTINS.has(specifier) || BUILTINS.has(root);
}

/** Static + dynamic import / re-export specifiers found in a source file. */
function specifiersOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

function resolveLocal(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  const ts = base.replace(/\.js$/, '.ts');
  if (existsSync(ts)) return ts;
  if (existsSync(base + '.ts')) return base + '.ts';
  throw new Error(`Cannot resolve ${spec} from ${from}`);
}

/** Every module reachable from `entry`, and the Node built-ins any of them import. */
function walk(entry: string): { modules: string[]; builtins: string[] } {
  const seen = new Set<string>();
  const builtins: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      if (isNodeBuiltin(spec)) builtins.push(`${file.slice(SRC.length + 1)} -> ${spec}`);
      else if (spec.startsWith('.')) queue.push(resolveLocal(file, spec));
    }
  }
  return { modules: [...seen], builtins };
}

describe('browser-safe main entry', () => {
  it('the walker detects Node built-ins (guards against a vacuous pass)', () => {
    const scanner = walk(resolve(SRC, 'api/scanner.ts'));
    expect(scanner.builtins.length).toBeGreaterThan(0);
  });

  it('no module reachable from the main entry imports a Node built-in', () => {
    const { modules, builtins } = walk(resolve(SRC, 'index.ts'));
    expect(modules.length).toBeGreaterThan(3);
    expect(builtins).toEqual([]);
  });

  it('main entry does not reach the server-only modules', () => {
    const { modules } = walk(resolve(SRC, 'index.ts'));
    const rel = modules.map((f) => f.slice(SRC.length + 1).split(sep).join('/'));
    expect(rel).not.toContain('api/scanner.ts');
    expect(rel).not.toContain('api/handler.ts');
    expect(rel).not.toContain('ssr/server-renderer.ts');
  });

  it('main entry still exports the client surface', async () => {
    const main = await import('../src/index.js');
    for (const name of ['Router', 'StatefulRouter', 'Outlet', 'Link', 'matchRoute', 'lazy', 'hydrate', 'getServerData']) {
      expect(main, name).toHaveProperty(name);
    }
    for (const name of ['ServerRenderer', 'createServerRenderer', 'APIRouteHandler', 'createAPIHandler', 'APIRouteScanner', 'createAPIScanner']) {
      expect(main, name).not.toHaveProperty(name);
    }
  });
});

describe('@swissjs/router/server subpath', () => {
  it('exports the scanner, API handler and server renderer', async () => {
    const server = await import('../src/server.js');
    for (const name of ['ServerRenderer', 'createServerRenderer', 'APIRouteHandler', 'createAPIHandler', 'APIRouteScanner', 'createAPIScanner']) {
      expect(server, name).toHaveProperty(name);
    }
  });
});
