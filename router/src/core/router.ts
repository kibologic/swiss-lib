import { matchRoute, type RouteMatch } from "./matcher.js";
import type { ComponentType } from "@swissjs/core";
import {
  HISTORY_INDEX_KEY,
  MAX_HISTORY_ENTRIES,
  type HistoryEntry,
  type HistorySnapshot,
  type HistoryStateAdapter,
  type NativeHistoryState,
} from "./history-state.js";
import type { LazyComponent } from "./lazy.js";

export { MAX_HISTORY_ENTRIES } from "./history-state.js";

export type {
  HistoryEntry,
  HistorySnapshot,
  HistoryStateAdapter,
} from "./history-state.js";

/**
 * Typed context provided to route loader functions.
 * Replaces the previous untyped `params: any` signature.
 */
export interface LoaderContext {
  params: Record<string, string>;
  query: Record<string, string>;
  request?: Request;
}

/**
 * Typed context provided to route action functions.
 */
export interface ActionContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  request?: Request;
}

export type LoaderFunction = (ctx: LoaderContext) => Promise<unknown>;
export type ActionFunction = (ctx: ActionContext) => Promise<unknown>;

/**
 * Represents any value that can be used as a route component.
 * Aliased to ComponentType for full compatibility with createElement.
 */
export type ComponentLike = ComponentType;

export interface Route {
  path: string;
  /** A regular component, or `lazy(() => import(...))` (ROUTER-LAZY-ROUTES). */
  component: ComponentLike | LazyComponent;
  layout?: ComponentLike;
  children?: Route[];
  loader?: LoaderFunction;
  action?: ActionFunction;
  /**
   * Per-route guard (ROUTER-PER-ROUTE-GUARDS), checked only when this route -- or one of
   * its descendants -- is the navigation target, in addition to (and after) the router's
   * global `beforeEach()` guards. Same block/redirect contract as a global guard: `false`
   * blocks, a string redirects, anything else allows.
   */
  guard?: NavigationGuard;
  /** Opaque, framework-agnostic per-route data (e.g. role requirements) for `guard` to read. */
  meta?: Record<string, unknown>;
}

export interface RouterOptions {
  routes: Route[];
  mode?: "history" | "hash";
  base?: string;
  /**
   * Pluggable persistence for the history stack (ROUTER-PER-ENTRY-STATE). Omit for an
   * in-memory-only stack that does not survive a reload.
   */
  historyAdapter?: HistoryStateAdapter;
  /**
   * Rendered by `Outlet` when no route matches the current path (ROUTER-NOT-FOUND).
   * Omit to keep the previous behavior (an empty `<div class="outlet-empty">`).
   */
  notFound?: ComponentLike;
}

/**
 * Options accepted by {@link Router.push}/{@link Router.replace} for attaching a
 * serializable state payload to the affected history entry.
 */
export interface NavigateOptions {
  state?: unknown;
}

export type NavigationGuard = (
  to: string,
  from: string,
) => Promise<boolean | string | void> | boolean | string | void;

export class Router {
  private routes: Route[];
  private mode: "history" | "hash";
  private base: string;
  private _currentPath: string;
  private beforeHooks: NavigationGuard[] = [];
  private _navigationListeners: Set<(path: string) => void> = new Set();
  private _stateRestoreListeners: Set<(entry: HistoryEntry) => void> =
    new Set();

  private _entries: HistoryEntry[];
  private _index = 0;
  /**
   * Parallel to `_entries`: whether that entry is backed by a real native history entry in
   * THIS tab (reachable with `history.go`). Entries restored from a snapshot that this tab
   * never visited are "restored-only" (false) and are navigated with `replaceState`.
   * Invariant: the current entry is always live, and live entries are in native order.
   */
  private _live: boolean[] = [true];
  /** Number of entries trimmed from the front; native markers are `index + _base`. */
  private _base = 0;
  private historyAdapter?: HistoryStateAdapter;

  /** Rendered by `Outlet` when no route matches (ROUTER-NOT-FOUND). */
  public readonly notFoundComponent?: ComponentLike;

  /**
   * Resolves once construction-time history restoration (via `historyAdapter.load()`, if
   * configured) has settled. Await this before relying on a restored stack.
   */
  public readonly ready: Promise<void>;

