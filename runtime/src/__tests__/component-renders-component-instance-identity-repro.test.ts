/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-002 — instance-identity coherence for component-renders-component (shared DOM node).
//
// An ErrorBoundary-style wrapper renders its single child component DIRECTLY (no wrapping
// element), so the outer (Boundary) and the inner (Engine) map to the SAME DOM node. The
// runtime keeps a single-slot `componentInstances` registry per node plus a
// `domToHostComponent` "host" slot. When a top-level prop flip drives repeated in-place
// updates through this shared node, the registry must keep the ONE mounted Engine instance
// (the one whose mounted() ran and that owns any real event listeners) as the instance that
// (a) owns the node and (b) keeps receiving renders.
//
// The pre-fix bug: after a couple of top-driven updates the reconciler lost the mounted
// Engine (its registry slot was clobbered by the outer Boundary and the durable rendered-
// output tag was not maintained), fell into updateComponentNode's "no existing instance"
// branch, and CONSTRUCTED A SECOND, NEVER-MOUNTED "phantom" Engine that rendered the visible
// content while the originally-mounted Engine (holding the listeners) went stale. Symptom in
// the office study-reader: scroll/mouseup highlight listeners belonged to the stale instance
// while a phantom repainted — instance-identity incoherence.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { componentInstances, domToHostComponent } from "../renderer/storage.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("FRAME-002 component-renders-component instance identity", () => {
  it("the single mounted inner instance owns the shared node and keeps updating (no phantom)", async () => {
    const constructed: SwissComponent[] = [];
    const mountedArr: SwissComponent[] = [];
    const renderedArr: SwissComponent[] = [];
    let app: App | null = null;

    class Engine extends SwissComponent {
      readonly seq: number;
      constructor(p: unknown) {
        super(p as never);
        this.seq = constructed.length;
        constructed.push(this);
      }
      mounted() {
        mountedArr.push(this);
      }
      render() {
        renderedArr.push(this);
        const tick = (this.props as { tick?: number }).tick ?? 0;
        return jsx("div", { class: "engine", children: `tick=${tick}` });
      }
    }

    // ErrorBoundary-style passthrough: returns its single child component DIRECTLY, so the
    // Boundary and the Engine share one DOM node (component-renders-component).
    class Boundary extends SwissComponent {
      render() {
        const children = (this.props as { children?: unknown[] }).children ?? [];
        return children.length === 1 ? (children[0] as never) : jsx("div", { children });
      }
    }

    class App extends SwissComponent {
      state = { tick: 0 } as { tick: number };
      constructor(p: unknown) {
        super(p as never);
        app = this;
      }
      render() {
        return jsx("div", {
          class: "viewport",
          children: [
            jsx(Boundary, { children: [jsx(Engine, { tick: this.state.tick })] }),
          ],
        });
      }
    }

    const container = document.createElement("div");
    container.id = "app";
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();

    const node = container.querySelector(".engine") as HTMLElement;
    expect(node).toBeTruthy();
    expect(node.textContent).toBe("tick=0");
    expect(constructed.length).toBe(1);
    expect(mountedArr.length).toBe(1);
    const mountedEngine = mountedArr[0];

    // The shared DOM node must resolve to the mounted Engine (via the direct registry or the
    // host slot) — never to a different-typed or phantom instance.
    const ownerAfterMount = componentInstances.get(node) ?? domToHostComponent.get(node);
    expect(ownerAfterMount).toBe(mountedEngine);

    // Drive several top-level prop flips through the shared node.
    for (const tick of [1, 2, 3, 4, 5]) {
      app!.state.tick = tick;
      await flush();
      const live = container.querySelector(".engine") as HTMLElement;
      expect(live.textContent).toBe(`tick=${tick}`);
    }

    // No phantom instance was ever constructed, and nothing else mounted.
    expect(constructed.length).toBe(1);
    expect(mountedArr.length).toBe(1);

    // Every render came from the ONE mounted instance — the mounted Engine is the instance
    // that keeps receiving updates (no stale/phantom split).
    const distinct = Array.from(new Set(renderedArr.map((e) => (e as Engine).seq)));
    expect(distinct).toEqual([mountedEngine.seq]);

    // And it still owns the (same) shared DOM node after all the updates.
    const liveNode = container.querySelector(".engine") as HTMLElement;
    const ownerAfterUpdates = componentInstances.get(liveNode) ?? domToHostComponent.get(liveNode);
    expect(ownerAfterUpdates).toBe(mountedEngine);
  });
});
