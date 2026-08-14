import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter } from '../src/core/router';
import { Outlet, registerRouter, setCurrentMatches } from '../src/core/outlet';

// Outlet had zero tests before this file, despite being one of the router's four public
// primitives named explicitly in FRAME-006's own scope ("matcher/outlet/link/stateful-router").
describe('Outlet', () => {
  beforeEach(() => {
    setCurrentMatches(null);
  });

  it('renders the leaf-matched route component with its params as props', () => {
    const router = createRouter({
      routes: [{ path: '/user/:id', component: { name: 'UserPage' } }],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/user/42') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({
      type: { name: 'UserPage' },
      props: { id: '42' },
    });
  });

  it('renders the deepest match for a nested route, not an ancestor', () => {
    const router = createRouter({
      routes: [
        {
          path: '/dashboard',
          component: { name: 'DashboardLayout' },
          children: [{ path: 'settings', component: { name: 'SettingsPage' } }],
        },
      ],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/dashboard/settings') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: { name: 'SettingsPage' } });
  });

  it('renders an empty placeholder, not a crash, when nothing matches', () => {
    const router = createRouter({ routes: [{ path: '/only', component: { name: 'Only' } }] });
    registerRouter(router);
    setCurrentMatches(router.match('/does-not-exist') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: 'div', props: { class: 'outlet-empty' } });
  });

  it('renders an empty placeholder when no router has been registered at all', () => {
    // setCurrentMatches(null) alone should not throw even though _getActiveRouter() may
    // still hold whatever a PRIOR test registered -- registerRouter has no "unregister".
    // Registering a router with no routes at all is the closest honest equivalent of "no
    // active router" this module's public API can express.
    registerRouter(createRouter({ routes: [] }));
    setCurrentMatches(null);

    const vnode = new Outlet({}).render();

    expect(vnode).toMatchObject({ type: 'div', props: { class: 'outlet-empty' } });
  });

  it("falls back to matching window.location.pathname when no matches were preset", () => {
    const router = createRouter({ routes: [{ path: '/', component: { name: 'Home' } }] });
    registerRouter(router);
    setCurrentMatches(null); // Outlet must call router.match(window.location.pathname) itself.

    const vnode = new Outlet({}).render();

    // jsdom is not this package's environment (router runs under 'node', see
    // vitest.config.ts) -- `typeof window !== 'undefined'` is false here, so Outlet's own
    // fallback-to-'/' branch is what's under test, not a real browser location.
    expect(vnode).toMatchObject({ type: { name: 'Home' } });
  });
});
