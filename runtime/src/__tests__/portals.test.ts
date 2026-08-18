/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-006-capability-build-portals-refs: portals.ts had zero tests before this file.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { createPortal, useSlot } from "../component/portals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("createPortal()", () => {
  it("renders content into the target container, not the calling component's own DOM position", async () => {
    const portalTarget = document.createElement("div");
    portalTarget.id = "portal-target";
    document.body.appendChild(portalTarget);

    class WithPortal extends SwissComponent {
      mounted() {
        createPortal(jsx("span", { children: "portal content" }), portalTarget);
      }
      render() {
        return jsx("div", { class: "in-place", children: "in-place content" });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(WithPortal, {}), container);
    await flush();

    // The component's own render output lands in `container`, as normal.
    expect(container.querySelector(".in-place")?.textContent).toBe("in-place content");
    // The portal content lands in the TARGET, not `container`.
    expect(container.querySelector("span")).toBeNull();
    expect(portalTarget.querySelector("span")?.textContent).toBe("portal content");
  });

  it("the returned cleanup function removes the content and can be called directly", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const cleanup = createPortal(jsx("p", { children: "hi" }), target);
    expect(target.querySelector("p")).not.toBeNull();

    cleanup();
    expect(target.innerHTML).toBe("");
  });

  it("is a safe no-op with a working cleanup function when document is unavailable", () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error -- deliberately simulating an SSR/no-DOM environment for this one call.
    delete globalThis.document;
    try {
      const cleanup = createPortal(jsx("p", {}), null as unknown as HTMLElement);
      expect(() => cleanup()).not.toThrow();
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("registers on the owning component instance and cleans up automatically on unmount", async () => {
    // createPortal MUST be called during synchronous render() for this to work --
    // getCurrentComponentInstance() (renderer/storage.js), the only way createPortal
    // learns which instance to register itself on, is only non-null during synchronous
    // render execution (the same constraint useSlot's own doc comment states explicitly).
    // Calling it from mounted() or another lifecycle hook is exactly the "called outside a
    // component render (e.g. imperatively)" case portals.ts's own docstring already
    // documents as the caller's own responsibility to clean up -- confirmed by first
    // writing this test calling createPortal from mounted() and watching it fail: the
    // portal rendered correctly but was never auto-cleaned on unmount, because `instance`
    // was undefined at registration time and the `if (instance)` guard silently skipped
    // adding it to `_portals` at all.
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);

    let comp: WithPortal | null = null;
    class WithPortal extends SwissComponent {
      constructor(p: unknown) { super(p as never); comp = this; }
      render() {
        createPortal(jsx("span", { children: "portal content" }), portalTarget);
        return jsx("div", {});
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(WithPortal, {}), container);
    await flush();
    expect(portalTarget.querySelector("span")).not.toBeNull();

    // Unmount the owning component by replacing what it's rendered into. component-
    // lifecycle.ts's unmountComponent() walks `_portals` and clears every registered
    // container automatically -- the app does not have to track and call each portal's
    // own cleanup function itself when the whole component goes away.
    (comp as unknown as { unmountComponent: () => void }).unmountComponent();

    expect(portalTarget.innerHTML).toBe("");
  });
});

describe("useSlot()", () => {
  it("returns the VNode[] projected into a named slot from the parent", async () => {
    class Inner extends SwissComponent {
      render() {
        return jsx("div", { class: "slot-out", children: useSlot("header") as never });
      }
    }
    class Outer extends SwissComponent {
      render() {
        return jsx(Inner, { children: jsx("h1", { slot: "header", children: "Title" }) });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Outer, {}), container);
    await flush();

    expect(container.querySelector(".slot-out h1")?.textContent).toBe("Title");
  });

  it("returns an empty array for a slot name with no projected content", async () => {
    let captured: unknown[] | null = null;
    class Inner extends SwissComponent {
      render() {
        captured = useSlot("does-not-exist");
        return jsx("div", {});
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Inner, {}), container);
    await flush();

    expect(captured).toEqual([]);
  });

  it("returns an empty array (not a throw) when called outside a component render", () => {
    expect(useSlot("anything")).toEqual([]);
  });
});
