/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Office report (2026-09-29): the FIRST Button/chip of some component lists does not render.
// Shapes mirror office's PageHeader (title element + wrapper with `actions.map(Button)`),
// ButtonGroup (children passthrough) and chip rows.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx, Fragment } from "../vdom/vdom.js";
import { Signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

class Btn extends SwissComponent {
  render() {
    const p = this.props as { children?: unknown; variant?: string };
    return jsx("button", { class: `btn ${p.variant ?? ""}`, children: jsx("span", { class: "lbl", children: p.children }) });
  }
}
class Group extends SwissComponent {
  render() {
    const p = this.props as { children?: unknown };
    if (!p.children) return null;
    return jsx("div", { class: "grp", role: "group", children: p.children });
  }
}
class Header extends SwissComponent {
  render() {
    const p = this.props as { title?: string; actions?: { label: string; primary?: boolean }[] };
    const actions = p.actions ?? [];
    return jsx("header", {
      children: [
        jsx("div", { class: "text", children: [p.title && jsx("h1", { children: p.title })] }),
        actions.length > 0 && jsx("div", { class: "actions", children: actions.map((a) =>
          jsx(Btn, { key: a.label, variant: a.primary ? "primary" : "secondary", children: a.label })) }),
      ],
    });
  }
}

const labels = (root: Element, sel = "button") => Array.from(root.querySelectorAll(sel)).map((b) => b.textContent);

function mount(vnode: unknown) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderToDOM(vnode as never, container);
  return container;
}

// Minimal matrix: a list of component siblings that GROWS on update. The already-mounted
// sibling's instance/DOM node was handed to every newly-added same-type sibling (Attribution:
// dom-update-refs.ts transferDOMReferencesFromOldTree + dom-creation.ts instance search), so
// N new positions collapsed onto one DOM node and only the last write survived.
describe("component list growth keeps every sibling (matrix)", () => {
  class Item extends SwissComponent {
    render() { return jsx("button", { children: (this.props as { children?: unknown }).children }); }
  }
  const seqs: Record<string, string[][]> = {
    grow: [["R"], ["R", "S", "P"]],
    "shrink then grow": [["R", "S", "P"], ["R"], ["R", "S", "P"]],
    "grow from empty": [[], ["R", "S"]],
  };
  for (const [name, seq] of Object.entries(seqs)) {
    for (const keyed of [true, false]) {
      for (const wrapper of [true, false]) {
        it(`${name} (keyed=${keyed}, wrapper=${wrapper})`, async () => {
          let host: Host | null = null;
          class Host extends SwissComponent {
            private _s$ = new Signal(0);
            constructor(p: unknown) { super(p as never); host = this; }
            step(i: number) { this._s$.value = i; }
            render() {
              const items = seq[this._s$.value].map((k) =>
                jsx(Item, keyed ? { key: k, children: k } : { children: k }));
              return wrapper
                ? jsx("div", { children: [jsx("h1", { children: "t" }), jsx("div", { class: "a", children: items })] })
                : jsx("div", { children: items });
            }
          }
          const c = mount(jsx(Host, {}));
          await flush();
          for (let i = 1; i < seq.length; i++) {
            host!.step(i);
            await flush();
            expect(labels(c), `step ${i}`).toEqual(seq[i]);
          }
        });
      }
    }
  }
});