  constructor(options: RouterOptions) {
    this.routes = options.routes;
    this.mode = options.mode || "history";
    this.base = options.base || "/";
    this._currentPath = this.getPath();
    this.historyAdapter = options.historyAdapter;
    this.notFoundComponent = options.notFound;

    this._entries = [
      {
        path: this._currentPath,
        params: this.leafParamsFor(this._currentPath),
      },
    ];
    this._index = 0;

    if (typeof window !== "undefined") {
      // Tag the entry the browser is already on with index 0, so a later native back/
      // forward landing here (or our own go()) can find it via history.state -- without
      // this, the very first entry would never carry our correlation marker.
      // Only when the entry carries no marker yet: on a same-tab reload the existing marker
      // is the truth and re-tagging it would break later back/forward (ROUTER-HISTORY-RESTORE).
      if (this.readIndexFromHistoryState() === null) {
        this.tagNative(0, "replace", this._currentPath);
      }
      window.addEventListener("popstate", this.handlePopState.bind(this));
    }

    this.ready = this.restoreFromAdapter();
  }

  get currentPath(): string {
    return this._currentPath;
  }

  /** Read-only snapshot of the navigation-history stack. */
  get entries(): readonly HistoryEntry[] {
    return this._entries.map((entry) => ({ ...entry }));
  }

  /** Index of the current entry within {@link entries}. */
  get historyIndex(): number {
    return this._index;
  }

  get canGoBack(): boolean {
    return this._index > 0;
  }

  get canGoForward(): boolean {
    return this._index < this._entries.length - 1;
  }

  private leafParamsFor(path: string): Record<string, string> {
    const matches = this.match(path);
    if (!matches || matches.length === 0) return {};
    return matches[matches.length - 1].params;
  }

  /** Pathname + query string of the live browser location (the URL always wins). */
  private getPath(): string {
    if (typeof window === "undefined") return "/";
    return window.location.pathname + (window.location.search ?? "");
  }

  /** Write (push or replace) a native history entry carrying our index marker. */
  private tagNative(index: number, how: "push" | "replace", path: string) {
    const existing =
      how === "replace"
        ? ((window.history.state ?? {}) as NativeHistoryState)
        : {};
    const nativeState: NativeHistoryState = {
      ...existing,
      [HISTORY_INDEX_KEY]: index + this._base,
    };
    if (how === "push") history.pushState(nativeState, "", path);
    else history.replaceState(nativeState, "", path);
  }

  /** Drop the oldest entries beyond {@link MAX_HISTORY_ENTRIES}, keeping index/live in step. */
  private trimToCap() {
    const drop = this._entries.length - MAX_HISTORY_ENTRIES;
    if (drop <= 0) return;
    this._entries.splice(0, drop);
    this._live.splice(0, drop);
    this._index = Math.max(0, this._index - drop);
    this._base += drop;
  }

  private readIndexFromHistoryState(): number | null {
    if (typeof window === "undefined") return null;
    const state = window.history.state as NativeHistoryState | null;
    const idx = state?.[HISTORY_INDEX_KEY];
    return typeof idx === "number" ? idx : null;
  }

  private handlePopState() {
    this._currentPath = this.getPath();
    const marker = this.readIndexFromHistoryState();
    const idx = marker === null ? null : marker - this._base;
    if (idx !== null && idx >= 0 && idx < this._entries.length) {
      this._index = idx;
      this._live[idx] = true;
      const entry = this._entries[idx];
      // The live URL (path + query) wins over what we remembered.
      entry.path = this._currentPath;
      this.notifyStateRestore(entry);
    }
    this._navigationListeners.forEach((fn) => fn(this._currentPath));
  }

  private notifyStateRestore(entry: HistoryEntry) {
    this._stateRestoreListeners.forEach((fn) => fn({ ...entry }));
  }

  private async persist(): Promise<void> {
    if (!this.historyAdapter) return;
    await this.historyAdapter.save(
      this._entries.map((entry) => ({ ...entry })),
      this._index,
    );
  }

