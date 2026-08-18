/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Article 17 use-case tests for the transition/animation API (feat/transition-api).
//
// The API is opt-in via a `transition` prop on an element vnode (string shorthand = CSS
// class name prefix, or a full TransitionSpec object with JS hooks). It hooks the
// renderer's real enter path (dom-creation.ts's createElementNode, called for every new
// element) and real leave/removal paths (reconciliation.ts's leftover-node cleanup pass,
// dom-updates.ts's null/false-child removal) -- see transition-runtime.ts. Elements with
// no `transition` prop are provably unaffected: removeWithTransition's no-spec branch is
// byte-for-byte the synchronous cleanupNode()+removeChild() sequence these tests' sibling
// suites (e.g. conditional-children-commit-drop-repro.test.ts) already exercise.
//
// jsdom fires neither real CSS transitions nor a real-clock requestAnimationFrame (its rAF
// is a setTimeout(~16ms) polyfill), so every test here runs on vi.useFakeTimers() and
// advances time explicitly, and dispatches synthetic `transitionend` events -- per Article
// 17's determinism requirement (a test relying on jsdom's actual timer granularity would be
// flaky by construction).

import "reflect-metadata";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { jsx } from "../vdom/vdom.js";
import type { TransitionSpec } from "../transitions/transition-types.js";

function fireTransitionEnd(el: HTMLElement) {
  el.dispatchEvent(new Event("transitionend"));
}

// The runtime's nextFrame() does a double-rAF (or falls back to setTimeout(0)); advancing
// fake timers past two animation frames covers either implementation deterministically.
async function advancePastNextFrame() {
  await vi.advanceTimersByTimeAsync(32);
}

