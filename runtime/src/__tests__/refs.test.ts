/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-006-capability-build-portals-refs: refs.ts had zero tests before this file.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { ref } from "../component/refs.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("ref()", () => {
  it("resolves to the mounted DOM element", async () => {
    const inputRef = ref<HTMLInputElement>();
    class Form extends SwissComponent {
      render() {
        return jsx("input", { ref: inputRef, type: "text" });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Form, {}), container);
    await flush();

    expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
    expect(inputRef.current).toBe(container.querySelector("input"));
  });

  it("starts as null before mount", () => {
    const r = ref<HTMLElement>();
    expect(r.current).toBeNull();
  });

  it("survives a re-render that updates the same element in place", async () => {
    const inputRef = ref<HTMLInputElement>();
    let comp: Form | null = null;
    class Form extends SwissComponent {
      state = { value: "a" } as { value: string };
      constructor(p: unknown) { super(p as never); comp = this; }
      render() {
        return jsx("input", { ref: inputRef, type: "text", value: this.state.value });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Form, {}), container);
    await flush();
    const firstElement = inputRef.current;
    expect(firstElement).not.toBeNull();

    comp!.state.value = "b";
    await flush();

    // Same DOM node reused across an in-place update -- reconcileProps updates its value
    // attribute, dom-creation.ts's createElementNode (where ref.current gets set) never
    // runs again because no new element was created.
    expect(inputRef.current).toBe(firstElement);
  });

  it("is cleared to null once its element unmounts (removed from a reconciled list)", async () => {
    // A top-level container-content swap (component -> plain element, or vice versa) takes
    // a different, container.innerHTML='' fast path (renderer.ts's isStaticContent branch)
    // that bypasses cleanupNode entirely -- a separate, broader gap than this task's scope
    // (types.ts's cleanupNode is the one and only place a ref gets cleared; it not running
    // at all is an orthogonal defect in the top-level replace path, not a ref-specific
    // one). Removing an item from a reconciled list is the path that reliably goes through
    // cleanupNode (reconciliation.ts / dom-updates.ts both call it directly), so that's
    // what this test exercises.
    const itemRef = ref<HTMLElement>();
    let comp: List | null = null;
    class List extends SwissComponent {
      state = { items: ["a", "b"] } as { items: string[] };
      constructor(p: unknown) { super(p as never); comp = this; }
      render() {
        return jsx("div", {
          children: this.state.items.map((it) =>
            jsx("span", { ref: it === "b" ? itemRef : undefined, children: it })),
        });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(List, {}), container);
    await flush();
    expect(itemRef.current).not.toBeNull();
    expect(itemRef.current!.textContent).toBe("b");

    comp!.state.items = ["a"];
    await flush();

    // Before the fix: nothing on the removal path (types.ts's cleanupNode) ever cleared a
    // ref, only dom-creation.ts's createElementNode SET one on creation. itemRef.current
    // would still point at a node that is no longer in the document -- container.contains
    // would be false, but nothing about the ref object itself revealed that without the
    // caller separately checking .isConnected, which defeats the point of a ref reporting
    // liveness at all.
    expect(itemRef.current).toBeNull();
  });

  it("does not clear a ref that has already been reassigned to a newer element", async () => {
    // Guards the fix's own "only clear if it's still pointing at THIS element" condition --
    // a rapid remount where component B's element claims the ref before component A's old
    // element is cleaned up must not let A's stale cleanup null out B's live assignment.
    const sharedRef = ref<HTMLElement>();
    class A extends SwissComponent {
      render() { return jsx("span", { ref: sharedRef, children: "a" }); }
    }
    class B extends SwissComponent {
      render() { return jsx("span", { ref: sharedRef, children: "b" }); }
    }
    const containerA = document.createElement("div");
    const containerB = document.createElement("div");
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);

    renderToDOM(jsx(A, {}), containerA);
    await flush();
    const aElement = sharedRef.current;
    expect(aElement).not.toBeNull();

    // B claims the ref before A is torn down.
    renderToDOM(jsx(B, {}), containerB);
    await flush();
    const bElement = sharedRef.current;
    expect(bElement).not.toBe(aElement);

    // Now tear down A. Its cleanup must not clobber B's live assignment.
    renderToDOM(jsx("div", { children: "gone" }), containerA);
    await flush();

    expect(sharedRef.current).toBe(bElement);
  });
});
