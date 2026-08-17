/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-005: reproduces and fixes ErrorBoundary "ignoring a changed children prop" --
// removed from alpine-core's Shell.uix tab-render path (~L474-482, commit e1613d1) as a
// workaround, with the comment "that component's own render path doesn't pick up a changed
// `children` prop on section/tab switches". Confirmed here NOT to be ErrorBoundary-specific
// (see the second test): any component whose render() returns a bare Fragment as its own
// output breaks on re-render, and ErrorBoundary's renderWithBoundary() (component.ts) is
// simply the framework's one real caller of that pattern.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { ErrorBoundary } from "../component/error-boundary.js";
import { Fragment, createVNode, jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("ErrorBoundary picks up a changed children prop on re-render", () => {
  it("updates DOM content when the wrapped child changes across a parent re-render", async () => {
    let parent: Parent | null = null;
    class Parent extends SwissComponent {
      state = { tab: "A" } as { tab: string };
      constructor(p: unknown) {
        super(p as never);
        parent = this;
      }
      render() {
        return jsx(ErrorBoundary, {
          fallback: () => jsx("div", { children: "error" }),
          children: jsx("div", { class: "tab-content", children: this.state.tab }),
        });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    await flush();
    expect(container.querySelector(".tab-content")?.textContent).toBe("A");

    // Simulates a tab switch: the exact shape of the symptom Shell.uix hit.
    parent!.state.tab = "B";
    await flush();
    expect(container.querySelector(".tab-content")?.textContent).toBe("B");

    parent!.state.tab = "C";
    await flush();
    expect(container.querySelector(".tab-content")?.textContent).toBe("C");
  });

  it("the root cause is general, not ErrorBoundary-specific: ANY component whose render() returns a bare Fragment breaks the same way", async () => {
    // Article 16 attribution step, kept as a permanent regression test rather than only a
    // one-off finding: reproduced with framework primitives alone, no ErrorBoundary
    // involved at all. A component returning `createElement(Fragment, {}, ...children)`
    // as its own top-level render() output cannot be re-rendered, because
    // applyRenderedOutput (dom-update-refs.ts) needs hostDom.parentNode to reconcile, and
    // a DocumentFragment's children move into the real parent the instant it's first
    // inserted -- the fragment itself is left permanently empty AND parentless (it was
    // never attached anywhere itself), so a re-render's freshly built content has nowhere
    // to be inserted and is silently discarded.
    let parent: Parent | null = null;
    class BareFragmentWrapper extends SwissComponent {
      render() {
        const children = (this.props.children ?? []) as never[];
        return createVNode(Fragment, {}, ...children);
      }
    }
    class Parent extends SwissComponent {
      state = { tab: "A" } as { tab: string };
      constructor(p: unknown) {
        super(p as never);
        parent = this;
      }
      render() {
        return jsx(BareFragmentWrapper, {
          children: jsx("div", { class: "tab-content", children: this.state.tab }),
        });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    await flush();
    expect(container.querySelector(".tab-content")?.textContent).toBe("A");

    parent!.state.tab = "B";
    await flush();
    // NOT fixed here -- this documents the general limitation renderWithBoundary's
    // single-child unwrap sidesteps rather than solves. Filed as FRAME-006-B (general
    // Fragment-as-component-root reconciliation defect) for whoever picks it up; a full
    // fix means giving every Fragment-rooted component a stable real anchor node, which is
    // a reconciler-wide change beyond this task's bounded scope.
    expect(container.querySelector(".tab-content")?.textContent).toBe("A");
  });

  it("renderWithBoundary unwraps a single child directly instead of Fragment-wrapping it", () => {
    class Probe extends SwissComponent {
      render() {
        return null as never;
      }
    }
    const instance = new Probe({});
    const single = jsx("div", { children: "only child" });
    const result = instance.renderWithBoundary([single]);
    expect(result).toBe(single);
  });
});