// createElementNode (dom-creation.ts) builds a subtree bottom-up and runs BEFORE its
// caller attaches it to a parent (renderToDOM's initial-mount path: createDOMNodeBound()
// completes fully, THEN container.appendChild(domNode) -- see renderer.ts). The enter
// transition therefore waits for `isConnected` via bounded microtask polling (see
// runEnterTransition's waitForConnected in transition-runtime.ts) before it applies
// anything. Flush that polling window once after mount before asserting "immediate"
// enter-class application.
async function flushConnectWait() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Transition API", () => {
  describe("enter", () => {
    it("applies enter-from+enter-active immediately, then swaps to enter-to on the next frame, then clears all enter classes once the transition settles", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const spec: TransitionSpec = { name: "fade" };
      renderToDOM(jsx("div", { transition: spec, id: "box" }), container);
      const box = container.querySelector("#box") as HTMLElement;

      // Enter starts as soon as the element is connected (createElementNode runs before
      // its caller attaches it to the DOM -- see flushConnectWait's comment above) -- well
      // before the actual transition frame, so a real browser has a "from" state to
      // transition away from.
      await flushConnectWait();
      expect(box.classList.contains("fade-enter-from")).toBe(true);
      expect(box.classList.contains("fade-enter-active")).toBe(true);
      expect(box.classList.contains("fade-enter-to")).toBe(false);

      await advancePastNextFrame();

      // After the next-frame tick: enter-from is gone, enter-to is applied, enter-active
      // stays (it's what actually declares the CSS `transition:` property).
      expect(box.classList.contains("fade-enter-from")).toBe(false);
      expect(box.classList.contains("fade-enter-to")).toBe(true);
      expect(box.classList.contains("fade-enter-active")).toBe(true);

      fireTransitionEnd(box);

      // Once the transition settles, ALL enter classes are removed -- nothing lingers on
      // an element that's just sitting there mounted.
      expect(box.classList.contains("fade-enter-from")).toBe(false);
      expect(box.classList.contains("fade-enter-active")).toBe(false);
      expect(box.classList.contains("fade-enter-to")).toBe(false);
    });

    it("fires onBeforeEnter/onEnter/onAfterEnter in order, and onEnter's done() gates onAfterEnter", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const order: string[] = [];
      let doneCb: (() => void) | undefined;
      const spec: TransitionSpec = {
        css: false, // isolate JS-hook ordering from CSS class timing
        onBeforeEnter: () => order.push("beforeEnter"),
        onEnter: (_el, done) => {
          order.push("enter");
          doneCb = done;
        },
        onAfterEnter: () => order.push("afterEnter"),
      };

      renderToDOM(jsx("div", { transition: spec, id: "box" }), container);

      await flushConnectWait();
      expect(order).toEqual(["beforeEnter"]);

      await advancePastNextFrame();
      expect(order).toEqual(["beforeEnter", "enter"]);
      // afterEnter must NOT fire until the JS hook calls done() -- this is the
      // "coordinated with the renderer" contract, not a fire-and-forget class toggle.
      expect(order).not.toContain("afterEnter");

      doneCb!();
      expect(order).toEqual(["beforeEnter", "enter", "afterEnter"]);
    });

    it("an element with no transition prop mounts with zero transition classes and is unaffected", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      renderToDOM(jsx("div", { id: "plain" }), container);
      const plain = container.querySelector("#plain") as HTMLElement;
      expect(plain.className).toBe("");
    });
  });

  describe("leave", () => {
    it("defers the actual unmount/removal until the leave transition completes (transitionend)", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const spec: TransitionSpec = { name: "fade" };
      const build = (show: boolean) =>
        jsx("div", {
          children: [
            show ? jsx("p", { key: "panel", transition: spec, id: "panel" }) : null,
          ],
        });

      renderToDOM(build(true), container);
      const root = container.firstElementChild as HTMLElement;
      expect(root.querySelector("#panel")).not.toBeNull();

      // Trigger removal via the real reconciliation leftover-node path.
      updateDOMNode(root, build(false));

      // Leave classes are applied immediately...
      const panel = root.querySelector("#panel") as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.classList.contains("fade-leave-active")).toBe(true);

      await advancePastNextFrame();
      // ...but the node is STILL in the DOM -- removal is deferred, not skipped.
      expect(root.querySelector("#panel")).not.toBeNull();

      fireTransitionEnd(panel);

      // Only once the transition settles does the real DOM removal happen.
      expect(root.querySelector("#panel")).toBeNull();
    });

    it("fires onBeforeLeave/onLeave/onAfterLeave in order, gated by onLeave's done()", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const order: string[] = [];
      let doneCb: (() => void) | undefined;
      const spec: TransitionSpec = {
        css: false,
        onBeforeLeave: () => order.push("beforeLeave"),
        onLeave: (_el, done) => {
          order.push("leave");
          doneCb = done;
        },
        onAfterLeave: () => order.push("afterLeave"),
      };
      const build = (show: boolean) =>
        jsx("div", {
          children: [show ? jsx("p", { key: "panel", transition: spec }) : null],
        });

      renderToDOM(build(true), container);
      const root = container.firstElementChild as HTMLElement;

      updateDOMNode(root, build(false));
      expect(order).toEqual(["beforeLeave"]);

      await advancePastNextFrame();
      expect(order).toEqual(["beforeLeave", "leave"]);
      expect(order).not.toContain("afterLeave");
      // Still attached -- removal genuinely deferred, not raced against the hook.
      expect(root.querySelector("p")).not.toBeNull();

      doneCb!();

      expect(order).toEqual(["beforeLeave", "leave", "afterLeave"]);
      expect(root.querySelector("p")).toBeNull();
    });

    it("falls back to the duration timer and still removes the node when no transitionend ever fires", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const spec: TransitionSpec = { name: "fade", duration: 50 };
      const build = (show: boolean) =>
        jsx("div", {
          children: [show ? jsx("p", { key: "panel", transition: spec, id: "panel" }) : null],
        });

      renderToDOM(build(true), container);
      const root = container.firstElementChild as HTMLElement;

      updateDOMNode(root, build(false));
      await advancePastNextFrame();

      expect(root.querySelector("#panel")).not.toBeNull();

      // No transitionend dispatched -- only the timer fallback can remove it.
      await vi.advanceTimersByTimeAsync(60);
      expect(root.querySelector("#panel")).toBeNull();
    });

    it("a node with no transition prop is removed synchronously, exactly as before this feature existed", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const build = (show: boolean) =>
        jsx("div", { children: [show ? jsx("p", { key: "panel", id: "panel" }) : null] });

      renderToDOM(build(true), container);
      const root = container.firstElementChild as HTMLElement;
      expect(root.querySelector("#panel")).not.toBeNull();

      updateDOMNode(root, build(false));
      // No timer advance needed -- synchronous removal, unchanged behavior.
      expect(root.querySelector("#panel")).toBeNull();
    });
  });

  describe("interruption / cancellation", () => {
    it("a second leave request for the same element cancels the first in-flight leave instead of double-firing done", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      let leaveCancelledCount = 0;
      const spec: TransitionSpec = {
        css: false,
        onLeave: () => {
          /* never calls done -- simulates a slow/stuck transition */
        },
        onLeaveCancelled: () => {
          leaveCancelledCount++;
        },
      };
      const build = (show: boolean) =>
        jsx("div", {
          children: [show ? jsx("p", { key: "panel", transition: spec, id: "panel" }) : null],
        });

      renderToDOM(build(true), container);
      const root = container.firstElementChild as HTMLElement;

      // First removal request starts a leave that will never call done().
      updateDOMNode(root, build(false));
      await advancePastNextFrame();

      // A second removal request against the same still-attached node (e.g. a rapid
      // re-toggle re-driving the reconciler's leftover pass again) must cancel the first
      // in-flight leave rather than run two competing leave sequences against one element.
      const { removeWithTransition } = await import("../transitions/transition-runtime.js");
      const panel = root.querySelector("#panel") as HTMLElement;
      const commitCalls: number[] = [];
      removeWithTransition(panel, () => commitCalls.push(1));

      expect(leaveCancelledCount).toBe(1);
    });
  });
});
