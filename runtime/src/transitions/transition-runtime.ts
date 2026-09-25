/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { resolveClassNames, type TransitionSpec } from "./transition-types.js";
import { getTransition } from "./transition-registry.js";

const DEFAULT_DURATION = 1000;

/** Elements with a leave transition currently in flight -- checked by remove-with-transition
 * so a second removal request for the same element (e.g. a rapid re-toggle) cancels the
 * first instead of racing two `done()` callbacks against the same DOM node. */
const activeLeaves = new WeakMap<HTMLElement, { cancel: () => void }>();

function nextFrame(cb: () => void): void {
  // jsdom has no rAF-driven layout; a microtask + macrotask pair is the same two-tick
  // separation requestAnimationFrame gives real browsers between "class added" and
  // "class observed by the transition engine" -- enough for enter-from to be removed on a
  // separate tick from enter-active being added, which is what CSS transitions require to
  // actually animate (same-tick add+remove never transitions in a real browser either).
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(cb));
  } else {
    setTimeout(cb, 0);
  }
}

function waitForTransitionEnd(
  el: HTMLElement,
  duration: number,
  onDone: () => void,
): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (done) return;
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    el.removeEventListener("transitionend", onEvent);
    el.removeEventListener("animationend", onEvent);
    onDone();
  };
  const onEvent = (e: Event) => {
    if (e.target !== el) return;
    finish();
  };

  el.addEventListener("transitionend", onEvent);
  el.addEventListener("animationend", onEvent);
  timer = setTimeout(finish, duration);

  return () => {
    // Cancel path: stop waiting without invoking onDone (caller decides what "cancelled"
    // means for its own done()/cleanup).
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    el.removeEventListener("transitionend", onEvent);
    el.removeEventListener("animationend", onEvent);
  };
}

/**
 * Runs the enter transition for a freshly-created element, if it carries a `transition`
 * prop. Called unconditionally from createElementNode (dom-creation.ts) right after the
 * element itself is built -- BEFORE its caller has necessarily inserted it into a parent,
 * since dom-creation.ts's createDOMNode/createElementNode recursion builds subtrees
 * bottom-up and the actual `appendChild`/`insertBefore` happens at any of several call
 * sites up the stack (renderer.ts's initial mount, reconciliation.ts's new-child insert
 * and reorder pass, hydration.ts). Rather than instrument every attach site, wait for
 * `isConnected` via microtask polling (bounded) -- the enter transition already defers a
 * full frame past that point regardless, so this adds no observable latency.
 */
export function runEnterTransition(el: HTMLElement): void {
  const spec = getTransition(el);
  if (!spec) return;

  const MAX_CONNECT_WAIT_TICKS = 20;
  let ticks = 0;
  const waitForConnected = (cb: () => void) => {
    if (el.isConnected || ticks >= MAX_CONNECT_WAIT_TICKS) {
      cb();
      return;
    }
    ticks++;
    queueMicrotask(() => waitForConnected(cb));
  };

  waitForConnected(() => startEnter(el, spec));
}

function startEnter(el: HTMLElement, spec: TransitionSpec): void {
  spec.onBeforeEnter?.(el);

  const useCss = spec.css !== false;
  const classes = resolveClassNames(spec);
  const duration = spec.duration ?? DEFAULT_DURATION;

  if (useCss) {
    el.classList.add(classes.enterFrom, classes.enterActive);
  }

  const finishEnter = () => {
    if (useCss) {
      el.classList.remove(classes.enterFrom, classes.enterTo, classes.enterActive);
    }
    spec.onAfterEnter?.(el);
  };

  nextFrame(() => {
    if (useCss) {
      el.classList.remove(classes.enterFrom);
      el.classList.add(classes.enterTo);
    }

    let jsDone = false;
    const onJsDone = () => {
      if (jsDone) return;
      jsDone = true;
      if (useCss) {
        waitForTransitionEnd(el, duration, finishEnter);
      } else {
        finishEnter();
      }
    };

    if (spec.onEnter) {
      spec.onEnter(el, onJsDone);
    } else {
      onJsDone();
    }
  });
}

/**
 * Runs the leave transition (if any) for `node`, then invokes `commitRemoval` -- the
 * actual cleanupNode()+removeChild() pair the reconciler would otherwise have run
 * synchronously. Returns immediately (removal deferred) if a transition ran; commitRemoval
 * is still called exactly once, either synchronously (no transition registered) or after
 * the transition settles.
 *
 * This intentionally only inspects `node` itself, not descendants: transitions are opt-in
 * per-element via the `transition` prop, and the removal call sites in reconciliation.ts /
 * dom-updates.ts always operate on the node actually being detached from its parent (never
 * a descendant), so a subtree scan would be dead code, not defence in depth.
 */
export function removeWithTransition(node: Node, commitRemoval: () => void): void {
  if (!(node instanceof HTMLElement)) {
    commitRemoval();
    return;
  }

  const spec = getTransition(node);
  if (!spec) {
    commitRemoval();
    return;
  }

  // Interrupt: an enter for this same element may still be in flight (rapid mount+unmount).
  // We don't try to reverse it -- we just make sure only one leave sequence per element runs.
  const inFlight = activeLeaves.get(node);
  if (inFlight) {
    inFlight.cancel();
    activeLeaves.delete(node);
  }

  spec.onBeforeLeave?.(node);

  const useCss = spec.css !== false;
  const classes = resolveClassNames(spec);
  const duration = spec.duration ?? DEFAULT_DURATION;
  let settled = false;
  let cancelWait: (() => void) | undefined;

  const finishLeave = () => {
    if (settled) return;
    settled = true;
    activeLeaves.delete(node);
    if (useCss) {
      node.classList.remove(classes.leaveFrom, classes.leaveTo, classes.leaveActive);
    }
    commitRemoval();
    spec.onAfterLeave?.(node);
  };

  activeLeaves.set(node, {
    cancel: () => {
      if (settled) return;
      settled = true;
      cancelWait?.();
      spec.onLeaveCancelled?.(node);
    },
  });

  if (useCss) {
    node.classList.add(classes.leaveFrom, classes.leaveActive);
  }

  nextFrame(() => {
    if (settled) return;
    if (useCss) {
      node.classList.remove(classes.leaveFrom);
      node.classList.add(classes.leaveTo);
    }

    let jsDone = false;
    const onJsDone = () => {
      if (jsDone || settled) return;
      jsDone = true;
      if (useCss) {
        cancelWait = waitForTransitionEnd(node, duration, finishLeave);
      } else {
        finishLeave();
      }
    };

    if (spec.onLeave) {
      spec.onLeave(node, onJsDone);
    } else {
      onJsDone();
    }
  });
}

export type { TransitionSpec };
