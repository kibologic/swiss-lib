// @vitest-environment jsdom
//
// ROUTER-HISTORY-STACK (office navigation-shell design, Part 5.3 item 1):
// back()/forward()/go(n), an entries array + current index, canGoBack/canGoForward, kept
// consistent with native popstate -- browser back/forward must agree with the router's stack.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter } from '../src/index';

function waitForPopstate(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

describe('Router history stack', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('starts with a single entry at index 0 for the current path', () => {
    const router = createRouter({ routes: [{ path: '/', component: 'Home' }] });
    expect(router.entries).toHaveLength(1);
    expect(router.entries[0].path).toBe('/');
    expect(router.historyIndex).toBe(0);
    expect(router.canGoBack).toBe(false);
    expect(router.canGoForward).toBe(false);
  });

  it('push() appends an entry and advances the index', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
      ],
    });

    await router.push('/a');
    await router.push('/b');

    expect(router.entries.map((e) => e.path)).toEqual(['/', '/a', '/b']);
    expect(router.historyIndex).toBe(2);
    expect(router.canGoBack).toBe(true);
    expect(router.canGoForward).toBe(false);
  });

  it('back() moves the index without deleting entries, and matches native popstate', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
      ],
    });
    await router.push('/a');
    await router.push('/b');

    const popped = waitForPopstate();
    await router.back();
    await popped;

    expect(router.currentPath).toBe('/a');
    expect(router.historyIndex).toBe(1);
    expect(router.entries.map((e) => e.path)).toEqual(['/', '/a', '/b']);
    expect(router.canGoBack).toBe(true);
    expect(router.canGoForward).toBe(true);
    expect(location.pathname).toBe('/a'); // native browser location agrees with the router
  });

  it('forward() re-advances the index after a back()', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
      ],
    });
    await router.push('/a');
    await router.back();
    await router.forward();

    expect(router.currentPath).toBe('/a');
    expect(router.historyIndex).toBe(1);
    expect(router.canGoForward).toBe(false);
  });

  it('go(n) jumps multiple entries at once', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
        { path: '/c', component: 'C' },
      ],
    });
    await router.push('/a');
    await router.push('/b');
    await router.push('/c');

    await router.go(-2);

    expect(router.currentPath).toBe('/a');
    expect(router.historyIndex).toBe(1);
  });

  it('push() after a back() truncates the forward branch (Alpine-confirmed-correct truncation)', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
        { path: '/d', component: 'D' },
      ],
    });
    await router.push('/a');
    await router.push('/b');
    await router.back();
    await router.push('/d');

    expect(router.entries.map((e) => e.path)).toEqual(['/', '/a', '/d']);
    expect(router.historyIndex).toBe(2);
    expect(router.canGoForward).toBe(false);
  });

  it('forward() after a truncating push is a no-op', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
        { path: '/d', component: 'D' },
      ],
    });
    await router.push('/a');
    await router.push('/b');
    await router.back();
    await router.push('/d');

    await router.forward();

    expect(router.currentPath).toBe('/d');
    expect(router.historyIndex).toBe(2);
    expect(router.canGoForward).toBe(false);
  });

  it('back() at index 0 is a no-op', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'Home' }] });
    await router.back();
    expect(router.historyIndex).toBe(0);
    expect(router.currentPath).toBe('/');
  });

  it('clicking the real browser back button (native popstate, not router.back()) keeps the stack in sync', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
      ],
    });
    await router.push('/a');
    await router.push('/b');

    // Simulate the user clicking the browser's own back button, bypassing router.back()
    // entirely -- this is the scenario the design doc requires stay consistent.
    const popped = waitForPopstate();
    history.back();
    await popped;

    expect(router.currentPath).toBe('/a');
    expect(router.historyIndex).toBe(1);
    expect(router.canGoForward).toBe(true);
  });

  it('replace() overwrites the current entry in place without growing the stack', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/a2', component: 'A2' },
      ],
    });
    await router.push('/a');
    await router.replace('/a2');

    expect(router.entries.map((e) => e.path)).toEqual(['/', '/a2']);
    expect(router.historyIndex).toBe(1);
  });
});
