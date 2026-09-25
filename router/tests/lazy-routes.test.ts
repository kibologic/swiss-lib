// ROUTER-LAZY-ROUTES (office navigation-shell design, Part 5.3 item 6): lazy-loaded route
// components via a `lazy()` wrapper around a dynamic import -- disambiguated from a plain
// functional component (which is itself a valid ComponentLike, `(props) => VNode`) rather
// than sniffing an ordinary function's arity/constructor at runtime.
import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/core/router';
import { Outlet, registerRouter, setCurrentMatches } from '../src/core/outlet';
import { lazy, preloadLazy } from '../src/core/lazy';

describe('Lazy route components', () => {
  it('does not attempt to render the target component before its dynamic import settles', () => {
    const LazyPage = { name: 'LazyPage' };
    let resolveImport!: (c: typeof LazyPage) => void;
    const loader = vi.fn(
      () => new Promise<typeof LazyPage>((resolve) => (resolveImport = resolve)),
    );
    const route = { path: '/lazy', component: lazy(loader) };
    const router = createRouter({ routes: [route] });
    registerRouter(router);
    setCurrentMatches(router.match('/lazy') ?? null);

    const vnode = new Outlet({}).render();

    expect(vnode).not.toMatchObject({ type: LazyPage });
    expect(loader).toHaveBeenCalledTimes(1);
    resolveImport(LazyPage); // avoid an unresolved promise leaking past the test
  });

  it('renders the resolved component once the dynamic import settles', async () => {
    const LazyPage = { name: 'LazyPage' };
    const lazyComponent = lazy(() => Promise.resolve(LazyPage));
    const route = { path: '/lazy', component: lazyComponent };
    const router = createRouter({ routes: [route] });
    registerRouter(router);
    setCurrentMatches(router.match('/lazy') ?? null);

    new Outlet({}).render(); // kicks off the load
    await preloadLazy(lazyComponent);

    const vnode = new Outlet({}).render();
    expect(vnode).toMatchObject({ type: LazyPage });
  });

  it('a lazy route resolves with merged params (composes with ROUTER-PARAM-MERGE)', async () => {
    const Member = { name: 'Member' };
    const lazyMember = lazy(() => Promise.resolve(Member));
    const router = createRouter({
      routes: [
        {
          path: '/teams/:teamId',
          component: 'TeamLayout',
          children: [{ path: 'members/:memberId', component: lazyMember }],
        },
      ],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/teams/eng/members/42') ?? null);

    new Outlet({}).render();
    await preloadLazy(lazyMember);

    const vnode = new Outlet({}).render();
    expect(vnode).toMatchObject({
      type: Member,
      props: { teamId: 'eng', memberId: '42' },
    });
  });

  it('a failed dynamic import does not throw and produces no unhandled rejection', async () => {
    const lazyComponent = lazy(() => Promise.reject(new Error('chunk load failed')));
    const router = createRouter({
      routes: [{ path: '/lazy', component: lazyComponent }],
    });
    registerRouter(router);
    setCurrentMatches(router.match('/lazy') ?? null);

    expect(() => new Outlet({}).render()).not.toThrow();

    const state = await preloadLazy(lazyComponent); // awaited + caught here -> no unhandled rejection
    expect(state.status).toBe('rejected');

    expect(() => new Outlet({}).render()).not.toThrow();
  });

  it('the loader is only invoked once even across multiple render() calls (idempotent load)', async () => {
    const LazyPage = { name: 'LazyPage' };
    const loader = vi.fn(() => Promise.resolve(LazyPage));
    const lazyComponent = lazy(loader);
    const router = createRouter({ routes: [{ path: '/lazy', component: lazyComponent }] });
    registerRouter(router);
    setCurrentMatches(router.match('/lazy') ?? null);

    new Outlet({}).render();
    new Outlet({}).render();
    await preloadLazy(lazyComponent);
    new Outlet({}).render();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
