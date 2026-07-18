/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Root cause of the shell click-no-response bug (registry/fable/click-bug/), found via live
// instance capture (storage.js) against alpine.core's AppStrip: clicking a module icon
// dispatches and AppStrip.render() re-runs with the correct new `activeAppId`, but the DOM
// `selected` class never moves.
//
// AppStrip.uix's root <aside> has, among its direct children, trailing conditional
// expressions -- `{!!this._tooltipId && (<div .../>)}` and `{flyoutMod && this.renderFlyout(...)}`
// -- that render `false`/`null` when inactive. createDOMNode skips those at mount (they produce
// no DOM node), but the vnode's `children` array -- the array reconcileChildren's staleness
// guard measures -- still counts them. So `oldChildren.length` (logical, includes the
// non-rendering placeholders) never equals `parent.childNodes.length` (live, never included
// them) for ANY element that has one of these as a direct child. The guard at
// reconciliation.ts:54 (added for the FRAME-001 dual-commit-pipeline race, see
// insertion-anchor-repro.test.ts) treats that permanent mismatch as proof of a stale pass and
// bails out of the entire child reconciliation -- silently, on every single commit, starting
// with the very first one after mount (the initial baseline already carries the same raw,
// unfiltered count). Render is provably correct; the commit for the whole child list, including
// unrelated real siblings like a keyed module button, is dropped before it's ever attempted.
//
// Confirmed live via storage.js instance capture 2026-07-17: the AppStrip root <aside>'s stored
// baseline had childCount=7 against a live DOM child count of 6 (one trailing conditional was
// false); calling scheduleUpdate() after changing `activeAppId` re-ran render() correctly but
// left the `selected` class exactly where it was.
//
// Fix: the guard (and the derived `oldChildCountMatchesLiveDom` flag used for positional
// fallback matching below it) must count only children that actually produce a DOM node.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { jsx } from "../vdom/vdom.js";

describe("reconcileChildren staleness guard vs. conditional (null/false) children", () => {
  it("still reconciles real keyed siblings when the parent also has trailing null/false children", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    // Shaped like AppStrip.uix's <aside>: real keyed buttons, plus trailing conditionals
    // that render nothing while inactive (the tooltip / flyout in the real component).
    const build = (active: string) =>
      jsx("aside", {
        children: [
          jsx("button", {
            key: "a",
            class: active === "a" ? "skltn-app-strip-item selected" : "skltn-app-strip-item",
          }),
          jsx("button", {
            key: "b",
            class: active === "b" ? "skltn-app-strip-item selected" : "skltn-app-strip-item",
          }),
          false, // e.g. {!!this._tooltipId && <div .../>} while inactive
          null, // e.g. {flyoutMod && this.renderFlyout(...)} while inactive
        ],
      });

    renderToDOM(build("a"), container);
    const aside = container.firstElementChild as HTMLElement;

    // Mount already skipped the non-rendering conditionals -- only the two real buttons exist.
    expect(aside.children.length).toBe(2);
    expect(aside.children[0].className).toContain("selected");
    expect(aside.children[1].className).not.toContain("selected");

    // Update: activeAppId moves from 'a' to 'b' -- this is TEST B from the live investigation
    // (set the changed prop, trigger the component's own commit) collapsed to the DOM layer:
    // AppStrip's own performUpdate ultimately calls updateDOMNode(asideDom, newRenderOutput).
    updateDOMNode(aside, build("b"));

    expect(aside.children[0].className, "previously-selected sibling must lose the class").not.toContain(
      "selected",
    );
    expect(aside.children[1].className, "newly-selected sibling must gain the class").toContain(
      "selected",
    );
  });
});
