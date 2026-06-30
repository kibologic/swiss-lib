import { matchRoute, type RouteMatch } from "./matcher.js";
import type { ComponentType } from "@swissjs/core";

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
  component: ComponentLike;
  layout?: ComponentLike;
  children?: Route[];
  loader?: LoaderFunction;
  action?: ActionFunction;
}

export interface RouterOptions {
  routes: Route[];
  mode?: "history" | "hash";
  base?: string;
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

  constructor(options: RouterOptions) {
    this.routes = options.routes;
    this.mode = options.mode || "history";
    this.base = options.base || "/";
    this._currentPath = this.getPath();

    if (typeof window !== "undefined") {
      window.addEventListener("popstate", this.handlePopState.bind(this));
    }
  }

  get currentPath(): string {
    return this._currentPath;
  }

  private getPath(): string {
    if (typeof window === "undefined") return "/";
    return window.location.pathname;
  }

  private handlePopState() {
    this._currentPath = this.getPath();
    this._navigationListeners.forEach((fn) => fn(this._currentPath));
  }

  /**
   * Subscribe to navigation events. Returns an unsubscribe function.
   * Use this to re-render when the user navigates with browser back/forward.
   */
  public onNavigate(listener: (path: string) => void): () => void {
    this._navigationListeners.add(listener);
    return () => this._navigationListeners.delete(listener);
  }

  public beforeEach(guard: NavigationGuard) {
    this.beforeHooks.push(guard);
  }

  private async runGuards(to: string): Promise<boolean> {
    for (const guard of this.beforeHooks) {
      const result = await guard(to, this._currentPath);
      if (result === false) return false;
      if (typeof result === "string") {
        this.push(result);
        return false;
      }
    }
    return true;
  }

  public async push(path: string) {
    if (await this.runGuards(path)) {
      if (typeof window !== "undefined") {
        history.pushState(null, "", path);
        this.handlePopState();
      }
    }
  }

  public async replace(path: string) {
    if (await this.runGuards(path)) {
      if (typeof window !== "undefined") {
        history.replaceState(null, "", path);
        this.handlePopState();
      }
    }
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
            data[match.route.path] = result;
          } catch (err) {
            console.error(`Loader failed for ${match.route.path}`, err);
            data[match.route.path] = { error: err };
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

export function createRouter(options: RouterOptions): Router {
  return new Router(options);
}
