// @vitest-environment jsdom
//
// ROUTER-PER-ENTRY-STATE (office navigation-shell design, Part 5.3 item 2):
// a generic, serializable per-entry state slot plus a restore hook, and pluggable
// persistence through an adapter -- the router must NOT hard-code localStorage.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouter } from '../src/index';
import type { HistoryStateAdapter, HistorySnapshot } from '../src/index';

describe('Router per-entry state', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('push() accepts a serializable state payload attached to the new entry', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'Home' }, { path: '/a', component: 'A' }] });
    await router.push('/a', { state: { scroll: 120 } });
    expect(router.entries[1].state).toEqual({ scroll: 120 });
  });

  it('back() restores the target entry state verbatim via onStateRestore, no URL round-trip', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
        { path: '/b', component: 'B' },
      ],
    });
    await router.push('/a', { state: { scroll: 120 } });
    await router.push('/b');

    const restored: unknown[] = [];
    router.onStateRestore((entry) => restored.push(entry.state));

    await router.back();

    expect(restored).toEqual([{ scroll: 120 }]);
    // Verbatim -- not round-tripped through the URL's query string the way StatefulRouter does.
    expect(location.search).toBe('');
  });

  it('setEntryState() updates the current entry state in place without navigating', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'Home' }, { path: '/a', component: 'A' }] });
    await router.push('/a');
    router.setEntryState({ scroll: 42 });

    expect(router.entries[1].state).toEqual({ scroll: 42 });
    expect(router.historyIndex).toBe(1);
  });

  it('onStateRestore returns an unsubscribe function', async () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
      ],
    });
    const listener = vi.fn();
    const unsubscribe = router.onStateRestore(listener);
    unsubscribe();

    await router.push('/a', { state: { x: 1 } });
    await router.back();

    expect(listener).not.toHaveBeenCalled();
  });

  it('persistence is pluggable via a HistoryStateAdapter -- the router never touches localStorage directly', async () => {
    const saved: HistorySnapshot[] = [];
    const adapter: HistoryStateAdapter = {
      save: vi.fn(async (entries, index) => {
        saved.push({ entries: entries.map((e) => ({ ...e })), index });
      }),
      load: vi.fn(async () => null),
    };

    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
      ],
      historyAdapter: adapter,
    });
    await router.ready;
    await router.push('/a', { state: { scroll: 5 } });

    expect(adapter.save).toHaveBeenCalled();
    const last = saved[saved.length - 1];
    expect(last.entries.map((e) => e.path)).toEqual(['/', '/a']);
    expect(last.entries[1].state).toEqual({ scroll: 5 });
    expect(last.index).toBe(1);
  });

  it('a router with no adapter configured never references window.localStorage', async () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    const router = createRouter({ routes: [{ path: '/', component: 'Home' }, { path: '/a', component: 'A' }] });
    await router.push('/a', { state: { scroll: 5 } });
    await router.back();
    await router.forward();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('restores entries + index from the adapter on construction, and fires onStateRestore', async () => {
    const snapshot: HistorySnapshot = {
      entries: [
        { path: '/', params: {} },
        { path: '/a', params: {}, state: { scroll: 77 } },
      ],
      index: 1,
    };
    const adapter: HistoryStateAdapter = {
      save: vi.fn(),
      load: vi.fn(async () => snapshot),
    };

    const restored: unknown[] = [];
    const router = createRouter({
      routes: [
        { path: '/', component: 'Home' },
        { path: '/a', component: 'A' },
      ],
      historyAdapter: adapter,
    });
    router.onStateRestore((entry) => restored.push(entry.state));

    await router.ready;

    expect(router.entries.map((e) => e.path)).toEqual(['/', '/a']);
    expect(router.historyIndex).toBe(1);
    expect(restored).toEqual([{ scroll: 77 }]);
  });
});
