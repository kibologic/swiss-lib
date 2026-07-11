/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Regression test for a real bug found live in alpine-erp/modules/users/src/pages/UsersPage.uix:
// a <div class="alp-record-header"> already correctly present in the DOM (committed by an
// earlier, independent update cycle) was silently deleted by a LATER reconcileChildren() call,
// with no error thrown, even though both the old and new vnode trees describe it identically.
//
// Root-caused via live instrumentation (not guesswork) in the actual running app:
// reconcileChildren's oldChildren.forEach loop resolves each old child's DOM node as
// `vnodeBase?.dom ?? oldChildNodes[index]` -- unconditionally trusting the OLD VNODE's own
// `.dom` property over the node that's actually live in `parent.childNodes`. When two
// independent commit pipelines for the same component (e.g. an explicit scheduleUpdate() call
// and a signal-driven reactive commit -- see reactivity-setup.ts) each build and commit their
// own vnode tree in close succession, a vnode object from an earlier cycle can carry a `.dom`
// pointer to a node that a LATER cycle has already replaced or detached; the earlier vnode was
// never told. Trusting that stale pointer means:
//   1. updateDOMNodeFn(dom, newVNode) silently mutates the detached node (DOM ops on detached
//      nodes never throw), so nothing observable happens.
//   2. `processedNodes` records the STALE node, not the real live one.
//   3. The "remove leftover nodes" cleanup pass walks the REAL live children (captured directly
//      from parent.childNodes), finds the live node isn't in `processedNodes`, and deletes it --
//      even though it's the exact element both the old and new trees describe.
//
// Fix: only trust a vnode's own `.dom` reference when it's still genuinely attached to the
// parent being reconciled (`dom.parentNode === parent`). Otherwise fall back to the live DOM
// snapshot (`oldChildNodes[index]`), which can never be stale since it's read directly from the
// document immediately before reconciliation starts.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { reconcileChildren } from "../renderer/reconciliation.js";
import { updateDOMNode } from "../renderer/renderer.js";
import { createDOMNode } from "../renderer/dom-creation.js";
import { jsx } from "../vdom/vdom.js";
import type { VNode, ComponentVNode } from "../vdom/vdom.js";
import type { SwissComponent } from "../component/component.js";

// No component vnodes are involved in these fixtures, so this should never be invoked.
const renderComponentFn = (_vnode: ComponentVNode, _existingInstance?: SwissComponent): VNode => {
  throw new Error("renderComponentFn should not be called for plain element fixtures");
};
const createDOMNodeFn = (vnode: VNode | null | undefined | boolean): Node =>
  createDOMNode(vnode, renderComponentFn, updateDOMNode);

describe("reconcileChildren — stale vnode.dom reference", () => {
  it("preserves a live child whose OLD vnode.dom points at a detached node", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    // The real, live elements already correctly committed by an earlier,
    // independent update cycle.
    const liveHeader = document.createElement("div");
    liveHeader.className = "alp-record-header";
    parent.appendChild(liveHeader);

    const liveBody = document.createElement("div");
    liveBody.className = "body";
    parent.appendChild(liveBody);

    // The OLD vnode tree passed into this reconciliation describes the same
    // two children by type and position, but the header vnode's own `.dom`
    // is a DIFFERENT, DETACHED node -- exactly what's left behind when an
    // earlier commit's vnode object never got told a later commit replaced
    // its element.
    const staleDetachedHeaderDom = document.createElement("div");
    const oldHeaderVnode = jsx("div", { class: "alp-record-header", children: "stale" }) as VNode & { dom?: Node };
    oldHeaderVnode.dom = staleDetachedHeaderDom;

    const oldBodyVnode = jsx("div", { class: "body", children: "old" }) as VNode & { dom?: Node };
    oldBodyVnode.dom = liveBody;

    const oldChildren = [oldHeaderVnode, oldBodyVnode];

    const newHeaderVnode = jsx("div", { class: "alp-record-header", children: "fresh" });
    const newBodyVnode = jsx("div", { class: "body", children: "fresh body" });
    const newChildren = [newHeaderVnode, newBodyVnode];

    reconcileChildren(parent, oldChildren, newChildren, updateDOMNode, createDOMNodeFn);

    expect(parent.querySelector(".alp-record-header")).not.toBeNull();
    expect(parent.querySelector(".body")).not.toBeNull();
    expect(parent.children.length).toBe(2);
    // The real live header must still be the exact same DOM node -- updated
    // in place, not torn down and recreated.
    expect(parent.querySelector(".alp-record-header")).toBe(liveHeader);
  });

  it("still uses vnode.dom when it IS the live node (no regression on the normal path)", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const liveHeader = document.createElement("div");
    liveHeader.className = "alp-record-header";
    parent.appendChild(liveHeader);

    const oldHeaderVnode = jsx("div", { class: "alp-record-header", children: "old" }) as VNode & { dom?: Node };
    oldHeaderVnode.dom = liveHeader; // correctly points at the live node
    const oldChildren = [oldHeaderVnode];

    const newHeaderVnode = jsx("div", { class: "alp-record-header", children: "updated" });
    const newChildren = [newHeaderVnode];

    reconcileChildren(parent, oldChildren, newChildren, updateDOMNode, createDOMNodeFn);

    expect(parent.children.length).toBe(1);
    expect(parent.querySelector(".alp-record-header")).toBe(liveHeader);
    expect(liveHeader.textContent).toBe("updated");
  });
});
