import { SwissComponent, createElement } from "@swissjs/core";
import { _getActiveRouter, getCurrentMatches } from './router-registry.js';
import { mergeParams } from './matcher.js';
import { ensureLazyLoadStarted, isLazyComponent } from './lazy.js';

export { registerRouter, setCurrentMatches } from './router-registry.js';

export class Outlet extends SwissComponent {
  render() {
    const router = _getActiveRouter();
    const matches =
      getCurrentMatches() ??
      router?.match(typeof window !== 'undefined' ? window.location.pathname : '/');

    if (!matches || matches.length === 0) {
      const notFound = router?.notFoundComponent;
      if (notFound) {
        return createElement(notFound, {});
      }
      return createElement('div', { class: 'outlet-empty' });
    }

    const leaf = matches[matches.length - 1];
    const params = mergeParams(matches);
    const component = leaf.route.component;

    if (isLazyComponent(component)) {
      const state = ensureLazyLoadStarted(component);
      if (state.status === 'resolved') {
        return createElement(state.component, params as Record<string, unknown>);
      }
      if (state.status === 'rejected') {
        return createElement('div', { class: 'outlet-lazy-error' });
      }
      return createElement('div', { class: 'outlet-lazy-pending' });
    }

    return createElement(component, params as Record<string, unknown>);
  }
}
