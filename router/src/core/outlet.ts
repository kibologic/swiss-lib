import { SwissComponent, createElement } from "@swissjs/core";
import { _getActiveRouter, getCurrentMatches } from './router-registry.js';

export { registerRouter, setCurrentMatches } from './router-registry.js';

export class Outlet extends SwissComponent {
  render() {
    const router = _getActiveRouter();
    const matches =
      getCurrentMatches() ??
      router?.match(typeof window !== 'undefined' ? window.location.pathname : '/');

    if (!matches || matches.length === 0) {
      return createElement('div', { class: 'outlet-empty' });
    }

    const leaf = matches[matches.length - 1];
    return createElement(leaf.route.component, leaf.params as Record<string, unknown>);
  }
}
