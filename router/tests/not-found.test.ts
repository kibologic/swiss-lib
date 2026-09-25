// ROUTER-NOT-FOUND (office navigation-shell design, Part 5.3 item 3): a not-found/catch-all
// route. RouterOptions.notFound, rendered by Outlet when match() returns undefined.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter } from '../src/core/router';
import { Outlet, registerRouter, setCurrentMatches } from '../src/core/outlet';

describe('Router not-found route', () => {
  beforeEach(() => {
    setCurrentMatches(null);
  });

  it('Outlet renders the configured notFound component for an unmatched path, not the empty div', () => {
    const router = createRouter({
      routes: [{ path: '/only', component: { name: 'Only' } }],
      notFound: { name: 'NotFoundPage' },
    });
    registerRouter(router);
    setCurrentMatches(router.match('/does-not-exist') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: { name: 'NotFoundPage' } });
  });

  it('still renders the empty placeholder when no notFound is configured (backwards compatible)', () => {
    const router = createRouter({ routes: [{ path: '/only', component: { name: 'Only' } }] });
    registerRouter(router);
    setCurrentMatches(router.match('/does-not-exist') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: 'div', props: { class: 'outlet-empty' } });
  });

  it('does not render notFound when a route does match', () => {
    const router = createRouter({
      routes: [{ path: '/only', component: { name: 'Only' } }],
      notFound: { name: 'NotFoundPage' },
    });
    registerRouter(router);
    setCurrentMatches(router.match('/only') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: { name: 'Only' } });
  });

  it('router.match() itself still returns undefined for an unmatched path (matcher behavior unchanged)', () => {
    const router = createRouter({
      routes: [{ path: '/only', component: { name: 'Only' } }],
      notFound: { name: 'NotFoundPage' },
    });
    expect(router.match('/does-not-exist')).toBeUndefined();
  });
});
