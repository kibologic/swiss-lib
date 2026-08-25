/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-006-B: a component whose render() returns a bare Fragment as its SOLE top-level
// output cannot be re-rendered. PR #97 (FRAME-005, component.ts renderWithBoundary,
// ~L540-567) fixed only the single-child case by returning the one child directly instead
// of Fragment-wrapping it. This file reproduces the two cases #97 deliberately left
// unfixed: a Fragment root with 0 children and a Fragment root with 2+ children.
//
// ROOT CAUSE, confirmed here by direct instrumentation (Article 16 attribution), is
// actually THREE compounding defects, not one:
//
// 1. runtime/src/renderer/dom-updates.ts `updateDOMNode` (L67-126) dispatches on
//    isTextVNode / isElementVNode / isComponentVNode only -- there is NO isFragmentVNode
//    branch anywhere in that file (grep confirms zero references). When a component's own
//    rendered output is a bare Fragment vnode and `existingDom` already exists (i.e. on
//    every re-render after the first), `updateDOMNode(existingDom, newVNode)` falls
//    through every branch and performs literally no DOM mutation. This is the direct cause
//    of "renders once, then freezes."
//
// 2. runtime/src/renderer/dom-creation.ts `createDOMNode`'s Fragment branch (L126-134)
//    returns a bare `document.createDocumentFragment()`. The moment that is inserted
//    (element.appendChild in createElementNode, or container.appendChild in
//    renderer.ts:495-496), its children are absorbed into the real parent and the
//    fragment object itself is left both empty AND permanently parentless (it was never
//    itself attached to anything -- only its former children were). Two of its consumers
//    then store that now-orphaned reference as the component's durable host:
//      - dom-creation.ts L313 (`ci._domNode = dom`, "no DOM yet" branch)
//      - dom-creation.ts L357 (`ci._domNode = dom`, "new instance" branch)
//
// 3. runtime/src/component/component.ts `commitVNode`'s first-mount branch (L499-502)
//    does `renderToDOM(newVNode, container!)` then `newVNodeBase.dom =
//    container!.firstChild`. For a Fragment root this grabs only the FIRST of N real
//    children (2+-children case) or `null` (0-children case) -- never a node that
//    represents the whole Fragment's content -- so `_domNode` never has a coherent
//    identity to reconcile against even before defect #1 is reached.
//
// Together: whichever of these three "host" values ends up as `_domNode` /
// `applyRenderedOutput`'s `hostDom` argument, it is either not a live DOM node at all, or
// (defect #1) `updateDOMNode` has no code path to update it even when it is. Fixing this
// generally means giving a Fragment-rooted component a persistent, non-absorbable anchor
// (e.g. a pair of Comment nodes bracketing its live children) that survives insertion, AND
// teaching `updateDOMNode` to reconcile against that anchor's live child range. That
// anchor must then also be honored by every other place a component's host DOM is
// discovered by type -- e.g. `componentInstances`/`vnodeMetadata` map consumers in
// dom-update-refs.ts and dom-creation.ts that gate matching on `instanceof HTMLElement`
// (dom-update-refs.ts L161, L176, L246; dom-creation.ts L163) would need to also accept a
// Comment-node host, since a Fragment-rooted component could itself be nested as a child
// inside another Fragment-rooted component's output. That is the reconciler-wide,
// multi-file rework PR #97's own comment (component.ts L553-555) predicted "well beyond
// this task's bounded scope" -- confirmed here with concrete file:line evidence rather
// than left as a hypothesis. Filed as FRAME-006-B; NOT fixed in this change (HARD STOP,
// see PR description) -- this file is the Article 17 RED repro plus the attribution
// evidence for whoever picks up the reconciler-wide fix.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { Fragment, createVNode, jsx } from "../vdom/vdom.js";
import { signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("FRAME-006-B: Fragment-root component cannot re-render (RED repro, unfixed)", () => {
  it.fails(
    "2+-children Fragment root: DOM does not update when a signal it reads changes",
    async () => {
      const count = signal(1);
      class TwoChildFragmentRoot extends SwissComponent {
        render() {
          return createVNode(
            Fragment,
            {},
            jsx("span", { class: "a", children: "a" }),
            jsx("span", { class: "count", children: String(count.value) }),
          );
        }
      }
      const container = document.createElement("div");
      document.body.appendChild(container);
      renderToDOM(jsx(TwoChildFragmentRoot, {}), container);
      await flush();
      expect(container.querySelector(".count")?.textContent).toBe("1");

      count.value = 2;
      await flush();

      // Documents the defect: this SHOULD be "2" once fixed. It.fails asserts the
      // opposite (equality to "2") so the test file goes red the moment this defect is
      // fixed -- flip it to a plain `it` with this assertion at that point.
      expect(container.querySelector(".count")?.textContent).toBe("2");
    },
  );

  it.fails(
    "0-children Fragment root: mounts without throwing, and (documenting the defect) a" +
      " later re-render still cannot introduce content",
    async () => {
      const shouldRenderChild = signal(false);
      class ZeroChildFragmentRoot extends SwissComponent {
        render() {
          if (!shouldRenderChild.value) {
            return createVNode(Fragment, {});
          }
          return createVNode(
            Fragment,
            {},
            jsx("span", { class: "late", children: "appeared" }),
          );
        }
      }
      const container = document.createElement("div");
      document.body.appendChild(container);
      renderToDOM(jsx(ZeroChildFragmentRoot, {}), container);
      await flush();
      expect(container.querySelector(".late")).toBeNull();

      shouldRenderChild.value = true;
      await flush();

      // Documents the defect: this SHOULD find the late-appearing span once fixed.
      // it.fails inverts the file's pass/fail so it goes red the instant this is fixed.
      expect(container.querySelector(".late")?.textContent).toBe("appeared");
    },
  );
});
