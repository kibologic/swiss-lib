/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-updated-hook-child-components: dom-updates.ts's updateComponentNode is the commit
// path a PARENT's own reconciliation takes when it revisits an already-mounted CHILD
// component's vnode position. It calls renderComponentFn() (component-rendering.ts)
// directly under `untrack()` -- so it never establishes or refreshes the child's OWN
// render-effect subscriptions -- and writes the child's `_vnode`/`_domNode` bookkeeping
// and patches the DOM via applyRenderedOutput, all without ever calling
// executeHookPhase("updated") on the child. Neither of the child's own two commit
// strategies (component.ts's commitVNode, update-manager.ts's performUpdate -- both fixed
// by PR #134 / FRAME-commitvnode-updated-hook to fire "updated" after every real commit)
// ever runs in this scenario, because nothing the child's OWN reactive effect is
// subscribed to changed -- the branch flip is driven entirely by a plain, non-reactive flag
// the PARENT controls directly (no Signal/reactive-proxy write on the child's side at all),
// read via `untrack()` inside the parent-driven render call. This is deliberately
// constructed to isolate updateComponentNode as the ONLY commit for this transition, since
// synthetic repros that route the flip through a Signal or `reactive()` write on the child
// (state field, or a merged prop) end up ALSO retriggering the child's own render effect
// through its pre-existing subscription -- which then commits (and fires the hook) via
// commitVNode independently, masking this specific gap.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { ref } from "../component/refs.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("'updated' fires for a CHILD component whose re-render is committed ONLY by its PARENT's reconciliation (updateComponentNode)", () => {
  it("fires 'updated' on the child when the parent's own re-render is the sole commit for the child's loading->loaded branch swap", async () => {
    const contentRef = ref();
    let updatedCalls = 0;
    let updatedCallsAtRefTime: number[] = [];
    let child: SwissComponent | null = null;

    // A plain, non-reactive flag: mutating it does NOT notify any effect. Only a parent
    // re-render that happens to call the child's render() again (untracked) will ever see
    // the new value.
    const sharedFlag = { loading: true };

    class Child extends SwissComponent {
      constructor(props: never) {
        super(props);
        child = this;
        // Mirrors the compiled shape of a `.uix` `mount { this.on('updated', ...) }` block.
        this.on("mounted", () => {
          this.on("updated", () => {
            updatedCalls++;
            updatedCallsAtRefTime.push(contentRef.current ? 1 : 0);
          });
        });
      }

      render() {
        if (sharedFlag.loading) {
          return jsx("div", { class: "child", children: [jsx("span", { children: "loading" })] });
        }
        return jsx("div", {
          class: "child",
          children: [jsx("section", { ref: contentRef, children: "loaded" })],
        });
      }
    }

    let parent: SwissComponent<Record<string, never>, { tick: number }> | null = null;
    class Parent extends SwissComponent<Record<string, never>, { tick: number }> {
      state: { tick: number } = { tick: 0 };
      constructor(props: never) {
        super(props);
        parent = this;
      }
      render() {
        // Parent's OWN state (tick) drives this re-render; the CHILD's branch depends on
        // `sharedFlag`, which the child's own render effect never subscribes to (plain
        // object, no Signal/reactive-proxy read).
        return jsx("div", { class: `parent tick-${this.state.tick}`, children: [jsx(Child, {})] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    await flush();

    if (!child) throw new Error("Child did not mount");
    if (!parent) throw new Error("Parent did not mount");
    expect(container.querySelector(".child span")?.textContent).toBe("loading");
    expect(updatedCalls).toBe(0);

    // Flip the flag the child's render() reads (untracked -- no notification), then force
    // a PARENT re-render (App.uix's own state churn, unrelated to the child) that reconciles
    // the child's vnode. This is the ONLY commit that will ever reflect the new branch.
    sharedFlag.loading = false;
    parent.state.tick = 1;
    parent.update();
    await flush();

    expect(container.querySelector(".child section")?.textContent).toBe("loaded");
    expect(contentRef.current).not.toBeNull();
    expect(updatedCalls).toBeGreaterThanOrEqual(1);
    // The hook must observe the DOM/ref AFTER the commit, not before.
    expect(updatedCallsAtRefTime.some((v) => v === 1)).toBe(true);
  });
});
