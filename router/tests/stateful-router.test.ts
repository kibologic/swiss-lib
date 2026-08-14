import { describe, it, expect } from 'vitest';
import { StatefulRouter } from '../src/core/stateful-router';

// StatefulRouter (288 lines) had zero tests before this file, despite being one of the
// router's four public primitives FRAME-006 names explicitly. All parseURL/buildURL calls
// below pass an explicit URL, so they exercise the same logic a browser would reach via
// window.location -- this package's default 'node' test environment has no `window`.
describe('StatefulRouter', () => {
  const makeRouter = (persistScroll = false) =>
    new StatefulRouter({ routes: [], persistScroll });

  describe('parseURL', () => {
    it('splits path and query', () => {
      const router = makeRouter();
      const state = router.parseURL('http://localhost/products?category=shoes&sort=price');
      expect(state.path).toBe('/products');
      expect(state.query).toEqual({ category: 'shoes', sort: 'price' });
    });

    it('extracts and removes the __state component-state param', () => {
      const router = makeRouter();
      const encoded = encodeURIComponent(JSON.stringify({ tab: 'reviews' }));
      const state = router.parseURL(`http://localhost/item?__state=${encoded}&id=9`);
      expect(state.componentState).toEqual({ tab: 'reviews' });
      expect(state.query).toEqual({ id: '9' });
      expect(state.query.__state).toBeUndefined();
    });

    it('does not throw and drops componentState on malformed __state JSON', () => {
      const router = makeRouter();
      const state = router.parseURL('http://localhost/item?__state=%7Bnot-json&id=1');
      expect(state.componentState).toBeUndefined();
      // Malformed __state is left in query since the parse failed before `delete query.__state`.
      expect(state.query.id).toBe('1');
    });

    it('extracts scroll position only when both __scrollX and __scrollY are present', () => {
      const router = makeRouter();
      const withBoth = router.parseURL('http://localhost/p?__scrollX=10&__scrollY=20');
      expect(withBoth.scroll).toEqual({ x: 10, y: 20 });
      expect(withBoth.query.__scrollX).toBeUndefined();

      const withOnlyX = router.parseURL('http://localhost/p?__scrollX=10');
      expect(withOnlyX.scroll).toBeUndefined();
      // Partial scroll params are not component state -- they must survive untouched.
      expect(withOnlyX.query.__scrollX).toBe('10');
    });

    it('produces an empty query object for a bare path with no query string', () => {
      const router = makeRouter();
      const state = router.parseURL('http://localhost/plain');
      expect(state.query).toEqual({});
      expect(state.componentState).toBeUndefined();
      expect(state.scroll).toBeUndefined();
    });
  });

  describe('buildURL', () => {
    it('round-trips a plain path and query with no component state', () => {
      const router = makeRouter();
      const url = router.buildURL({ path: '/search', query: { q: 'shoes' } });
      expect(url).toBe('/search?q=shoes');
    });

    it('serialises componentState back into __state', () => {
      const router = makeRouter();
      const url = router.buildURL({
        path: '/item',
        query: { id: '9' },
        componentState: { tab: 'reviews' },
      });
      const rebuilt = router.parseURL(`http://localhost${url}`);
      expect(rebuilt.componentState).toEqual({ tab: 'reviews' });
      expect(rebuilt.query.id).toBe('9');
    });

    it('omits __state entirely for an empty componentState object (not "__state={}")', () => {
      const router = makeRouter();
      const url = router.buildURL({ path: '/item', query: {}, componentState: {} });
      expect(url).toBe('/item');
    });

    it('only writes scroll params when persistScroll is enabled on the router instance', () => {
      const withScroll = makeRouter(true);
      const url1 = withScroll.buildURL({ path: '/p', query: {}, scroll: { x: 1, y: 2 } });
      expect(url1).toContain('__scrollX=1');
      expect(url1).toContain('__scrollY=2');

      const withoutScroll = makeRouter(false);
      const url2 = withoutScroll.buildURL({ path: '/p', query: {}, scroll: { x: 1, y: 2 } });
      expect(url2).not.toContain('__scrollX');
    });
  });

  describe('updateState / getCurrentState', () => {
    it('lazily initialises from parseURL(default) on first access, not a throw', () => {
      const router = makeRouter();
      // window is undefined in this environment; parseURL's default falls back to
      // 'http://localhost/' -- getCurrentState() must not require a prior push/restore call.
      const state = router.getCurrentState();
      expect(state.path).toBe('/');
    });

    it('merges query updates into existing state rather than replacing it', () => {
      const router = makeRouter();
      router.updateState({ query: { a: '1' } });
      router.updateState({ query: { b: '2' } });
      expect(router.getCurrentState().query).toEqual({ a: '1', b: '2' });
    });
  });

  describe('restoreFromURL', () => {
    it('invokes onStateRestore with the parsed state', () => {
      let received: unknown = null;
      const router = new StatefulRouter({
        routes: [],
        onStateRestore: (state) => {
          received = state;
        },
      });
      const state = router.restoreFromURL();
      expect(received).toBe(state);
    });
  });
});
