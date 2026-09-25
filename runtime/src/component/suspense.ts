/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// ASYNC-001: <Suspense> boundary. Modeled directly on ErrorBoundary (error-boundary.ts):
// same shape (state-holding SwissComponent subclass, renderWithBoundary() single-child unwrap
// to sidestep the Fragment-as-component-root reconciliation gap documented there and in FRAME-005/
// FRAME-006-B) and the SAME propagation mechanism ErrorBoundary uses for thrown Errors --
// SwissComponent.captureError() (component.ts) walks the _parent chain calling
// captureChildError() on each ancestor until one claims it. A descendant's render() throwing a
// SuspensionSignal (resource.ts) is not itself a component render -- Suspense.render() only ever
// returns `props.children` or `props.fallback`; it never calls the descendant's render() inside
// its own call stack, that happens later during reconciliation/mount for a *different* component
// instance. So catching in Suspense.render()'s own try/catch cannot work: the throw and the catch
// are in different components' render passes entirely. Instead this mirrors captureChildError's
// walk exactly -- see component.ts's safeRender()/component-rendering.ts's renderComponent(),
// which special-case SuspensionSignal and call receiveSuspension() up the _parent chain instead
// of routing it through captureError()/findErrorBoundary().
//
// Nested Suspense falls out of the walk itself: receiveSuspension() stops at the FIRST
// isSuspenseBoundary ancestor it finds, exactly as captureChildError() stops at the first
// isErrorBoundary ancestor -- an inner <Suspense> always claims a suspension from its own
// subtree before an outer one ever sees it.

import { type BaseComponentState, type BaseComponentProps } from './types/index.js';
import { type VNode } from '../vdom/vdom.js';
import { SwissComponent } from './component.js';

export interface SuspenseProps extends BaseComponentProps {
  fallback: VNode;
  children: VNode[] | VNode;
}

export interface SuspenseState extends BaseComponentState {
  suspended: boolean;
}

export class Suspense extends SwissComponent<SuspenseProps, SuspenseState> {
  static isSuspenseBoundary = true;
  state: SuspenseState = { suspended: false };
  private _waitingOn: Promise<unknown> | null = null;

  /**
   * Claim a pending resource read from a descendant. Mirrors captureChildError()'s shape
   * (component.ts) but for the "still loading" case instead of the "threw an error" case --
   * flips to the fallback instead of the error-fallback UI, and re-renders once the promise
   * settles instead of waiting for resetErrorBoundary().
   */
  receiveSuspension(promise: Promise<unknown>): void {
    if (this._waitingOn === promise) return; // already waiting on this exact fetch
    this._waitingOn = promise;
    if (!this.state.suspended) this.state.suspended = true;

    if (!this._isMounted) {
      // ASYNC-001 initial-mount race: a descendant can throw SuspensionSignal from INSIDE this
      // Suspense's own first-ever DOM build. dom-creation.ts's child-creation path renders a
      // component's vnode tree and builds its real DOM BEFORE calling that component's own
      // initialize() (which is what sets up the render-effect this.scheduleUpdate() ultimately
      // relies on) -- so a suspension discovered while still inside that pre-initialize DOM
      // build has no live effect/update pipeline yet to schedule into; state.suspended is set
      // above (plain field write, persists once ensureStateReactive() wraps it later), but
      // there is nothing yet to notify. Once initialize() runs moments later, its render-effect
      // synchronously re-renders and correctly sees suspended=true -- but that pass is treated
      // as the routine "redundant first effect run" (reactivity-setup.ts's _firstRun guard) and
      // its result is discarded, because the DOM this component was mounted with is the one
      // dom-creation.ts already built from the stale, pre-suspension render. A microtask-deferred
      // scheduleUpdate(), queued after the current synchronous mount call stack (which includes
      // this Suspense's own initialize()) has fully unwound, is what actually gets an update
      // pipeline to run against: by then _isMounted/_container/_domNode are all real. This is a
      // one-time bootstrap nudge, not a new per-suspension side effect -- see the plain
      // scheduleUpdate() call below for the ordinary (already-mounted) case.
      // Two ticks: dom-creation.ts's armPostInitSkip() (called right after this component's own
      // initialize(), which happens AFTER this receiveSuspension() call in the same synchronous
      // mount stack) queues its own microtask to clear `_skipNextUpdate` -- queued strictly after
      // ours since initialize() hasn't run yet when we get here. One tick lands inside that skip
      // window and is silently absorbed by performUpdate()'s `_skipNextUpdate` guard
      // (update-manager.ts); two ticks lands after it clears.
      queueMicrotask(() => queueMicrotask(() => this.scheduleUpdate()));
    } else {
      this.scheduleUpdate();
    }

    // Use .then(onSettle, onSettle) rather than .finally(): the SuspensionSignal carries the
    // SAME promise resource.ts's own _load() is already handling (data/error/pending signals).
    // .finally() re-throws on rejection (its own returned promise rejects), and since nothing
    // reads that returned promise, a rejected resource would otherwise surface as an unhandled
    // rejection here even though resource.ts already handled it via its own .then(). A resolved
    // .then(ok, ok) callback never rejects, so it cannot add a second unhandled rejection.
    const onSettle = () => {
      if (this._waitingOn !== promise) return; // superseded by a newer suspension
      this._waitingOn = null;
      this.state.suspended = false;
      // Re-render: the resource's signals already flipped (resource.ts's _load), so the
      // descendant's next render reads through to real data/updated pending state -- unless a
      // *different* nested resource is now pending, in which case that descendant throws again
      // and receiveSuspension() just re-arms this same boundary on the new promise.
      this.scheduleUpdate();
    };
    promise.then(onSettle, onSettle);
  }

  render(): VNode {
    if (this.state.suspended) {
      return this.props.fallback;
    }
    const children = Array.isArray(this.props.children) ? this.props.children : [this.props.children];
    return this.renderWithBoundary(children);
  }
}
