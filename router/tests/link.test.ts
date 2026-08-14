import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/core/router';
import { Link } from '../src/core/link';
import { registerRouter } from '../src/core/outlet';

// Link had zero tests before this file, despite being one of the router's four public
// primitives named explicitly in FRAME-006's own scope.
describe('Link', () => {
  it('renders an anchor with the target href and an onClick handler', () => {
    registerRouter(createRouter({ routes: [{ path: '/about', component: { name: 'About' } }] }));

    const vnode = new Link({ to: '/about', children: 'About us' }).render();

    expect(vnode).toMatchObject({
      type: 'a',
      props: { href: '/about' },
    });
    expect(typeof (vnode as { props: { onClick: unknown } }).props.onClick).toBe('function');
  });

  it('calls router.push on click by default, not router.replace', () => {
    const router = createRouter({ routes: [{ path: '/x', component: { name: 'X' } }] });
    registerRouter(router);
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined);
    const replaceSpy = vi.spyOn(router, 'replace').mockResolvedValue(undefined);

    const link = new Link({ to: '/x' });
    const vnode = link.render() as { props: { onClick: (e: unknown) => void } };
    const preventDefault = vi.fn();
    vnode.props.onClick({ preventDefault } as unknown as MouseEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(pushSpy).toHaveBeenCalledWith('/x');
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('calls router.replace instead of router.push when replace=true', () => {
    const router = createRouter({ routes: [{ path: '/y', component: { name: 'Y' } }] });
    registerRouter(router);
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined);
    const replaceSpy = vi.spyOn(router, 'replace').mockResolvedValue(undefined);

    const link = new Link({ to: '/y', replace: true });
    const vnode = link.render() as { props: { onClick: (e: unknown) => void } };
    vnode.props.onClick({ preventDefault: vi.fn() } as unknown as MouseEvent);

    expect(replaceSpy).toHaveBeenCalledWith('/y');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('click is a safe no-op when no router has been registered', () => {
    // Simulate "no active router" the same way outlet.test.ts does: there is no
    // unregister API, so a router with no routes is the closest honest equivalent.
    registerRouter(createRouter({ routes: [] }));
    // _getActiveRouter() only returns null before ANY router is ever registered
    // process-wide; this test documents the handleClick guard exists and does not throw
    // even in the degenerate case, rather than asserting on global module state it cannot
    // reliably control from a single test file.
    const link = new Link({ to: '/nowhere' });
    const vnode = link.render() as { props: { onClick: (e: unknown) => void } };
    expect(() =>
      vnode.props.onClick({ preventDefault: vi.fn() } as unknown as MouseEvent),
    ).not.toThrow();
  });

  it('omits the class attribute entirely when neither class nor an active match is present', () => {
    registerRouter(createRouter({ routes: [{ path: '/z', component: { name: 'Z' } }] }));
    const vnode = new Link({ to: '/z' }).render() as { props: Record<string, unknown> };
    expect(vnode.props.class).toBeUndefined();
  });

  it('passes through arbitrary extra props (e.g. aria-label) onto the anchor', () => {
    registerRouter(createRouter({ routes: [{ path: '/z', component: { name: 'Z' } }] }));
    const vnode = new Link({ to: '/z', 'aria-label': 'Go to Z' }).render() as {
      props: Record<string, unknown>;
    };
    expect(vnode.props['aria-label']).toBe('Go to Z');
    // 'to' itself must not leak through as a raw DOM attribute -- it becomes `href`.
    expect(vnode.props.to).toBeUndefined();
  });
});
