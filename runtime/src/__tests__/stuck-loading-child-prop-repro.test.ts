/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Regression test for the platform-wide "stuck loading" bug
// (registry/fable/loading-state/INVESTIGATION-LOG.md).
//
// Two related defects fixed together:
// 1. dom-updates.ts's updateComponentNode wholesale-replaced `existingInstance.props =
//    vnode.props` before calling renderComponentFn — discarding the reactive proxy the
//    child's OWN setupReactivity() effect was subscribed to, contradicting
//    renderComponentImpl's own per-key merge (component-rendering.ts) which exists
//    specifically to preserve that linkage ("Replacing the whole object would lose
//    Signal tracking established by the render effect").
// 2. component.ts's commitVNode() was the only commit strategy (vs.
//    update-strategies.ts's updateWithDomNode/updateChildComponent/handleNoUpdatePath/
//    updateRootComponent) that didn't wrap its updateDOMNode() call in untrack().
//
// This reproduces the exact shape of the live bug: a parent pushes a `loading: true ->
// false` prop into an already-mounted child across repeated parent re-renders (the
// DataTable/ReportsHub pattern this was found in).
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); } };

describe("stuck-loading child prop push (registry/fable/loading-state/)", () => {
  it("child reflects a parent-pushed loading->loaded prop transition on every pass", async () => {
    let parent: Parent | null = null;

    class Child extends SwissComponent {
      render() {
        const loading = (this.props as { loading?: boolean }).loading;
        return jsx("div", { class: "child", children: loading ? "Loading…" : "Loaded" });
      }
    }
    class Parent extends SwissComponent {
      state = { loading: true } as { loading: boolean };
      constructor(p: unknown) { super(p as never); parent = this; }
      render() {
        return jsx("div", { class: "wrap", children: [jsx(Child, { loading: this.state.loading })] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    await flush();
    expect(container.querySelector(".child")?.textContent).toBe("Loading…");

    // Repeat the loading -> loaded -> loading -> loaded cycle several times: the live bug
    // was intermittent (worked "eventually" after enough retries), so a single transition
    // passing is not sufficient evidence — the defect must not reproduce across repeats.
    for (let i = 0; i < 5; i++) {
      parent!.state.loading = false;
      await flush();
      expect(container.querySelector(".child")?.textContent).toBe("Loaded");

      parent!.state.loading = true;
      await flush();
      expect(container.querySelector(".child")?.textContent).toBe("Loading…");
    }
  });
});
