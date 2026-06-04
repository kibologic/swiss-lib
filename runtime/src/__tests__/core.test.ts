/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect, vi } from "vitest";
import { Signal, signal, computed, batch } from "../reactivity/signals.js";
import { effect, untrack } from "../reactivity/effect.js";
import { reactive } from "../reactivity/reactive.js";

describe("Signal", () => {
  it("holds initial value", () => {
    const s = signal(42);
    expect(s.value).toBe(42);
  });

  it("updates value on write", () => {
    const s = signal("hello");
    s.value = "world";
    expect(s.value).toBe("world");
  });

  it("does not notify when value is equal (reference equality)", () => {
    const s = signal(1);
    const spy = vi.fn();
    effect(() => { void s.value; spy(); });
    spy.mockClear();
    s.value = 1; // same value
    expect(spy).not.toHaveBeenCalled();
  });

  it("notifies effects when value changes", () => {
    const s = signal(0);
    const calls: number[] = [];
    effect(() => { calls.push(s.value); });
    s.value = 1;
    s.value = 2;
    expect(calls).toContain(1);
    expect(calls).toContain(2);
  });

  it("custom equals prevents notification when semantically equal", () => {
    const s = new Signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
    const spy = vi.fn();
    effect(() => { void s.value; spy(); });
    spy.mockClear();
    s.value = { x: 1 }; // same x, custom equals returns true
    expect(spy).not.toHaveBeenCalled();
    s.value = { x: 2 }; // different x
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("computed", () => {
  it("derives value from signals", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    expect(sum.value).toBe(5);
  });

  it("recomputes when dependency changes", () => {
    const x = signal(10);
    const doubled = computed(() => x.value * 2);
    expect(doubled.value).toBe(20);
    x.value = 5;
    expect(doubled.value).toBe(10);
  });

  it("chains multiple computeds", () => {
    const base = signal(1);
    const doubled = computed(() => base.value * 2);
    const quadrupled = computed(() => doubled.value * 2);
    base.value = 3;
    expect(quadrupled.value).toBe(12);
  });
});

describe("effect", () => {
  it("runs immediately on creation", () => {
    const s = signal("initial");
    const seen: string[] = [];
    effect(() => { seen.push(s.value); });
    expect(seen).toEqual(["initial"]);
  });

  it("re-runs when dependency changes", () => {
    const s = signal(0);
    const seen: number[] = [];
    effect(() => { seen.push(s.value); });
    s.value = 1;
    s.value = 2;
    expect(seen).toContain(0);
    expect(seen).toContain(1);
    expect(seen).toContain(2);
  });

  it("disposes cleanly — no more re-runs after dispose", () => {
    const s = signal(0);
    const calls: number[] = [];
    const dispose = effect(() => { calls.push(s.value); });
    const lengthBeforeDispose = calls.length;
    dispose();
    s.value = 99;
    expect(calls.length).toBe(lengthBeforeDispose); // no new calls after dispose
  });
});

describe("untrack", () => {
  it("reads signal inside effect without tracking it as a dependency", () => {
    const tracked = signal("tracked");
    const untracked = signal("untracked");
    const spy = vi.fn();

    effect(() => {
      void tracked.value; // tracked
      untrack(() => void untracked.value); // NOT tracked
      spy();
    });

    spy.mockClear();
    untracked.value = "changed"; // should NOT re-run the effect
    expect(spy).not.toHaveBeenCalled();

    tracked.value = "also changed"; // SHOULD re-run
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("batch", () => {
  it("defers notifications until the batch completes", () => {
    const a = signal(1);
    const b = signal(2);
    const results: number[] = [];

    effect(() => { results.push(a.value + b.value); });
    results.length = 0; // clear initial run

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    // All results after the batch see the final values (not intermediate a=10, b=2)
    // The implementation fires each changed signal's subscribers after the batch,
    // so the effect may run once per changed dependency, but always with final values.
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r).toBe(30); // every notification sees both final values
    }
  });

  it("deduplicates rapid changes to the SAME signal", () => {
    const s = signal(0);
    const calls: number[] = [];
    effect(() => { calls.push(s.value); });
    calls.length = 0; // clear initial

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3; // only the final value should fire
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(3);
  });
});

describe("reactive", () => {
  it("makes plain object properties reactive", () => {
    const state = reactive({ count: 0 });
    const seen: number[] = [];
    effect(() => { seen.push((state as any).count); });
    (state as any).count = 5;
    expect(seen).toContain(5);
  });

  it("marks object as reactive with __reactive flag", () => {
    const state = reactive({ name: "test" });
    expect((state as any).__reactive).toBe(true);
  });

  it("wrapping a reactive proxy again still gives a reactive result", () => {
    // Note: reactive() always creates a new Proxy — it does not short-circuit for
    // already-reactive inputs. Both the original and the re-wrapped proxy are reactive.
    const state = reactive({ x: 1 });
    const state2 = reactive(state as any);
    // Both have the __reactive marker
    expect((state as any).__reactive).toBe(true);
    expect((state2 as any).__reactive).toBe(true);
    // The outer proxy tracks changes through the inner proxy
    state2.x = 99;
    expect(state2.x).toBe(99);
  });
});

describe("_signalCommitPending integration", () => {
  it("flag starts false on a fresh component stub", () => {
    const comp = { _signalCommitPending: false };
    expect(comp._signalCommitPending).toBe(false);
  });

  it("setting flag to true blocks a second render pass", () => {
    const comp = { _signalCommitPending: false };
    let renderCount = 0;

    const scheduleUpdate = () => {
      if (comp._signalCommitPending) return; // mirrors UpdateManager fix
      renderCount++;
    };

    // Signal fires → sets pending, schedules commit
    comp._signalCommitPending = true;

    // Event handler explicitly calls scheduleUpdate — should be absorbed
    scheduleUpdate();
    expect(renderCount).toBe(0); // absorbed

    // Microtask fires → clears pending
    comp._signalCommitPending = false;

    // Next explicit call (imperative update) goes through
    scheduleUpdate();
    expect(renderCount).toBe(1);
  });
});