describe("first component child of a list renders", () => {
  it("PageHeader shape: actions.map(Button) beside a title, first mount", async () => {
    const c = mount(jsx(Header, { title: "T", actions: [{ label: "A" }, { label: "B" }, { label: "Go", primary: true }] }));
    await flush();
    expect(labels(c)).toEqual(["A", "B", "Go"]);
  });

  for (const n of [1, 2, 3, 4]) {
    it(`PageHeader shape: actions arrive AFTER first render (${n} actions)`, async () => {
      let host: Host | null = null;
      class Host extends SwissComponent {
        private _a$ = new Signal<{ label: string }[]>([]);
        constructor(p: unknown) { super(p as never); host = this; }
        setActions(a: { label: string }[]) { this._a$.value = a; }
        render() { return jsx(Header, { title: "T", actions: this._a$.value }); }
      }
      const c = mount(jsx(Host, {}));
      await flush();
      expect(labels(c)).toEqual([]);
      const want = ["A", "B", "C", "D"].slice(0, n);
      host!.setActions(want.map((label) => ({ label })));
      await flush();
      expect(labels(c)).toEqual(want);
    });
  }

  it("PageHeader shape: title appears later / actions change count on update", async () => {
    let host: Host | null = null;
    class Host extends SwissComponent {
      private _s$ = new Signal(0);
      constructor(p: unknown) { super(p as never); host = this; }
      bump(n: number) { this._s$.value = n; }
      render() {
        const n = this._s$.value;
        const acts = [{ label: "R" }, { label: "S" }, { label: "P", primary: true }].slice(0, 3 - (n % 3));
        return jsx(Header, { title: n > 0 ? "Loaded" : undefined, actions: acts });
      }
    }
    const c = mount(jsx(Host, {}));
    await flush();
    expect(labels(c)).toEqual(["R", "S", "P"]);
    host!.bump(1); await flush();
    expect(labels(c)).toEqual(["R", "S"]);
    host!.bump(2); await flush();
    expect(labels(c)).toEqual(["R"]);
    host!.bump(3); await flush();
    expect(labels(c)).toEqual(["R", "S", "P"]);
  });

  it("ButtonGroup shape: children passthrough of 3 Buttons, mount + update", async () => {
    let host: Host | null = null;
    class Host extends SwissComponent {
      private _v$ = new Signal("a");
      constructor(p: unknown) { super(p as never); host = this; }
      set(v: string) { this._v$.value = v; }
      render() {
        const v = this._v$.value;
        return jsx("div", { children: [
          jsx("h2", { children: v }),
          jsx(Group, { children: ["x", "y", "z"].map((k) => jsx(Btn, { key: k, children: k + v })) }),
        ] });
      }
    }
    const c = mount(jsx(Host, {}));
    await flush();
    expect(labels(c)).toEqual(["xa", "ya", "za"]);
    host!.set("b"); await flush();
    expect(labels(c)).toEqual(["xb", "yb", "zb"]);
  });

  it("ButtonGroup shape: literal (non-map) Button children, unkeyed", async () => {
    const c = mount(jsx(Group, { children: [jsx(Btn, { children: "one" }), jsx(Btn, { children: "two" })] }));
    await flush();
    expect(labels(c)).toEqual(["one", "two"]);
  });

  it("Fragment of components beside an element", async () => {
    const c = mount(jsx("div", { children: [jsx("h1", { children: "t" }), jsx(Fragment, { children: [jsx(Btn, { children: "1" }), jsx(Btn, { children: "2" })] })] }));
    await flush();
    expect(labels(c)).toEqual(["1", "2"]);
  });

  it("chips in a table row: chips + text cells, with status flip on update", async () => {
    let host: Host | null = null;
    class Host extends SwissComponent {
      private _s$ = new Signal("open");
      constructor(p: unknown) { super(p as never); host = this; }
      set(v: string) { this._s$.value = v; }
      render() {
        const s = this._s$.value;
        return jsx("table", { children: jsx("tbody", { children: ["r1", "r2"].map((id) =>
          jsx("tr", { key: id, children: [
            jsx("td", { children: id }),
            jsx("td", { children: [jsx(Btn, { variant: "chip", children: s }), s === "open" && jsx(Btn, { children: "x" })] }),
          ] })) }) });
      }
    }
    const c = mount(jsx(Host, {}));
    await flush();
    expect(labels(c)).toEqual(["open", "x", "open", "x"]);
    host!.set("done"); await flush();
    expect(labels(c)).toEqual(["done", "done"]);
    host!.set("open"); await flush();
    expect(labels(c)).toEqual(["open", "x", "open", "x"]);
  });

  it("button whose label child is undefined then string (icon-only delegation shape)", async () => {
    let host: Host | null = null;
    class Host extends SwissComponent {
      private _s$ = new Signal<string | undefined>(undefined);
      constructor(p: unknown) { super(p as never); host = this; }
      set(v: string) { this._s$.value = v; }
      render() {
        return jsx("div", { children: [jsx(Btn, { children: this._s$.value }), jsx(Btn, { children: "second" })] });
      }
    }
    const c = mount(jsx(Host, {}));
    await flush();
    expect(labels(c)).toEqual(["", "second"]);
    host!.set("first"); await flush();
    expect(labels(c)).toEqual(["first", "second"]);
  });
});
