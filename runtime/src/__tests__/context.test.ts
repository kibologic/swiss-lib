/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SwissContext,
  createContext,
  useContext,
  consumeContext,
  cleanupContextSubscriptions,
  type SwissContextObject,
} from '../component/context.js';
import { setCurrentComponentInstance } from '../renderer/storage.js';

// ─── Minimal component stub ───────────────────────────────────────────────────

class FakeComponent {
  public context = new Map<symbol, unknown>();
  public _parent: FakeComponent | null = null;
  public scheduleUpdate = vi.fn();

  provideContext<T>(key: symbol, value: T): void {
    this.context.set(key, value);
  }

  useContext<T>(key: symbol): T | undefined {
    if (this.context.has(key)) return this.context.get(key) as T;
    let current: FakeComponent | null = this._parent;
    while (current) {
      if (current.context.has(key)) return current.context.get(key) as T;
      current = current._parent;
    }
    return undefined;
  }
}

type Comp = FakeComponent;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tree(...comps: FakeComponent[]): void {
  for (let i = 1; i < comps.length; i++) {
    comps[i]._parent = comps[i - 1];
  }
}

// ─── SwissContext.create ──────────────────────────────────────────────────────

describe('SwissContext.create', () => {
  it('returns nearest ancestor value', () => {
    const Ctx = SwissContext.create<number>();
    const [gp, parent, child] = [new FakeComponent(), new FakeComponent(), new FakeComponent()];
    tree(gp, parent, child);
    Ctx.Provider(1)(gp as unknown as Comp);
    Ctx.Provider(2)(parent as unknown as Comp);
    expect(Ctx.Consumer()(child as unknown as Comp)).toBe(2);
  });

  it('walks up past non-providing ancestors', () => {
    const Ctx = SwissContext.create<string>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider('hello')(parent as unknown as Comp);
    expect(Ctx.Consumer()(child as unknown as Comp)).toBe('hello');
  });

  it('returns undefined when no provider exists', () => {
    const Ctx = SwissContext.create<boolean>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    expect(Ctx.Consumer()(child as unknown as Comp)).toBeUndefined();
  });

  it('returns defaultValue when provider is absent', () => {
    const Ctx = SwissContext.create<number>(42);
    const comp = new FakeComponent();
    expect(Ctx.Consumer()(comp as unknown as Comp)).toBe(42);
  });

  it('provided value takes precedence over defaultValue', () => {
    const Ctx = SwissContext.create<number>(99);
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(7)(parent as unknown as Comp);
    expect(Ctx.Consumer()(child as unknown as Comp)).toBe(7);
  });

  it('isolated contexts do not bleed into each other', () => {
    const A = SwissContext.create<string>();
    const B = SwissContext.create<string>();
    const comp = new FakeComponent();
    A.Provider('alpha')(comp as unknown as Comp);
    B.Provider('beta')(comp as unknown as Comp);
    expect(A.Consumer()(comp as unknown as Comp)).toBe('alpha');
    expect(B.Consumer()(comp as unknown as Comp)).toBe('beta');
  });
});

// ─── Consumer with selector ───────────────────────────────────────────────────

describe('Consumer selector', () => {
  it('applies selector to the resolved value', () => {
    const Ctx = SwissContext.create<{ count: number }>();
    const comp = new FakeComponent();
    Ctx.Provider({ count: 5 })(comp as unknown as Comp);
    const sel = Ctx.Consumer((v) => v?.count ?? 0);
    expect(sel(comp as unknown as Comp)).toBe(5);
  });

  it('applies selector to defaultValue when no provider', () => {
    const Ctx = SwissContext.create<{ label: string }>({ label: 'default' });
    const comp = new FakeComponent();
    const sel = Ctx.Consumer((v) => v?.label ?? '');
    expect(sel(comp as unknown as Comp)).toBe('default');
  });
});

// ─── Provider subscription / scheduleUpdate ───────────────────────────────────

describe('Provider subscriptions', () => {
  it('does not call scheduleUpdate on first provide (version 0→1)', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Consumer()(child as unknown as Comp);
    Ctx.Provider(1)(parent as unknown as Comp);
    expect(child.scheduleUpdate).not.toHaveBeenCalled();
  });

  it('calls scheduleUpdate on subsequent provides when value changes', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(1)(parent as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);
    Ctx.Provider(2)(parent as unknown as Comp);
    expect(child.scheduleUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not call scheduleUpdate when value is unchanged', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(1)(parent as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);
    Ctx.Provider(1)(parent as unknown as Comp);
    expect(child.scheduleUpdate).not.toHaveBeenCalled();
  });
});

// ─── provide() helper ─────────────────────────────────────────────────────────

describe('provide() helper', () => {
  it('sets value on component and returns children unchanged', () => {
    const Ctx = SwissContext.create<string>();
    const comp = new FakeComponent();
    const children = [{ type: 'div' }] as unknown as import('../vdom/vdom.js').VNode[];
    const result = Ctx.provide('val', children, comp as unknown as Comp);
    expect(result).toBe(children);
    expect(Ctx.Consumer()(comp as unknown as Comp)).toBe('val');
  });

  it('passes null children through', () => {
    const Ctx = SwissContext.create<number>();
    const comp = new FakeComponent();
    expect(Ctx.provide(1, null, comp as unknown as Comp)).toBeNull();
  });
});

// ─── ProviderComponent ────────────────────────────────────────────────────────

