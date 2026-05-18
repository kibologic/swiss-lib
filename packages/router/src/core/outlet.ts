import { SwissComponent, createElement } from "@kibologic/core";
import type { Router } from "./router.js";
import type { RouteMatch } from "./matcher.js";

let _router: Router | null = null;
let _currentMatches: RouteMatch[] | null = null;

/** Call once at app startup to connect the Outlet to the active Router instance. */
export function registerRouter(router: Router): void {
  _router = router;
}

/** Called by the Router on every navigation to keep Outlet in sync. */
export function setCurrentMatches(matches: RouteMatch[] | null): void {
  _currentMatches = matches;
}

export class Outlet extends SwissComponent {
  render() {
    const matches: RouteMatch[] | null | undefined =
      _currentMatches ??
      _router?.match(typeof window !== 'undefined' ? window.location.pathname : '/');

    if (!matches || matches.length === 0) {
      return createElement('div', { class: 'outlet-empty' });
    }

    const leaf = matches[matches.length - 1];
    return createElement(leaf.route.component, leaf.params as Record<string, unknown>);
  }
}
