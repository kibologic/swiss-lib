import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { APIRouteScanner, createAPIScanner } from '../src/api/scanner';

// Fixture files are written under this package's OWN tests/ tree, not an OS temp
// directory -- vitest's SSR module loader (vite-node) intercepts every dynamic import()
// this scanner makes and resolves it through Vite's own module graph, which cannot find a
// path genuinely outside the project root ("Cannot find module '/tmp/...'" even though the
// file demonstrably exists -- confirmed with a raw, non-vitest `node` script). Real
// filesystem, real dynamic import, just anchored somewhere vite-node can actually resolve.
const SCRATCH_ROOT = join(__dirname, '.scan-scratch');

// scanner.ts (APIRouteScanner, the file-based API route discovery mechanism) had zero
// tests before this file -- api.test.ts only ever exercised handler.ts directly with
// manually-registered routes, never the filesystem scan that's supposed to produce them.
describe('APIRouteScanner.filePathToAPIRoute (pure, no filesystem)', () => {
  const scanner = createAPIScanner();

  it('strips the extension and leading slash stays', () => {
    expect(scanner.filePathToAPIRoute('/users.ts')).toBe('/users');
  });

  it('converts a [param] segment into a :param route param', () => {
    expect(scanner.filePathToAPIRoute('/users/[id].ts')).toBe('/users/:id');
  });

  it('converts multiple [param] segments', () => {
    expect(scanner.filePathToAPIRoute('/org/[orgId]/team/[teamId].ts')).toBe(
      '/org/:orgId/team/:teamId',
    );
  });

  it('collapses an /index file to its parent path', () => {
    expect(scanner.filePathToAPIRoute('/users/index.ts')).toBe('/users');
  });

  it('collapses a bare top-level index.ts to "/"', () => {
    expect(scanner.filePathToAPIRoute('/index.ts')).toBe('/');
  });
});

describe('APIRouteScanner.scanAPIRoutes (real filesystem, real dynamic import)', () => {
  let dir: string;

  beforeEach(async () => {
    await fs.mkdir(SCRATCH_ROOT, { recursive: true });
    dir = await fs.mkdtemp(join(SCRATCH_ROOT, 'scan-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('discovers one route per exported HTTP method in a route file', async () => {
    await fs.writeFile(
      join(dir, 'users.mjs'),
      `export async function GET(req, res) { res.json({ ok: true }); }
       export async function POST(req, res) { res.json({ ok: true }); }`,
    );

    const routes = await new APIRouteScanner().scanAPIRoutes(dir);

    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.method).sort()).toEqual(['GET', 'POST']);
    expect(routes.every((r) => r.path === '/users')).toBe(true);
  });

  it('converts a [param] filename into a route param for a real scanned file', async () => {
    await fs.mkdir(join(dir, 'users'));
    await fs.writeFile(
      join(dir, 'users', '[id].mjs'),
      `export async function GET(req, res) { res.json({ id: req.params.id }); }`,
    );

    const routes = await new APIRouteScanner().scanAPIRoutes(dir);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/users/:id');
    expect(routes[0].method).toBe('GET');
  });

  it('attaches a file-level middleware export to every method in that file', async () => {
    await fs.writeFile(
      join(dir, 'protected.mjs'),
      `export const middleware = [async (req, res, next) => next()];
       export async function GET(req, res) { res.json({}); }`,
    );

    const routes = await new APIRouteScanner().scanAPIRoutes(dir);

    expect(routes).toHaveLength(1);
    expect(routes[0].middleware).toHaveLength(1);
  });

  it('returns an empty array, not a throw, for a directory that does not exist', async () => {
    const routes = await new APIRouteScanner().scanAPIRoutes(join(dir, 'does-not-exist'));
    expect(routes).toEqual([]);
  });

  it('skips a file that fails to import rather than aborting the whole scan', async () => {
    await fs.writeFile(join(dir, 'broken.mjs'), `this is not valid javascript {{{`);
    await fs.writeFile(
      join(dir, 'ok.mjs'),
      `export async function GET(req, res) { res.json({}); }`,
    );

    const routes = await new APIRouteScanner().scanAPIRoutes(dir);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/ok');
  });

  it('ignores non-HTTP-method exports (e.g. a helper function) as routes', async () => {
    await fs.writeFile(
      join(dir, 'utils.mjs'),
      `export function helper() { return 42; }
       export async function GET(req, res) { res.json({}); }`,
    );

    const routes = await new APIRouteScanner().scanAPIRoutes(dir);

    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
  });
});