describe('ProviderComponent', () => {
  it('provides value and returns children', () => {
    const Ctx = SwissContext.create<string>();
    const comp = new FakeComponent();
    const children = 'child-node' as unknown as import('../vdom/vdom.js').VNode;
    const result = Ctx.ProviderComponent(
      { value: 'jsxVal', children },
      comp as unknown as Comp,
    );
    expect(result).toBe(children);
    expect(Ctx.Consumer()(comp as unknown as Comp)).toBe('jsxVal');
  });

  it('returns null when children omitted', () => {
    const Ctx = SwissContext.create<number>();
    const comp = new FakeComponent();
    const result = Ctx.ProviderComponent({ value: 0 }, comp as unknown as Comp);
    expect(result).toBeNull();
  });
});

// ─── use() hook method ────────────────────────────────────────────────────────

describe('ctx.use()', () => {
  it('reads value the same way Consumer does', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(7)(parent as unknown as Comp);
    expect(Ctx.use(child as unknown as Comp)).toBe(7);
  });
});

// ─── Standalone createContext ──────────────────────────────────────────────────

describe('createContext()', () => {
  it('is an alias for SwissContext.create', () => {
    const Ctx = createContext<string>('fallback');
    const comp = new FakeComponent();
    expect(Ctx.use(comp as unknown as Comp)).toBe('fallback');
    Ctx.Provider('set')(comp as unknown as Comp);
    expect(Ctx.use(comp as unknown as Comp)).toBe('set');
  });

  it('returns a properly typed SwissContextObject', () => {
    const Ctx: SwissContextObject<number> = createContext<number>(0);
    const comp = new FakeComponent();
    expect(typeof Ctx.Provider).toBe('function');
    expect(typeof Ctx.Consumer).toBe('function');
    expect(typeof Ctx.provide).toBe('function');
    expect(typeof Ctx.ProviderComponent).toBe('function');
    expect(typeof Ctx.use).toBe('function');
    expect(Ctx.use(comp as unknown as Comp)).toBe(0);
  });
});

// ─── Standalone useContext ────────────────────────────────────────────────────

describe('useContext()', () => {
  it('delegates to ctx.use()', () => {
    const Ctx = createContext<string>('x');
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider('y')(parent as unknown as Comp);
    expect(useContext(Ctx, child as unknown as Comp)).toBe('y');
  });

  it('returns defaultValue when provider absent', () => {
    const Ctx = createContext<number>(99);
    const comp = new FakeComponent();
    expect(useContext(Ctx, comp as unknown as Comp)).toBe(99);
  });
});

// ─── Subscription deduplication ──────────────────────────────────────────────

describe('Subscription deduplication', () => {
  it('does not accumulate multiple unsubscribe closures across re-renders', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(1)(parent as unknown as Comp);

    // Simulate re-renders: call Consumer multiple times on the same component
    Ctx.Consumer()(child as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);

    // After cleanup, scheduleUpdate should not fire — only one subscription should exist
    cleanupContextSubscriptions(child as unknown as Comp);
    child.scheduleUpdate.mockClear();
    Ctx.Provider(2)(parent as unknown as Comp);
    expect(child.scheduleUpdate).not.toHaveBeenCalled();
  });

  it('re-subscribes correctly after cleanup', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(1)(parent as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);
    cleanupContextSubscriptions(child as unknown as Comp);

    // Re-subscribe after cleanup
    Ctx.Consumer()(child as unknown as Comp);
    child.scheduleUpdate.mockClear();
    Ctx.Provider(2)(parent as unknown as Comp);
    expect(child.scheduleUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── consume() — render-time context access ───────────────────────────────────

describe('ctx.consume()', () => {
  afterEach(() => {
    setCurrentComponentInstance(undefined);
  });

  it('reads context from currently rendering component', () => {
    const Ctx = SwissContext.create<string>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider('hello')(parent as unknown as Comp);

    setCurrentComponentInstance(child as unknown as import('../component/component.js').SwissComponent);
    expect(Ctx.consume()).toBe('hello');
  });

  it('returns defaultValue when called outside a render context', () => {
    const Ctx = SwissContext.create<number>(42);
    setCurrentComponentInstance(undefined);
    expect(Ctx.consume()).toBe(42);
  });

  it('returns undefined when no current instance and no defaultValue', () => {
    const Ctx = SwissContext.create<string>();
    setCurrentComponentInstance(undefined);
    expect(Ctx.consume()).toBeUndefined();
  });
});

// ─── consumeContext() standalone ─────────────────────────────────────────────

describe('consumeContext()', () => {
  afterEach(() => {
    setCurrentComponentInstance(undefined);
  });

  it('delegates to ctx.consume()', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(7)(parent as unknown as Comp);

    setCurrentComponentInstance(child as unknown as import('../component/component.js').SwissComponent);
    expect(consumeContext(Ctx)).toBe(7);
  });

  it('returns defaultValue when no current instance', () => {
    const Ctx = createContext<string>('fallback');
    setCurrentComponentInstance(undefined);
    expect(consumeContext(Ctx)).toBe('fallback');
  });
});

// ─── cleanupContextSubscriptions ─────────────────────────────────────────────

describe('cleanupContextSubscriptions()', () => {
  it('unsubscribes component from context updates after cleanup', () => {
    const Ctx = SwissContext.create<number>();
    const [parent, child] = [new FakeComponent(), new FakeComponent()];
    tree(parent, child);
    Ctx.Provider(1)(parent as unknown as Comp);
    Ctx.Consumer()(child as unknown as Comp);
    cleanupContextSubscriptions(child as unknown as Comp);
    child.scheduleUpdate.mockClear();
    Ctx.Provider(2)(parent as unknown as Comp);
    expect(child.scheduleUpdate).not.toHaveBeenCalled();
  });

  it('is safe to call when component has no subscriptions', () => {
    const comp = new FakeComponent();
    expect(() => cleanupContextSubscriptions(comp as unknown as Comp)).not.toThrow();
  });
});
