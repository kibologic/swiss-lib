/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FABLE-RENDER-001 D3 (RENDER-001-E): a component whose render() returns `null` while data is
// not yet ready, then real content once it arrives, never shows that content -- the exact shape
// of `renderBody() { return !r ? null : (<div class="alp-side-modal-body">...</div>) }` in
// RFQInbox (a second click on the same row is what actually renders it, since a *third* render
// gets a stable, already-non-null-typed DOM node to patch).
//
// Root cause: component-rendering.ts's renderComponent(), on a null/undefined render, returns a
// placeholder `<span style="display:none" data-swiss-null>` instead of null (comment: "returning
// placeholder to maintain instance tracking") -- and assigns the OLD dom (there is none yet on
// first mount, but there is after this first commit) onto the placeholder. On the NEXT render,
// once `rendered` is a real vnode, update-strategies.ts's updateWithDomNode/updateChildComponent
// call updateDOMNode(oldDom, newVNode) unconditionally -- neither checks whether oldDom's tag
// matches newVNode.type. dom-updates.ts's updateDOMNode has no such check either: it dispatches
// straight to updateElementNodeFn(dom, vnode, oldVNode) regardless of whether `dom` is even the
// same element type as `vnode`. So the real content's children get reconciled as if patching
// *into* the leftover placeholder `<span>`, using the placeholder's vnode (children: []) as the
// diff baseline -- and reconcileChildren, diffing the real content's children against an empty
// old-children list inside a node the new vnode never actually describes, does not correctly
// grow that node into what render() asked for on this transition. Confirmed below.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

describe("FABLE-RENDER-001 D3 — a render() that returns null, then real content, must show that content", () => {
  it("shows real content immediately once data arrives after a null first render", async () => {
    let panel: DetailPanel | null = null;

    class DetailPanel extends SwissComponent {
      public record: { title: string } | null = null;
      constructor(props: object) {
        super(props);
        panel = this;
      }
      render() {
        const r = this.record;
        // The exact RFQInbox shape: `!r ? null : (...)`.
        return !r
          ? null
          : jsx("div", {
              class: "alp-side-modal-body",
              children: [jsx("span", { children: r.title })],
            });
      }
    }

    class Host extends SwissComponent {
      render() {
        return jsx("div", {
          class: "alp-side-modal",
          children: [jsx(DetailPanel, {})],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    // Mount while the record hasn't loaded yet -- render() returns null.
    renderToDOM(jsx(Host, {}), container);
    expect(panel).not.toBeNull();

    // The real RFQInbox timing: data arrives from an async fetch, strictly later than the
    // synchronous creation tick -- not in the same microtask turn. dom-creation.ts arms
    // _skipNextUpdate right after a child's initialize(), intentionally absorbing exactly one
    // redundant same-tick update; armPostInitSkip clears it via its own microtask so it cannot
    // outlive that tick (see skip-next-update-repro.test.ts). Two turns lets that clear run
    // before this test's own explicit update, matching how a real await-based fetch behaves.
    await Promise.resolve();
    await Promise.resolve();

    // Data arrives (the async load RFQInbox's own click handler triggers). Real render() call.
    panel!.record = { title: "RFQ-1042" };
    panel!.scheduleUpdate();

    const body = container.querySelector(".alp-side-modal-body");
    expect(body).not.toBeNull();
    // The live symptom, verbatim: the slide-over shell renders, but the body has zero children.
    expect(body!.children.length).toBeGreaterThan(0);
    expect(body!.textContent).toBe("RFQ-1042");
  });
});
