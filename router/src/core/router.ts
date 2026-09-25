import { matchRoute, type RouteMatch } from "./matcher.js";
import type { ComponentType } from "@swissjs/core";
import {
  HISTORY_INDEX_KEY,
  type HistoryEntry,
  type HistorySnapshot,
  type HistoryStateAdapter,
  type NativeHistoryState,
} from "./history-state.js";
import type { LazyComponent } from "./lazy.js";

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
      const existing = (window.history.state ?? {}) as NativeHistoryState;
      const nativeState: NativeHistoryState = {
        ...existing,
        [HISTORY_INDEX_KEY]: 0,
      };
      history.replaceState(nativeState, "", this._currentPath);
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

  private getPath(): string {
    if (typeof window === "undefined") return "/";
    return window.location.pathname;
  }

  private readIndexFromHistoryState(): number | null {
    if (typeof window === "undefined") return null;
    const state = window.history.state as NativeHistoryState | null;
    const idx = state?.[HISTORY_INDEX_KEY];
    return typeof idx === "number" ? idx : null;
  }

  private handlePopState() {
    this._currentPath = this.getPath();
    const idx = this.readIndexFromHistoryState();
    if (idx !== null && idx >= 0 && idx < this._entries.length) {
      this._index = idx;
      const entry = this._entries[idx];
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

    this._entries = snapshot.entries.map((entry) => ({ ...entry }));
    this._index = Math.min(
      Math.max(snapshot.index, 0),
      this._entries.length - 1,
    );
    this._currentPath = this._entries[this._index].path;
    this.notifyStateRestore(this._entries[this._index]);
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
      this._entries.push({
        path,
        params: this.leafParamsFor(path),
        state: options?.state,
      });
      this._index = this._entries.length - 1;

      if (typeof window !== "undefined") {
        const nativeState: NativeHistoryState = {
          [HISTORY_INDEX_KEY]: this._index,
        };
        history.pushState(nativeState, "", path);
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
        this._index = 0;
      } else {
        this._entries[this._index] = entry;
      }

      if (typeof window !== "undefined") {
        const nativeState: NativeHistoryState = {
          [HISTORY_INDEX_KEY]: this._index,
        };
        history.replaceState(nativeState, "", path);
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

    await new Promise<void>((resolve) => {
      window.addEventListener(
        "popstate",
        () => resolve(),
        { once: true },
      );
      window.history.go(delta);
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
    return matchRoute(this.routes, path);
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
