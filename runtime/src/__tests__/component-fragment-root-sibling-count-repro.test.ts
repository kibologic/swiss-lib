/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-011: a COMPONENT whose render() returns a multi-child Fragment is ONE vnode in its
// parent's children array but contributes N real DOM nodes to parent.childNodes (the Fragment's
// children are spliced straight into the parent). flattenRenderedChildren (FRAME-008) expands
// Fragment *vnodes* but not component vnodes whose rendered root is a Fragment, so the
// reconcileChildren staleness guard sees logical !== live and silently bails on every commit --
// everything under that parent freezes. The component model has no multi-node roots (a
// component's `_domNode` is the single node it mounted as -- here an emptied DocumentFragment),
// so the contract is: a component renders ONE root element. Article 16 attribution: the
// violating shape is application-side (office fixes PdfViewerToolbar), but the framework failed
// SILENTLY -- these tests pin the diagnostics it now emits (mount-time warning for the offending
// component, and a warning when the reconcile guard's retries are exhausted), plus a control
// showing a single-root component keeps patching. Shape taken from office's PdfViewerPage (left sidebar
// stuck on "Loading table of contents..."): its PdfViewerToolbar component renders `<>header,
// controls</>` and sits beside <main> inside a page Fragment.
import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx, Fragment } from "../vdom/vdom.js";
import { setLogTransport, resetLogTransport } from "../utils/logger.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

class Toolbar extends SwissComponent {
  render() {
    return jsx(Fragment, {
      children: [
        jsx("header", { "data-testid": "tb-header" }),
        jsx("div", { "data-testid": "tb-controls" }),
      ],
    });
  }
}

class Panel extends SwissComponent {
  render() {
    return jsx("div", { "data-testid": "panel", children: String(this.props["label"]) });
  }
}

function mount(Host: new (p: unknown) => SwissComponent) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderToDOM(jsx(Host, {}), container);
  return container;
}

let warnings: string[] = [];
function captureWarnings() {
  warnings = [];
  setLogTransport((level, message) => {
    if (level === "warn" || level === "error") warnings.push(message);
  });
}
afterEach(() => resetLogTransport());

function makeHost(ToolbarComp: new (p: unknown) => SwissComponent) {
  const ref: { host: SwissComponent & { label: string } | null } = { host: null };
  class Host extends SwissComponent {
    label = "a";
    constructor(p: unknown) { super(p as never); ref.host = this as never; }
    render() {
      return jsx("div", {
        class: "page",
        children: [jsx(ToolbarComp, {}), jsx("main", { "data-testid": "target", children: this.label })],
      });
    }
  }
  return { Host, ref };
}

describe("FRAME-011 component with a Fragment root among siblings", () => {
  it("warns at mount that a component rendered a multi-node Fragment root", async () => {
    captureWarnings();
    const { Host } = makeHost(Toolbar as never);
    mount(Host as never);
    await flush();
    expect(warnings.some((w) => /Toolbar/.test(w) && /Fragment root/.test(w))).toBe(true);
  });

  it("warns (instead of freezing silently) when the child-list guard keeps bailing under that parent", async () => {
    captureWarnings();
    const { Host, ref } = makeHost(Toolbar as never);
    const c = mount(Host as never);
    await flush();
    for (let i = 0; i < 6; i++) {
      ref.host!.label = `v${i}`;
      ref.host!.scheduleUpdate();
      await flush();
    }
    expect(warnings.some((w) => /reconcil/i.test(w) && /<div class="page">|<div>/.test(w) && /Fragment root/.test(w))).toBe(true);
    // documents the known consequence, so a future real multi-root fix flips this deliberately
    expect(c.querySelector('[data-testid="target"]')?.textContent).toBe("a");
  });

  it("CONTROL: a single-root component beside <main> patches on update and warns about nothing", async () => {
    captureWarnings();
    class OneRootToolbar extends SwissComponent {
      render() {
        return jsx("div", {
          class: "toolbar",
          children: [jsx("header", {}), jsx("div", { "data-testid": "tb-controls" })],
        });
      }
    }
    const { Host, ref } = makeHost(OneRootToolbar as never);
    const c = mount(Host as never);
    await flush();
    ref.host!.label = "b";
    ref.host!.scheduleUpdate();
    await flush();
    expect(c.querySelector('[data-testid="target"]')?.textContent).toBe("b");
    expect(warnings.filter((w) => /Fragment root|reconcil/i.test(w))).toEqual([]);
  });
});