  private async restoreFromAdapter(): Promise<void> {
    if (!this.historyAdapter) return;
    const snapshot = await this.historyAdapter.load();
    if (!snapshot || snapshot.entries.length === 0) return;

    const entries = snapshot.entries.map((entry) => ({ ...entry }));
    const snapIndex = Math.min(
      Math.max(snapshot.index, 0),
      entries.length - 1,
    );
    const loc = this.getPath();
    const nativeIdx = this.readIndexFromHistoryState();

    // Same-tab reload: the native entry carries a marker naming a snapshot entry that is
    // this very location. Adopt the snapshot and that index; do not re-tag. The tab's native
    // history is still there, so the entries around it are reachable with history.go().
    if (
      typeof window !== "undefined" &&
      nativeIdx !== null &&
      nativeIdx >= 0 &&
      nativeIdx < entries.length &&
      entries[nativeIdx].path === loc
    ) {
      const pos = Math.min(nativeIdx, window.history.length - 1);
      const forward = Math.max(window.history.length - 1 - pos, 0);
      this._entries = entries;
      this._index = nativeIdx;
      this._base = 0;
      this._live = entries.map(
        (_, i) => i >= nativeIdx - pos && i <= nativeIdx + forward,
      );
      this.trimToCap();
      this._currentPath = loc;
      this.notifyStateRestore(this._entries[this._index]);
      return;
    }

    // Otherwise (new tab/device/restart, or a marker that does not match): the snapshot is
    // the stack's back-history, but the URL the browser is on wins for the current entry.
    let isNew = false;
    let index = snapIndex;
    if (typeof window !== "undefined" && entries[index].path !== loc) {
      entries.splice(index + 1);
      entries.push({ path: loc, params: this.leafParamsFor(loc) });
      index = entries.length - 1;
      isNew = true;
    }
    this._entries = entries;
    this._index = index;
    this._base = 0;
    this._live = entries.map((_, i) => i === index);
    this.trimToCap();
    if (typeof window !== "undefined") {
      this.tagNative(this._index, "replace", loc);
      this._currentPath = loc;
    } else {
      this._currentPath = this._entries[this._index].path;
    }
    if (!isNew) this.notifyStateRestore(this._entries[this._index]);
  }

  /**
   * Subscribe to navigation events. Returns an unsubscribe function.
   * Use this to re-render when the user navigates with browser back/forward.
   */
  public onNavigate(listener: (path: string) => void): () => void {
    this._navigationListeners.add(listener);
    return () => this._navigationListeners.delete(listener);
  }

  /**
   * Subscribe to per-entry state restoration (ROUTER-PER-ENTRY-STATE): fired whenever the
   * router lands on an existing entry -- via `back()`/`forward()`/`go()`, a native
   * browser back/forward, or a successful `historyAdapter.load()` on construction -- with
   * that entry's `state`, verbatim. Never fired for a fresh `push()`. Returns an
   * unsubscribe function.
   */
  public onStateRestore(listener: (entry: HistoryEntry) => void): () => void {
    this._stateRestoreListeners.add(listener);
    return () => this._stateRestoreListeners.delete(listener);
  }

  public beforeEach(guard: NavigationGuard) {
    this.beforeHooks.push(guard);
  }

  private async runGuard(guard: NavigationGuard, to: string): Promise<boolean> {
    const result = await guard(to, this._currentPath);
    if (result === false) return false;
    if (typeof result === "string") {
      this.push(result);
      return false;
    }
    return true;
  }

  private async runGuards(to: string): Promise<boolean> {
    for (const guard of this.beforeHooks) {
      if (!(await this.runGuard(guard, to))) return false;
    }

    // Per-route guards (ROUTER-PER-ROUTE-GUARDS): only the routes actually matched by
    // `to` are checked -- a guard on an unrelated route is never invoked.
    const matches = this.match(to);
    if (matches) {
      for (const match of matches) {
        if (!match.route.guard) continue;
        if (!(await this.runGuard(match.route.guard, to))) return false;
      }
    }

    return true;
  }

  public async push(path: string, options?: NavigateOptions) {
    if (await this.runGuards(path)) {
      this._entries = this._entries.slice(0, this._index + 1);
      this._live = this._live.slice(0, this._index + 1);
      this._entries.push({
        path,
        params: this.leafParamsFor(path),
        state: options?.state,
      });
      this._live.push(true);
      this._index = this._entries.length - 1;
      this.trimToCap();

      if (typeof window !== "undefined") {
        this.tagNative(this._index, "push", path);
        this._currentPath = this.getPath();
      } else {
        this._currentPath = path;
      }
      this._navigationListeners.forEach((fn) => fn(this._currentPath));
      await this.persist();
    }
  }

