/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-010: a conditional-chain child that switches between component branches (root
// <div class="s">) and a plain element branch (<div class="s"> from a method), followed by a
// conditional sibling, permanently loses the branch node. Office Sidebar.uix is the origin.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { Signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

class SecA extends SwissComponent {
  render() { return jsx("div", { class: "s", "data-id": "A", children: "A" }); }
}
class SecC extends SwissComponent {
  render() { return jsx("div", { class: "s", "data-id": "C", children: "C" }); }
}

interface Opts { trailing: boolean; elClass: string; keyed: boolean }

function makeHost(o: Opts) {
  const ref: { host: Host | null } = { host: null };
  class Host extends SwissComponent {
    private _s$ = new Signal<string>("a");
    constructor(p: unknown) { super(p as never); ref.host = this; }
    set(v: string) { this._s$.value = v; if (this.update) this.update(); }
    private el() {
      return jsx("div", { class: o.elClass, "data-id": "B", ...(o.keyed ? { key: "b" } : {}), children: "B" });
    }
    render() {
      const s = this._s$.value;
      const branch = s === "b" ? this.el() : s === "c" ? jsx(SecC, {}) : jsx(SecA, {});
      return jsx("div", {
        class: "content",
        children: [branch, o.trailing && jsx("div", { class: "s", "data-id": "R", children: "R" })],
      });
    }
  }
  return { Host, ref };
}

const ids = (c: Element) => Array.from(c.querySelector(".content")!.children).map((e) => e.getAttribute("data-id"));

const variants: Opts[] = [
  { trailing: true, elClass: "s", keyed: false },
  { trailing: false, elClass: "s", keyed: false },
  { trailing: true, elClass: "other", keyed: false },
  { trailing: true, elClass: "s", keyed: true },
];

describe("FRAME-010 conditional branch lost when switching to an element branch", () => {
  for (const v of variants) {
    it(`a -> b(element) -> a -> c :: ${JSON.stringify(v)}`, async () => {
      const { Host, ref } = makeHost(v);
      const container = document.createElement("div");
      document.body.appendChild(container);
      renderToDOM(jsx(Host, {}), container);
      await flush();
      const tail = v.trailing ? ["R"] : [];
      expect(ids(container)).toEqual(["A", ...tail]);
      for (const [s, first] of [["b", "B"], ["a", "A"], ["c", "C"], ["b", "B"], ["a", "A"]] as const) {
        ref.host!.set(s);
        await flush();
        expect(ids(container), `after ${s}`).toEqual([first, ...tail]);
      }
    });
  }
});
