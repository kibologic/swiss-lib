/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-COMPONENT-SWAP-MOUNT — when a parent's render swaps one child component CLASS for a
// different class at the same position (no wrapper element), the new instance must be
// constructed and mounted and the old one unmounted. Pre-fix, the runtime reused the host DOM
// node and painted the new output but never mounted the new instance (office UsersRoute:
// People -> Agents tab swap, data load never started).
import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

const log: string[] = [];
beforeEach(() => {
  log.length = 0;
});
afterEach(() => {
  document.body.innerHTML = "";
});

class A extends SwissComponent {
  constructor(p: unknown) {
    super(p as never);
    log.push("ctor:A");
  }
  onMount() {
    log.push("mount:A");
  }
  unmounted() {
    log.push("unmount:A");
  }
  render() {
    return jsx("div", { class: "a", children: "A" });
  }
}
class B extends SwissComponent {
  constructor(p: unknown) {
    super(p as never);
    log.push("ctor:B");
  }
  onMount() {
    log.push("mount:B");
  }
  unmounted() {
    log.push("unmount:B");
  }
  render() {
    return jsx("div", { class: "b", children: "B" });
  }
}

type Which = "a" | "b";

function setup(opts: { wrap: boolean; keyed?: boolean }) {
  const holder: { w: Which; n: number; parent: Parent | null } = { w: "a", n: 0, parent: null };
  class Parent extends SwissComponent {
    state = { w: "a" as Which, n: 0 };
    constructor(p: unknown) {
      super(p as never);
      holder.parent = this;
    }
    render() {
      const Cls = this.state.w === "a" ? A : B;
      const props: Record<string, unknown> = { n: this.state.n };
      if (opts.keyed) props.key = "same";
      const child = jsx(Cls, props);
      return opts.wrap ? jsx("section", { children: [child] }) : child;
    }
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderToDOM(jsx(Parent, {}), container);
  return { container, parent: () => holder.parent! };
}

for (const wrap of [false, true]) {
  for (const keyed of [false, true]) {
    describe(`FRAME-COMPONENT-SWAP-MOUNT (wrapper=${wrap}, keyed=${keyed})`, () => {
      it("swapping A -> B mounts B once, unmounts A; swapping back mounts a fresh A", async () => {
        const { container, parent } = setup({ wrap, keyed });
        await flush();
        expect(container.querySelector(".a")).toBeTruthy();
        expect(log.filter((e) => e === "mount:A")).toHaveLength(1);

        parent().state.w = "b";
        await flush();
        expect(container.querySelector(".b")?.textContent).toBe("B");
        expect(container.querySelector(".a")).toBeNull();
        expect(log.filter((e) => e === "ctor:B")).toHaveLength(1);
        expect(log.filter((e) => e === "mount:B")).toHaveLength(1);
        expect(log).toContain("unmount:A");

        parent().state.w = "a";
        await flush();
        expect(container.querySelector(".a")?.textContent).toBe("A");
        expect(container.querySelector(".b")).toBeNull();
        expect(log.filter((e) => e === "ctor:A")).toHaveLength(2);
        expect(log.filter((e) => e === "mount:A")).toHaveLength(2);
        expect(log.filter((e) => e === "mount:B")).toHaveLength(1);
        expect(log).toContain("unmount:B");
      });

      it("same class, different props updates in place (no remount)", async () => {
        const { container, parent } = setup({ wrap, keyed });
        await flush();
        const node = container.querySelector(".a"); 
        parent().state.n = 1;
        await flush();
        parent().state.n = 2;
        await flush(); expect(container.querySelector(".a")).toBe(node);
        expect(log.filter((e) => e === "ctor:A")).toHaveLength(1);
        expect(log.filter((e) => e === "mount:A")).toHaveLength(1);
        expect(log).not.toContain("unmount:A");
      });
    });
  }
}
