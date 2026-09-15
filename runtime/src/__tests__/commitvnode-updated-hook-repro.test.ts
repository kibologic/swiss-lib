/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-commitvnode-updated-hook: commitVNode (component.ts) is the DOM-commit path used
// for reactive state writes -- reactivity-setup.ts queues a microtask that calls
// commitVNode directly on every state change after the first. Unlike UpdateManager's
// performUpdate() (update-manager.ts), which runs the "updated" lifecycle hook phase
// after every commit branch, commitVNode committed to the DOM and simply returned,
// never running "updated" at all. So `this.on('updated', cb)` was silently dead for any
// component whose re-renders are driven by state writes rather than an explicit
// scheduleUpdate()/performUpdate() call -- the office PdfViewerPage/ProseEngine/
// ReaderEngine bugs this fixes.
//
// These tests exercise the *real* mount -> state-write -> microtask-commit pipeline
// (renderToDOM + a reactive `state` field), not a stubbed commitVNode, so they only pass
// once commitVNode itself fires the hook.

import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  // The reactive-write commit path is one queueMicrotask hop past the signal effect;
  // give it a couple of turns plus a macrotask so any chained scheduling settles too.
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

interface CounterState {
  count: number;
}

// A fresh class per call: each test gets its own component identity so nothing about
// vnode/instance reuse across a shared class (e.g. reconciliation identity caching) can
// leak state from one test's mount into another's.
function mountCounter(container: HTMLElement): SwissComponent<Record<string, never>, CounterState> {
  let instance: SwissComponent<Record<string, never>, CounterState> | null = null;
  class Counter extends SwissComponent<Record<string, never>, CounterState> {
    constructor(props: never) {
      super(props);
      instance = this;
    }
    render() {
      return jsx("span", { id: "val", children: String(this.state.count ?? 0) });
    }
  }
  renderToDOM(jsx(Counter, {}), container);
  if (!instance) throw new Error("Counter did not mount");
  return instance;
}

describe("commitVNode fires the 'updated' hook (reactive state-write commit path)", () => {
  it("runs an on('updated') callback after a state-write-driven commit, with the DOM already reflecting the new state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const counter = mountCounter(container);

    let seenTextAtHookTime: string | null = null;
    let calls = 0;
    counter.on("updated", () => {
      calls++;
      seenTextAtHookTime = container.querySelector("#val")!.textContent;
    });

    expect(calls).toBe(0);

    // Drive the update via a reactive state write (NOT scheduleUpdate()/performUpdate()) so
    // this goes through the signal effect -> queueMicrotask -> commitVNode path.
    counter.state.count = 1;

    await flush();

    expect(calls).toBeGreaterThanOrEqual(1);
    // The hook must see the DOM AFTER the commit, not before.
    expect(seenTextAtHookTime).toBe("1");
  });

  it("does not fire 'updated' for the component's own initial mount commit", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let mountUpdatedCalls = 0;
    class Announcer extends SwissComponent {
      constructor(props: never) {
        super(props);
        this.on("updated", () => {
          mountUpdatedCalls++;
        });
      }
      render() {
        return jsx("div", { children: "hi" });
      }
    }

    renderToDOM(jsx(Announcer, {}), container);
    await flush();

    expect(mountUpdatedCalls).toBe(0);
  });

  it("fires 'updated' exactly once per state-write-driven commit", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const counter = mountCounter(container);

    const spy = vi.fn();
    counter.on("updated", spy);

    counter.state.count = 1;
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);

    counter.state.count = 2;
    await flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not loop unboundedly when an 'updated' hook itself writes state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const counter = mountCounter(container);

    let hookRuns = 0;
    counter.on("updated", () => {
      hookRuns++;
      // Adversarial: writing state from inside 'updated' re-triggers the same commit
      // path. Without a throttle guard this recurses/loops without ever settling.
      counter.state.count = ((counter.state.count as number) ?? 0) + 1;
    });

    counter.state.count = 1;

    // Give it a generous but bounded number of flush cycles. If this test times out
    // (vitest's default per-test timeout) instead of settling, the loop is unbounded.
    for (let i = 0; i < 50; i++) {
      await flush();
    }

    // The framework's per-second commit-hook budget (UpdateManager.MAX_UPDATES_PER_SECOND,
    // shared shape with performUpdate's own render throttle) must have kicked in well
    // before an unbounded number of hook firings.
    expect(hookRuns).toBeGreaterThan(0);
    expect(hookRuns).toBeLessThan(1000);
  });

  it("does not fire 'updated' when commitVNode early-returns (nothing committed)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    class Idle extends SwissComponent {
      render() {
        return jsx("div", {});
      }
    }
    const comp = new Idle({} as never);
    const spy = vi.fn();
    comp.on("updated", spy);

    // _mounting guard: commitVNode must bail out before ever considering the hook.
    (comp as unknown as { _mounting: boolean })._mounting = true;
    comp.commitVNode(jsx("div", {}));
    expect(spy).not.toHaveBeenCalled();

    // No container and no existing DOM: the other early-return guard.
    (comp as unknown as { _mounting: boolean })._mounting = false;
    comp.commitVNode(jsx("div", {}));
    expect(spy).not.toHaveBeenCalled();
  });
});
