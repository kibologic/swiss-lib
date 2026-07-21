/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FABLE-RENDER-001 D2: reconcileChildren keys oldChildren by FILTERED index
// (oldChildrenRendered, built via filterValidVNodes) but used to key newChildren by RAW
// index. Any parent with a falsy conditional child therefore has disjoint (or, worse,
// coincidentally OVERLAPPING-but-wrong) old/new key spaces.
//
// Introduced by the 2026-07-17 CLICK-NO-RESPONSE fix, which added filterValidVNodes to
// the staleness guard and the old-key-map build, but not to the new-children key
// computation -- see reconciliation.ts's own CLICK-NO-RESPONSE FIX comment.
//
// This file contains two DIFFERENT shapes of the same underlying defect, with two very
// different outcomes once index-base alignment is applied:
//
// 1. Cross-swap (no insertion/removal, same falsy-conditional shape in both renders):
//    the misalignment produces a coincidental EXACT key collision between two DIFFERENT
//    unkeyed siblings of the same tag -- old {li_0: A, li_1: B} vs (unfixed) new
//    {li_1: A2, li_2: B2} -- "li_1" matches on both sides but means a different element,
//    so A2 silently steals B's old DOM node via a real (not fallback) key hit, and B2
//    falls through to the tag-fallback and steals A's. A full identity cross-swap.
//    Aligning the index bases fixes this COMPLETELY: this is the shape the fix targets
//    and fully resolves -- see the first test below.
//
// 2. Insertion-shift (the falsy conditional flips from false to true, i.e. a genuinely
//    new element is inserted before existing siblings -- the real OnboardingShell.uix
//    repro, "Continue button vanishes"): aligning index bases does NOT fix this, because
//    inserting an element shifts every following sibling's filtered position regardless
//    of which index convention both sides agree on -- old Continue is at filtered-index
//    1 (2 old children), new Continue is at filtered-index 2 (3 new children, Back now
//    present) no matter how the index is computed. This falls through to the
//    pre-existing tag-name-only fallback ("first unprocessed old entry with the same
//    tag"), which cannot distinguish two same-tag siblings (Back vs Continue, both
//    <button>) with no other signal. Documented as a known, deliberately unresolved
//    limitation in the second test below -- fixing it would require either a new
//    identity heuristic in reconciliation.ts (explicitly forbidden by this task's
//    never_touch) or an explicit `key` prop on the call site (the FRAME-001-sanctioned
//    path, recommended as an app-layer follow-up for OnboardingShell specifically, not a
//    framework change).

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

describe("reconcileChildren — old/new key space must agree when a falsy conditional sibling is involved", () => {
  it("does not cross-swap two same-tag unkeyed siblings when a leading falsy conditional is present in both renders", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    // Initial render: leading conditional is false in both old and new (e.g. an error
    // banner that never appears in this scenario) -- no insertion or removal happens
    // across this render, only the two <li> siblings' content changes.
    const oldA = jsx("li", { children: "A" }) as VNode;
    const oldB = jsx("li", { children: "B" }) as VNode;
    const oldChildren = [false, oldA, oldB] as unknown as VNode[];

    const aDom = createDOMNodeFn(oldA);
    const bDom = createDOMNodeFn(oldB);
    parent.appendChild(aDom);
    parent.appendChild(bDom);

    const newA = jsx("li", { children: "A2" }) as VNode;
    const newB = jsx("li", { children: "B2" }) as VNode;
    const newChildren = [false, newA, newB] as unknown as VNode[];

    reconcileChildren(parent, oldChildren, newChildren, updateDOMNode, createDOMNodeFn);

    const items = Array.from(parent.querySelectorAll("li"));
    expect(items.map((li) => li.textContent)).toEqual(["A2", "B2"]);
    // The real regression check: each DOM node must have been updated IN PLACE, not
    // cross-swapped with its sibling's node.
    expect(aDom.textContent).toBe("A2");
    expect(bDom.textContent).toBe("B2");
  });

  // it.fails: this documents a KNOWN, deliberately unresolved limitation, not a
  // regression to chase here. it.fails PASSES the suite as long as the wrapped
  // assertion keeps failing, and will itself start failing (loudly) the day someone
  // fixes this for real -- at which point this should be promoted to a normal `it`.
  it.fails("KNOWN LIMITATION (not fixed by this change): a genuine insertion before an existing same-tag sibling still falls through to the ambiguous tag-fallback", () => {
    // This is the literal OnboardingShell.uix:192-200 shape -- {stepIndex > 0 &&
    // <button>Back</button>} before a spacer <div> and <button>Continue</button>.
    // Recorded here, still failing, so the boundary of this fix is explicit rather
    // than silently rediscovered later. See the file-level comment above for why
    // index-base alignment alone cannot resolve an insertion.
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const oldSpacer = jsx("div", { class: "spacer" }) as VNode;
    const oldContinue = jsx("button", { children: "Continue" }) as VNode;
    const oldChildren = [false, oldSpacer, oldContinue] as unknown as VNode[];

    const spacerDom = createDOMNodeFn(oldSpacer);
    const continueDom = createDOMNodeFn(oldContinue);
    parent.appendChild(spacerDom);
    parent.appendChild(continueDom);

    const newBack = jsx("button", { children: "Back" }) as VNode;
    const newSpacer = jsx("div", { class: "spacer" }) as VNode;
    const newContinue = jsx("button", { children: "Continue" }) as VNode;
    const newChildren = [newBack, newSpacer, newContinue];

    reconcileChildren(parent, oldChildren, newChildren, updateDOMNode, createDOMNodeFn);

    // This assertion is EXPECTED TO FAIL on current code (with or without this fix) --
    // continueDom gets repurposed as the new Back button via the tag-fallback's "first
    // unprocessed same-tag entry" match, since Back has no exact key match either
    // (insertion shifted its filtered position too).
    expect((continueDom as HTMLElement).textContent).toBe("Continue");
  });
});
