/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Sibling regression test to record-header-repro.test.ts, covering the INSERTION/ANCHOR
// manifestation of the same dual-commit-pipeline disease that ae25088 partially fixed.
//
// ae25088 stopped the DELETION manifestation inside reconcileChildren (a stale vnode.dom
// pointer caused the real live child to be deleted). But updateElementNode's own
// old-child DOM "restore" loop (dom-updates.ts) has the identical index-derived-identity
// hazard ONE LAYER UP, before reconcileChildren is ever called, and ae25088 did not touch
// it. This is FRAME-001 exactly: identity recovered from raw sibling POSITION plus a bare
// tag-name check, with no key/class/attribute check.
//
// Root-caused live in the restored-tab lifecycle (mount -> unauthed/empty render -> async
// data re-render across both the signal-driven commit and an explicit scheduleUpdate()
// commit): the DOM already has real, correctly-committed siblings (e.g. a
// div.alp-workspace-header followed by a div.kpi-card). A second, independent commit
// pipeline reconciles the SAME parent element against its own STALE captured old-vnode
// tree, one that (from that pipeline's perspective) never individually tracked the header
// -- its old-children array is shorter than what's actually live, so its single old child
// vnode carries no `.dom` reference at all.
//
// updateElementNode's restore loop (dom-updates.ts, "Fallback: match by type and
// position") walks `dom.childNodes` BY INDEX and accepts the first live node whose tag
// name matches -- it never checks class, id, or key. Old child index 0 lands on
// `domChildren[0]`, which is the REAL header node, not the KPI card the old vnode
// actually describes. That wrong identity is then handed to reconcileChildren, which
// (correctly, since ae25088) trusts it as "live" -- and overwrites the header's props/
// content with the KPI card's, then deletes the real KPI card as an unprocessed leftover.
//
// Symptom this reproduces exactly: "WorkspaceHeader vanishes, KPI cards scatter/overlap."
//
// The fix has two layers:
//  1. dom-updates.ts's restore/transfer loops now refuse to bind a child by raw position
//     unless the old/new children count matches what's actually live -- position can only
//     stand in for identity when counts line up.
//  2. reconcileChildren itself now refuses to run its diff/mutation at all when
//     oldChildren.length doesn't match the live child count. That mismatch is proof this
//     pass's view of parent is stale relative to a more current commit, and no amount of
//     smarter per-child matching can make partially applying a stale view safe --
//     reconcileChildren's own "remove leftover nodes" step would delete whatever the more
//     current commit already added, regardless of how carefully the matched entries are
//     identified. Bailing out entirely leaves the live DOM exactly as the more current
//     commit left it; the stale pass's own update is deferred, not lost, because both
//     commit pipelines always re-render fresh immediately before committing (see
//     reactivity-setup.ts) -- a subsequent, non-stale commit reconciles it correctly.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { updateDOMNode } from "../renderer/renderer.js";
import { vnodeMetadata } from "../renderer/storage.js";
import { jsx } from "../vdom/vdom.js";

describe("updateElementNode — index-derived identity restore corrupts unrelated siblings", () => {
  it("does not bind a stale old child (missing .dom) to an unrelated live sibling by raw position", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    // The real, live siblings already correctly committed by an earlier, independent
    // commit pipeline -- exactly like a restored tab's already-rendered header + KPI card.
    const liveHeader = document.createElement("div");
    liveHeader.className = "alp-workspace-header";
    liveHeader.textContent = "Header A";
    parent.appendChild(liveHeader);

    const liveKpi = document.createElement("div");
    liveKpi.className = "kpi-card";
    liveKpi.textContent = "KPI 1";
    parent.appendChild(liveKpi);

    // A second, independent pipeline's STALE captured tree for this same parent: from its
    // perspective there was only ever one child (the KPI card) -- it never individually
    // tracked the header, so this old child vnode has no .dom reference of its own.
    const staleOldKpiVnode = jsx("div", { class: "kpi-card", children: "KPI 1" });
    const staleOldOuterVnode = jsx("div", { children: [staleOldKpiVnode] });
    vnodeMetadata.set(parent, staleOldOuterVnode);

    // That pipeline re-renders fresh and commits what it believes is just an updated KPI
    // card -- it has no idea the header exists as a sibling.
    const newKpiVnode = jsx("div", { class: "kpi-card", children: "KPI 2" });
    const newOuterVnode = jsx("div", { children: [newKpiVnode] });

    updateDOMNode(parent, newOuterVnode);

    // The header must survive, untouched, as its own distinct element.
    const header = parent.querySelector(".alp-workspace-header");
    expect(header).not.toBeNull();
    expect(header).toBe(liveHeader);
    expect(header?.textContent).toBe("Header A");

    // The KPI card must survive too, as the exact same live node -- not deleted, and not
    // merged into the header's element. Its content stays at the pre-stale-commit value:
    // this stale pass's update is correctly deferred (not silently misapplied), and would
    // be picked up by whichever subsequent, non-stale commit re-renders fresh next.
    const kpi = parent.querySelector(".kpi-card");
    expect(kpi).not.toBeNull();
    expect(kpi).toBe(liveKpi);
    expect(kpi?.textContent).toBe("KPI 1");

    expect(parent.children.length).toBe(2);
  });
});
