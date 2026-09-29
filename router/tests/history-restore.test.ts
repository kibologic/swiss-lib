// ROUTER-HISTORY-RESTORE: reconcile a persisted history snapshot with the LIVE browser.
// The URL the browser is on always wins for the current entry; restored-only entries
// (not live native entries) are navigated by replaceState, never by awaiting a popstate
// that cannot arrive.
import { describe, it, expect, afterEach } from 'vitest';
import { Router, MAX_HISTORY_ENTRIES } from '../src/index';
import type { HistoryEntry, HistorySnapshot } from '../src/index';
import {
  makeFakeBrowser,
  installBrowser,
  uninstallBrowser,
  settleOrHang,
} from './fake-browser';

const C = 'C';
const routes = [
  { path: '/', component: C },
  { path: '/books', component: C },
  { path: '/books/:id', component: C },
  { path: '/registry', component: C },
];

function memoryAdapter() {
  const box: { saved: HistorySnapshot | null } = { saved: null };
  return {
    box,
    adapter: {
      save(entries: HistoryEntry[], index: number) {
        box.saved = { entries: JSON.parse(JSON.stringify(entries)), index };
      },
      load: () => box.saved,
    },
  };
}

const snap3: HistorySnapshot = {
  entries: [
    { path: '/', params: {} },
    { path: '/books/a', params: { id: 'a' } },
    { path: '/books/b', params: { id: 'b' } },
  ],
  index: 2,
};

afterEach(() => uninstallBrowser());

describe('same-tab reload (defect 2)', () => {
  it('keeps the native index markers so back/forward land on exact indices', async () => {
    const b = makeFakeBrowser('/books');
    installBrowser(b);
    const { adapter } = memoryAdapter();
    let r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    await r.push('/books/a');
    await r.push('/books/b');

    // reload: page memory gone, session history (entries + state) persists
    const nb = makeFakeBrowser('/', { entries: b.entries, index: b.index });
    installBrowser(nb);
    r = new Router({ routes, historyAdapter: adapter });
    await r.ready;

    expect(r.historyIndex).toBe(2);
    expect(r.currentPath).toBe('/books/b');
    expect((nb.history.state as Record<string, number>).__swissRouterIndex).toBe(2);

    expect(await settleOrHang(r.back().then(() => [r.currentPath, r.historyIndex]))).toEqual(['/books/a', 1]);
    expect(nb.index).toBe(1);
    expect(await settleOrHang(r.forward().then(() => [r.currentPath, r.historyIndex]))).toEqual(['/books/b', 2]);
    expect(nb.index).toBe(2);
  });
});

describe('new tab / device with a foreign snapshot (defect 1)', () => {
  it('back()/forward() resolve across restored-only entries; canGo* stay truthful', async () => {
    const b = makeFakeBrowser('/books/b'); // fresh native history, no markers
    installBrowser(b);
    const { adapter } = memoryAdapter();
    adapter.save(snap3.entries, snap3.index);
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;

    expect(r.entries.map((e) => e.path)).toEqual(['/', '/books/a', '/books/b']);
    expect(r.historyIndex).toBe(2);
    expect(r.canGoBack).toBe(true);
    expect(r.canGoForward).toBe(false);

    expect(await settleOrHang(r.back().then(() => r.currentPath))).toBe('/books/a');
    expect(r.historyIndex).toBe(1);
    expect(b.win.location).toMatchObject({ pathname: '/books/a' });
    expect(r.canGoBack).toBe(true);
    expect(r.canGoForward).toBe(true);

    expect(await settleOrHang(r.back().then(() => r.currentPath))).toBe('/');
    expect(r.historyIndex).toBe(0);
    expect(r.canGoBack).toBe(false);
    expect(r.canGoForward).toBe(true);

    expect(await settleOrHang(r.forward().then(() => r.currentPath))).toBe('/books/a');
    expect(await settleOrHang(r.forward().then(() => r.currentPath))).toBe('/books/b');
    expect(r.historyIndex).toBe(2);
    expect(r.canGoForward).toBe(false);
    expect(b.win.location).toMatchObject({ pathname: '/books/b' });
  });

  it('notifies navigation listeners and state restore when landing on a restored-only entry', async () => {
    installBrowser(makeFakeBrowser('/books/b'));
    const { adapter } = memoryAdapter();
    adapter.save(
      [
        { path: '/', params: {}, state: { scroll: 7 } },
        { path: '/books/b', params: { id: 'b' } },
      ],
      1,
    );
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    const paths: string[] = [];
    const restored: unknown[] = [];
    r.onNavigate((p) => paths.push(p));
    r.onStateRestore((e) => restored.push(e.state));
    await settleOrHang(r.back());
    expect(paths).toEqual(['/']);
    expect(restored).toEqual([{ scroll: 7 }]);
  });

  it('pushing after going back across restored-only entries still works and truncates forward', async () => {
    installBrowser(makeFakeBrowser('/books/b'));
    const { adapter } = memoryAdapter();
    adapter.save(snap3.entries, snap3.index);
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    await settleOrHang(r.back());
    await r.push('/registry');
    expect(r.entries.map((e) => e.path)).toEqual(['/', '/books/a', '/registry']);
    expect(r.canGoForward).toBe(false);
    expect(await settleOrHang(r.back().then(() => r.currentPath))).toBe('/books/a');
    expect(await settleOrHang(r.forward().then(() => r.currentPath))).toBe('/registry');
  });
});

