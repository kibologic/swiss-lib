/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Regression test for the "click produces no response" bug.
//
// dom-creation.ts arms `_skipNextUpdate` on a child component right after initialize(), so the
// single redundant update that can immediately follow creation is a no-op. But that flag is only
// ever consumed by the explicit performUpdate() path — the signal-driven commitVNode() path
// never clears it. When the redundant post-init update never arrived (the common case), the flag
// lingered indefinitely and silently swallowed the NEXT real explicit update to that child.
//
// Live symptom: clicking a nav icon set parent state, the parent re-rendered and pushed new props
// to a child (e.g. an AppStrip button's active class), that child's first explicit update was
// eaten by the stale flag → no visible change; the same click again worked (flag now consumed);
// a full reload fixed it (fresh components). Independent of reconcileChildren, so it reproduced
// on every core version regardless of the insertion-anchor fixes.
//
// The fix (armPostInitSkip) scopes the flag to the synchronous creation tick via a microtask
// clear: the intended synchronous post-create skip still happens, but the flag cannot survive
// into a later tick to drop a genuine user-driven update.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flushMicrotasks = async () => {
  // Two turns: one for the armPostInitSkip clear microtask, one for anything it chains.
  await Promise.resolve();
  await Promise.resolve();
};

describe("_skipNextUpdate must not outlive the child-creation tick", () => {
  it("delivers a later explicit update to a freshly-created child instead of silently dropping it", async () => {
    let leaf: Leaf | null = null;

    class Leaf extends SwissComponent {
      public renders = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(props: any) {
        super(props);
        leaf = this;
      }
      render() {
        this.renders++;
        return jsx("div", { class: "leaf", children: String(this.renders) });
      }
    }

    class Host extends SwissComponent {
      render() {
        return jsx("div", { class: "host", children: [jsx(Leaf, {})] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    // Mount: creates the Leaf child through the real dom-creation path, which arms the
    // post-init skip on it.
    renderToDOM(jsx(Host, {}), container);
    expect(leaf).not.toBeNull();
    const rendersAfterMount = leaf!.renders;
    expect(rendersAfterMount).toBeGreaterThan(0);

    // Simulate the user acting a tick later (the click does not happen in the same synchronous
    // frame as the child's creation). The fix's microtask clear runs here.
    await flushMicrotasks();

    // Core invariant of the fix: the skip flag must not have survived the creation tick.
    // Without the fix this is still `true` (dom-creation set it with no clear), and the update
    // below is swallowed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((leaf as any)._skipNextUpdate).toBe(false);

    // A real explicit update (the click-driven path). A child component's scheduleUpdate runs
    // performUpdate synchronously — it must actually render, not no-op.
    const before = leaf!.renders;
    leaf!.scheduleUpdate();
    expect(leaf!.renders).toBeGreaterThan(before);
  });
});
