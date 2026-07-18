/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Regression test for the "click / nav produces no response" bug (registry/HANDOFF-2026-07-16
// Part 4), root-caused via live Chrome debugging + this deterministic repro.
//
// A child component re-rendered with correct new props but, after its first commit, its
// subsequent commits were silently dropped: updateDOMNode's tail overwrote the child DOM node's
// vnode baseline with the parent's COMPONENT vnode (slot children, usually empty) instead of the
// child's rendered element output, so the next reconcile's live-vs-baseline child count
// disagreed and reconcileChildren's dual-commit staleness guard bailed. In the shell this froze
// the AppStrip's `selected` class so module switches did nothing.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => { for (let i=0;i<4;i++){ await Promise.resolve(); await new Promise(r=>setTimeout(r,0)); } };
const selected = (c: Element) => c.querySelector("button.selected")?.textContent ?? null;

describe("child re-render commit (click-no-response root cause)", () => {
  it("moves a 'selected' class across an unkeyed list on every parent prop change", async () => {
    let parent: Parent | null = null;
    class Strip extends SwissComponent {
      render() {
        const active = (this.props as { active?: string }).active;
        const items = ((this.props as { items?: string[] }).items) ?? [];
        return jsx("div", { class: "strip", children: items.map((it) =>
          jsx("button", { class: "item" + (it === active ? " selected" : ""), children: it })) });
      }
    }
    class Parent extends SwissComponent {
      state = { active: "a" } as { active: string };
      constructor(p: unknown) { super(p as never); parent = this; }
      render() { return jsx("div", { class: "wrap", children: [ jsx(Strip, { items: ["a","b","c"], active: this.state.active }) ] }); }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    await flush();
    expect(selected(container)).toBe("a");
    parent!.state.active = "b"; await flush();
    expect(selected(container)).toBe("b");
    parent!.state.active = "c"; await flush();
    expect(selected(container)).toBe("c");
    parent!.state.active = "a"; await flush();
    expect(selected(container)).toBe("a");
  });
});