  public async replace(path: string, options?: NavigateOptions) {
    if (await this.runGuards(path)) {
      const entry: HistoryEntry = {
        path,
        params: this.leafParamsFor(path),
        state: options?.state,
      };
      if (this._entries.length === 0) {
        this._entries = [entry];
        this._live = [true];
        this._index = 0;
      } else {
        this._entries[this._index] = entry;
        this._live[this._index] = true;
      }

      if (typeof window !== "undefined") {
        this.tagNative(this._index, "replace", path);
        this._currentPath = this.getPath();
      } else {
        this._currentPath = path;
      }
      this._navigationListeners.forEach((fn) => fn(this._currentPath));
      await this.persist();
    }
  }

  /**
   * Move `delta` entries within the history stack (negative = back, positive = forward).
   * A no-op, resolving immediately, when the target index is out of range. In a real
   * browser this drives native `history.go()` and waits for the resulting `popstate`, so
   * the router's stack and the browser's own back/forward buttons never disagree.
   */
  public async go(delta: number): Promise<void> {
    if (delta === 0) return;
    const targetIndex = this._index + delta;
    if (targetIndex < 0 || targetIndex >= this._entries.length) return;

    if (typeof window === "undefined") {
      this._index = targetIndex;
      const entry = this._entries[targetIndex];
      this._currentPath = entry.path;
      this.notifyStateRestore(entry);
      this._navigationListeners.forEach((fn) => fn(this._currentPath));
      await this.persist();
      return;
    }

    const from = this._index;
    if (!this._live[targetIndex]) {
      // Restored-only entry: there is no native entry to travel to (and so no popstate to
      // wait for). Re-point the CURRENT native entry at the target with replaceState. That
      // native slot now belongs to the target; the entries we jumped over and the one we
      // left are no longer separately reachable natively, so they become restored-only.
      const lo = Math.min(from, targetIndex);
      const hi = Math.max(from, targetIndex);
      for (let i = lo; i <= hi; i++) this._live[i] = false;
      this._live[targetIndex] = true;
      this._index = targetIndex;
      const entry = this._entries[targetIndex];
      this.tagNative(targetIndex, "replace", entry.path);
      this._currentPath = this.getPath();
      entry.path = this._currentPath;
      this.notifyStateRestore(entry);
      this._navigationListeners.forEach((fn) => fn(this._currentPath));
      await this.persist();
      return;
    }

    // Live entry: live entries are contiguous natively, so the native distance is the
    // number of live entries crossed on the way.
    const step = delta > 0 ? 1 : -1;
    let nativeDelta = 0;
    for (let i = from + step; i !== targetIndex + step; i += step) {
      if (this._live[i]) nativeDelta += step;
    }
    await new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      window.history.go(nativeDelta);
    });
    await this.persist();
  }

  public async back(): Promise<void> {
    return this.go(-1);
  }

  public async forward(): Promise<void> {
    return this.go(1);
  }

  /**
   * Update the current entry's state slot in place, without navigating (ROUTER-PER-ENTRY-STATE).
   */
  public setEntryState(state: unknown): void {
    if (this._entries.length === 0) return;
    this._entries[this._index] = {
      ...this._entries[this._index],
      state,
    };
    void this.persist();
  }

  public addRoute(path: string, component: ComponentLike) {
    this.routes.push({ path, component });
  }

  public match(path: string): RouteMatch[] | undefined {
    // Route matching is on the pathname only; a query string or hash is not part of it.
    return matchRoute(this.routes, path.split(/[?#]/, 1)[0]);
  }

  public async loadRouteData(path: string): Promise<Record<string, unknown>> {
    const matches = this.match(path);
    if (!matches) return {};

    const data: Record<string, unknown> = {};

    await Promise.all(
      matches.map(async (match) => {
        if (match.route.loader) {
          try {
            const ctx: LoaderContext = {
              params: match.params,
              query: {},
              request: new Request("http://localhost" + path),
            };
            const result = await match.route.loader(ctx);
            data[match.path] = result;
          } catch (err) {
            console.error(`Loader failed for ${match.path}`, err);
            data[match.path] = { error: err };
          }
        }
      }),
    );

    return data;
  }
}

export * from "./matcher.js";
export * from "./link.js";
export * from "./outlet.js";
export * from "./lazy.js";

export function createRouter(options: RouterOptions): Router {
  return new Router(options);
}
