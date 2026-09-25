// ROUTER-PER-ROUTE-GUARDS (office navigation-shell design, Part 5.3 item 5): optional
// Route.guard, checked only when that route (or a descendant) is the navigation target,
// alongside the existing router-global beforeEach() guards.
import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/index';

describe('Per-route guards', () => {
  it('a guard attached to /admin is not invoked for a /public navigation', async () => {
    const adminGuard = vi.fn(() => true);
    const router = createRouter({
      routes: [
        { path: '/admin', component: 'Admin', guard: adminGuard },
        { path: '/public', component: 'Public' },
      ],
    });

    await router.push('/public');

    expect(adminGuard).not.toHaveBeenCalled();
  });

  it('a guard attached to /admin is invoked for an /admin navigation', async () => {
    const adminGuard = vi.fn(() => true);
    const router = createRouter({
      routes: [{ path: '/admin', component: 'Admin', guard: adminGuard }],
    });

    await router.push('/admin');

    expect(adminGuard).toHaveBeenCalledWith('/admin', '/');
  });

  it('a route guard can block navigation by returning false', async () => {
    const router = createRouter({
      routes: [{ path: '/admin', component: 'Admin', guard: () => false }],
    });

    await router.push('/admin');

    expect(router.currentPath).toBe('/');
  });

  it('a route guard can redirect by returning a path', async () => {
    const router = createRouter({
      routes: [
        { path: '/admin', component: 'Admin', guard: () => '/forbidden' },
        { path: '/forbidden', component: 'Forbidden' },
      ],
    });

    await router.push('/admin');

    expect(router.currentPath).toBe('/forbidden');
  });

  it('a guard on a parent route runs when navigating to a nested child (descendant target)', async () => {
    const parentGuard = vi.fn(() => true);
    const router = createRouter({
      routes: [
        {
          path: '/dashboard',
          component: 'Dashboard',
          guard: parentGuard,
          children: [{ path: 'settings', component: 'Settings' }],
        },
      ],
    });

    await router.push('/dashboard/settings');

    expect(parentGuard).toHaveBeenCalledWith('/dashboard/settings', '/');
  });

  it('router-global beforeEach() guards still run alongside route guards', async () => {
    const order: string[] = [];
    const router = createRouter({
      routes: [
        {
          path: '/admin',
          component: 'Admin',
          guard: () => {
            order.push('route');
          },
        },
      ],
    });
    router.beforeEach(() => {
      order.push('global');
    });

    await router.push('/admin');

    expect(order).toEqual(['global', 'route']);
  });

  it('a blocking global guard prevents route guards from running at all', async () => {
    const routeGuard = vi.fn(() => true);
    const router = createRouter({
      routes: [{ path: '/admin', component: 'Admin', guard: routeGuard }],
    });
    router.beforeEach(() => false);

    await router.push('/admin');

    expect(routeGuard).not.toHaveBeenCalled();
    expect(router.currentPath).toBe('/');
  });
});
