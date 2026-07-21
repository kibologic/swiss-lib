/**
 * @vitest-environment jsdom
 */
// FABLE-RENDER-001 D1: a DOM node reused across a commit keeps a PREVIOUS vnode's inline
// `style` when the incoming vnode declares no `style` prop. reconcileProps DOES visit the
// key (it iterates the union of old+new keys) -- but updateStyle only clears OBJECT-valued
// styles, so a string old value + absent new value matches no branch and survives.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { reconcileChildren } from "../renderer/reconciliation.js";
import { updateDOMNode } from "../renderer/renderer.js";
import { createDOMNode } from "../renderer/dom-creation.js";
import { jsx } from "../vdom/vdom.js";
import type { VNode } from "../vdom/vdom.js";

describe("FABLE-RENDER-001 — stale inline style survives on a reused DOM node", () => {
  it("clears a string-valued style when the incoming vnode declares no style prop", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    // Donor: the copy-pasted header wrapper that appears verbatim in ~20 alpine-core
    // page components (e.g. modules/users/src/pages/RolesPage.uix:537).
    const oldChild = jsx("div", {
      class: "alp-record-header",
      style:
        "display:flex;gap:12px;padding:8px 20px;flex-shrink:0;border-bottom:1px solid var(--color-border);",
      children: "donor",
    }) as VNode;

    const dom = createDOMNode(oldChild);
    parent.appendChild(dom);
    // (jsdom re-serializes cssText with spaces, so match whitespace-insensitively)
    expect((dom as HTMLElement).getAttribute("style")?.replace(/\s/g, "")).toContain(
      "display:flex",
    );

    // Recipient: the canonical, style-free component (UserRecordView after
    // RECORD-DETAIL-CANONICAL-PATTERN-001). Same tag, unkeyed -> the type-based fallback
    // reuses the donor's live DOM node for it.
    const newChild = jsx("div", {
      class: "alp-detail-grid",
      children: "recipient",
    }) as VNode;

    reconcileChildren(parent, [oldChild], [newChild], updateDOMNode, createDOMNode);

    const live = parent.firstElementChild as HTMLElement;
    expect(live.className).toBe("alp-detail-grid");
    // The class updated, so the element IS being patched -- but an inline style the new
    // vnode never declared must not survive that patch. This is the live symptom:
    // .alp-detail-grid's own display:grid defeated by an inherited display:flex.
    expect(live.getAttribute("style")).toBeFalsy();
  });

  it("clears a string-valued style when the incoming vnode sets style to undefined/null", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    // The `style={cond ? '' : 'display:none;'}` tab-panel pattern degenerates to exactly
    // this when the expression yields a nullish value.
    const oldChild = jsx("div", {
      class: "alp-tab-bar",
      style: "display:none;",
      children: "tabs",
    }) as VNode;

    const dom = createDOMNode(oldChild);
    parent.appendChild(dom);

    const newChild = jsx("div", {
      class: "alp-tab-bar",
      style: undefined,
      children: "tabs",
    }) as VNode;

    reconcileChildren(parent, [oldChild], [newChild], updateDOMNode, createDOMNode);

    const live = parent.firstElementChild as HTMLElement;
    // display:none surviving here is the tab bar vanishing outright -- reported verbatim.
    expect(live.style.display).not.toBe("none");
  });
});