describe('the browser URL wins for the current entry (defect 3)', () => {
  it('deep link at /registry with a /books/b snapshot renders /registry and keeps history behind it', async () => {
    const b = makeFakeBrowser('/registry');
    installBrowser(b);
    const { adapter } = memoryAdapter();
    adapter.save(
      [
        { path: '/', params: {} },
        { path: '/books/b', params: { id: 'b' } },
      ],
      1,
    );
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    expect(r.currentPath).toBe('/registry');
    expect(r.entries.map((e) => e.path)).toEqual(['/', '/books/b', '/registry']);
    expect(r.historyIndex).toBe(2);
    expect(r.canGoBack).toBe(true);
    expect(await settleOrHang(r.back().then(() => r.currentPath))).toBe('/books/b');
  });

  it('a snapshot whose current entry equals the location is adopted as-is', async () => {
    installBrowser(makeFakeBrowser('/books/b'));
    const { adapter } = memoryAdapter();
    adapter.save(snap3.entries, snap3.index);
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    expect(r.entries).toHaveLength(3);
    expect(r.historyIndex).toBe(2);
  });
});

describe('query strings are preserved everywhere (defect 4)', () => {
  it('through push, popstate back/forward, and persistence', async () => {
    const b = makeFakeBrowser('/');
    installBrowser(b);
    const { adapter, box } = memoryAdapter();
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    await r.push('/books/a?tab=notes');
    await r.push('/registry');
    expect(box.saved?.entries.map((e) => e.path)).toEqual(['/', '/books/a?tab=notes', '/registry']);
    expect(r.entries[1].params).toEqual({ id: 'a' });

    await r.back();
    expect(r.currentPath).toBe('/books/a?tab=notes');
    expect(r.entries.map((e) => e.path)).toEqual(['/', '/books/a?tab=notes', '/registry']);
    await r.forward();
    expect(r.currentPath).toBe('/registry');
    expect(box.saved?.entries[1].path).toBe('/books/a?tab=notes');
  });

  it('replace() keeps the query, and a native popstate does not drop it', async () => {
    const b = makeFakeBrowser('/');
    installBrowser(b);
    const r = new Router({ routes });
    await r.push('/books/a?x=1');
    await r.replace('/books/a?x=2');
    expect(r.currentPath).toBe('/books/a?x=2');
    await r.push('/registry');
    (b.history.go as (d: number) => void)(-1);
    await new Promise((res) => setTimeout(res, 20));
    expect(r.currentPath).toBe('/books/a?x=2');
    expect(r.entries[1].path).toBe('/books/a?x=2');
  });

  it('a reload on a URL with a query adopts the snapshot at the same index', async () => {
    const b = makeFakeBrowser('/');
    installBrowser(b);
    const { adapter } = memoryAdapter();
    let r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    await r.push('/books/a?tab=notes');
    const nb = makeFakeBrowser('/', { entries: b.entries, index: b.index });
    installBrowser(nb);
    r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    expect(r.historyIndex).toBe(1);
    expect(r.currentPath).toBe('/books/a?tab=notes');
    expect(r.canGoBack).toBe(true);
  });
});

describe('persisted snapshots are bounded', () => {
  it('caps the stack at MAX_HISTORY_ENTRIES on push, keeping the newest and a valid index', async () => {
    installBrowser(makeFakeBrowser('/'));
    const { adapter, box } = memoryAdapter();
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 25; i++) await r.push(`/books/${i}`);
    expect(box.saved?.entries.length).toBe(MAX_HISTORY_ENTRIES);
    expect(box.saved?.index).toBe(MAX_HISTORY_ENTRIES - 1);
    expect(r.currentPath).toBe(`/books/${MAX_HISTORY_ENTRIES + 24}`);
    expect(await settleOrHang(r.back().then(() => r.currentPath))).toBe(
      `/books/${MAX_HISTORY_ENTRIES + 23}`,
    );
  });

  it('trims an oversized snapshot on restore', async () => {
    installBrowser(makeFakeBrowser('/books/149'));
    const { adapter } = memoryAdapter();
    const entries = Array.from({ length: MAX_HISTORY_ENTRIES + 50 }, (_, i) => ({
      path: `/books/${i}`,
      params: { id: String(i) },
    }));
    adapter.save(entries, 149);
    const r = new Router({ routes, historyAdapter: adapter });
    await r.ready;
    expect(r.entries.length).toBeLessThanOrEqual(MAX_HISTORY_ENTRIES);
    expect(r.currentPath).toBe('/books/149');
    expect(r.entries[r.historyIndex].path).toBe('/books/149');
  });
});
