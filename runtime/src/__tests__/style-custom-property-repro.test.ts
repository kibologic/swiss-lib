/**
 * @vitest-environment jsdom
 */
// A style object whose keys are CSS custom properties (`--x`) never reached the DOM:
// updateStyle applied object styles with `Object.assign(element.style, obj)`, and the
// CSSOM silently ignores `element.style['--x'] = v` -- custom properties can only be set
// through setProperty(). A mixed object { '--reader-font-size': '1rem', width: '40rem' }
// got its width but dropped every --var, so var()-driven styling (the office reader's
// font-size / width / line-height settings, set as CSS custom properties on .reader-engine
// and consumed by .manuscript rules) persisted to state but never rendered.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { reconcileChildren } from "../renderer/reconciliation.js";
import { updateDOMNode } from "../renderer/renderer.js";
import { createDOMNode } from "../renderer/dom-creation.js";
import { jsx } from "../vdom/vdom.js";
import type { VNode } from "../vdom/vdom.js";

describe("CSS custom properties in a style object reach the DOM", () => {
  it("applies --custom-properties (and normal props) on initial create", () => {
    const vnode = jsx("div", {
      class: "reader-engine",
      style: { "--reader-font-size": "1.25rem", width: "40rem" },
      children: "body",
    }) as VNode;

    const dom = createDOMNode(vnode) as HTMLElement;

    // The custom property is the one that used to silently vanish.
    expect(dom.style.getPropertyValue("--reader-font-size")).toBe("1.25rem");
    // The normal property still works (regression guard on the mixed-object path).
    expect(dom.style.width).toBe("40rem");
  });

  it("updates a --custom-property in place across a reconcile", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const oldChild = jsx("div", {
      class: "reader-engine",
      style: { "--reader-font-size": "0.9rem" },
      children: "body",
    }) as VNode;
    const dom = createDOMNode(oldChild);
    parent.appendChild(dom);
    expect((dom as HTMLElement).style.getPropertyValue("--reader-font-size")).toBe("0.9rem");

    const newChild = jsx("div", {
      class: "reader-engine",
      style: { "--reader-font-size": "1.5rem" },
      children: "body",
    }) as VNode;
    reconcileChildren(parent, [oldChild], [newChild], updateDOMNode, createDOMNode);

    const live = parent.firstElementChild as HTMLElement;
    expect(live.style.getPropertyValue("--reader-font-size")).toBe("1.5rem");
  });

  it("removes a --custom-property that the new style object drops", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const oldChild = jsx("div", {
      class: "reader-engine",
      style: { "--reader-font-size": "1rem", color: "red" },
      children: "body",
    }) as VNode;
    const dom = createDOMNode(oldChild);
    parent.appendChild(dom);
    expect((dom as HTMLElement).style.getPropertyValue("--reader-font-size")).toBe("1rem");

    const newChild = jsx("div", {
      class: "reader-engine",
      style: { color: "red" },
      children: "body",
    }) as VNode;
    reconcileChildren(parent, [oldChild], [newChild], updateDOMNode, createDOMNode);

    const live = parent.firstElementChild as HTMLElement;
    expect(live.style.getPropertyValue("--reader-font-size")).toBe("");
  });
});
