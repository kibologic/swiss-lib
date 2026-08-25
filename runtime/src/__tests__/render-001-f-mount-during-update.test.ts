/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
//
// RENDER-001-F: a SwissComponent first given real DOM DURING a reactive update never
// establishes a live render effect (ReactivityManager.setupReactivity,
// runtime/src/component/reactivity-setup.ts) -- it renders once and then ignores every
// later signal/state change to itself.
//
// Originally attributed (swiss-lib PR #109) via a <Suspense> boundary un-suspending and
// swapping fallback -> children. Suspense/async are NOT on this branch (development at
// checkout time), so this test reproduces the underlying mechanism with primitives that
// ARE present: a parent whose render conditionally mounts a child DURING a reactive
// update (i.e. NOT on the initial synchronous mount pass), driven purely by the real
// reactive-state -> effect -> commit pipeline (no explicit scheduleUpdate() calls,
// mirroring stuck-loading-child-prop-repro.test.ts).
//
// Two variants:
//  (A) Child reads a plain signal() (module-level, not `state`) -- the exact shape
//      called out in the task ("no resource").
//  (B) Child reads its own `state` (reactive proxy) -- the shape already covered by
//      stuck-loading-child-prop-repro.test.ts's mechanism, kept here for direct
//      side-by-side comparison against the mount-during-update trigger.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("RENDER-001-F: component mounted during a reactive update must get a live effect", () => {
  it("(A) Child mounted when parent's `show` flips true reacts to its OWN later plain-signal changes", async () => {
    const s = signal(0);

    class Child extends SwissComponent {
      render() {
        return jsx("div", { class: "child", children: String(s.value) });
      }
    }

    let parent: ParentImpl | null = null;
    class ParentImpl extends SwissComponent {
      state = { show: false } as { show: boolean };
      constructor(p: unknown) {
        super(p as never);
        parent = this;
      }
      render() {
        return jsx("div", {
          class: "wrap",
          children: this.state.show ? [jsx(Child, {})] : [],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    renderToDOM(jsx(ParentImpl, {}), container);
    await flush();

    // Baseline: Child does not exist until `show` flips -- it is NOT part of the initial
    // synchronous mount pass. It must be created by a later reactive UPDATE.
    expect(container.querySelector(".child")).toBeNull();

    // Flip `show` via the real reactive-state pipeline (no explicit scheduleUpdate()),
    // exactly like stuck-loading-child-prop-repro.test.ts. This is an UPDATE, not the
    // initial mount -- Child is created and given real DOM inside this reconciliation pass.
    parent!.state.show = true;
    await flush();

    expect(container.querySelector(".child")?.textContent).toBe("0");

    // The defect: Child, mounted DURING this update, must still react to ITS OWN later
    // signal changes through the real reactive pipeline (no explicit scheduleUpdate()).
    s.value = 5;
    await flush();

    expect(
      container.querySelector(".child")?.textContent,
      "Child mounted during a parent update must still have a live render effect for its own plain signal",
    ).toBe("5");
  });

  it("(B) Child mounted when parent's `show` flips true reacts to its OWN later `state` changes", async () => {
    let child: Child | null = null;

    class Child extends SwissComponent {
      state = { n: 0 } as { n: number };
      constructor(p: unknown) {
        super(p as never);
        child = this;
      }
      render() {
        return jsx("div", { class: "child", children: String(this.state.n) });
      }
    }

    let parent: ParentImpl | null = null;
    class ParentImpl extends SwissComponent {
      state = { show: false } as { show: boolean };
      constructor(p: unknown) {
        super(p as never);
        parent = this;
      }
      render() {
        return jsx("div", {
          class: "wrap",
          children: this.state.show ? [jsx(Child, {})] : [],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    renderToDOM(jsx(ParentImpl, {}), container);
    await flush();

    expect(container.querySelector(".child")).toBeNull();
    expect(child).toBeNull();

    parent!.state.show = true;
    await flush();

    expect(child, "Child must have been constructed by the update").not.toBeNull();
    expect(container.querySelector(".child")?.textContent).toBe("0");

    child!.state.n = 5;
    await flush();

    expect(
      container.querySelector(".child")?.textContent,
      "Child mounted during a parent update must still have a live render effect for its own state",
    ).toBe("5");
  });

  it("(C) component type-swapped in during an update (Fallback -> Real, the Suspense shape) reacts to its own later signal", async () => {
    const s = signal(0);

    class Fallback extends SwissComponent {
      render() {
        return jsx("div", { class: "fallback", children: "loading" });
      }
    }
    class Real extends SwissComponent {
      render() {
        return jsx("div", { class: "real", children: String(s.value) });
      }
    }

    let parent: ParentImpl | null = null;
    class ParentImpl extends SwissComponent {
      state = { show: false } as { show: boolean };
      constructor(p: unknown) {
        super(p as never);
        parent = this;
      }
      render() {
        return jsx("div", {
          class: "wrap",
          children: [this.state.show ? jsx(Real, {}) : jsx(Fallback, {})],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    renderToDOM(jsx(ParentImpl, {}), container);
    await flush();
    expect(container.querySelector(".fallback")).not.toBeNull();
    expect(container.querySelector(".real")).toBeNull();

    // This hits reconciliation.ts's type-swap ("different types") branch (~L411,
    // createDOMNodeFn + parent.replaceChild) -- the closest non-Suspense analogue to
    // Suspense's renderWithBoundary fallback -> children remount.
    parent!.state.show = true;
    await flush();

    expect(container.querySelector(".real")?.textContent).toBe("0");

    s.value = 5;
    await flush();

    expect(
      container.querySelector(".real")?.textContent,
      "Real, type-swapped in during an update, must react to its own later plain signal",
    ).toBe("5");
  });
});
