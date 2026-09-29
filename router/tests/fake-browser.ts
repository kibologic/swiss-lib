// Minimal in-memory browser session-history fake for router history-restore tests
// (ROUTER-HISTORY-RESTORE). Faithful to what matters: a real session-history list with a
// cursor, per-entry `state`, an ASYNC `history.go()` that only fires `popstate` when the
// target entry exists, and a location that carries `search`.

export interface FakeEntry {
  state: unknown;
  url: string;
}

type Listener = (e: unknown) => void;

export interface FakeBrowser {
  win: Record<string, unknown>;
  history: Record<string, unknown>;
  entries: FakeEntry[];
  readonly index: number;
  readonly url: string;
}

export function makeFakeBrowser(
  startUrl = '/',
  preset?: { entries: FakeEntry[]; index: number },
): FakeBrowser {
  const listeners = new Map<string, Set<Listener>>();
  const entries: FakeEntry[] = preset
    ? preset.entries.map((e) => ({ ...e }))
    : [{ state: null, url: startUrl }];
  let idx = preset ? preset.index : 0;

  const win: Record<string, unknown> = {
    addEventListener(t: string, f: Listener) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(f);
    },
    removeEventListener(t: string, f: Listener) {
      listeners.get(t)?.delete(f);
    },
    dispatchEvent(e: { type: string }) {
      listeners.get(e.type)?.forEach((f) => f(e));
      return true;
    },
    get location() {
      const u = new URL(entries[idx].url, 'http://x');
      return { pathname: u.pathname, search: u.search, hash: u.hash, href: u.href };
    },
  };
  const history: Record<string, unknown> = {
    get state() {
      return entries[idx].state;
    },
    get length() {
      return entries.length;
    },
    pushState(s: unknown, _t: string, url?: string) {
      entries.splice(idx + 1);
      entries.push({ state: s, url: url ?? entries[idx].url });
      idx++;
    },
    replaceState(s: unknown, _t: string, url?: string) {
      entries[idx] = { state: s, url: url ?? entries[idx].url };
    },
    go(d: number) {
      const t = idx + d;
      if (t < 0 || t >= entries.length) return; // like a real browser: no popstate
      setTimeout(() => {
        idx = t;
        (win.dispatchEvent as (e: unknown) => void)({
          type: 'popstate',
          state: entries[idx].state,
        });
      }, 0);
    },
  };
  win.history = history;
  return {
    win,
    history,
    entries,
    get index() {
      return idx;
    },
    get url() {
      return entries[idx].url;
    },
  };
}

export function installBrowser(b: FakeBrowser): void {
  const g = globalThis as Record<string, unknown>;
  g.window = b.win;
  g.history = b.history;
}

export function uninstallBrowser(): void {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.history;
}

/** Resolves to the value, or 'HANG' if it has not settled within `ms`. */
export function settleOrHang<T>(p: Promise<T>, ms = 300): Promise<T | 'HANG'> {
  return Promise.race([
    p,
    new Promise<'HANG'>((r) => setTimeout(() => r('HANG'), ms)),
  ]);
}
