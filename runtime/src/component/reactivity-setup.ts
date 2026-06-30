/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { reactive } from "../reactivity/reactive.js";
import { effect, untrack } from "../reactivity/effect.js";
import { type EffectDisposer } from "../reactivity/types/index.js";
import type { SwissComponent } from "./component.js";
import type { BaseComponentProps, BaseComponentState } from "./types/index.js";
import { logger } from "../utils/logger.js";
import type { VNode } from "../vdom/vdom.js";

/**
 * Manages reactivity setup for components
 */
export class ReactivityManager<
  S extends BaseComponentState = BaseComponentState,
> {
  private _reactivitySetup: boolean = false;
  private _effects: Set<EffectDisposer> = new Set();

  constructor(private component: SwissComponent<BaseComponentProps, S>) {}

  /**
   * Setup reactivity for the component.
   *
   * Signal changes are batched through a queueMicrotask deduplicator: if multiple
   * signals change synchronously (e.g. multiple state fields updated in one event
   * handler, or rapid input events), only one DOM commit runs per microtask tick.
   * This prevents per-keystroke full-page reconciliation that would otherwise
   * destroy focused elements on every character.
   *
   * The very first effect execution is skipped — mount() performs the initial
   * commit explicitly after beforeMount fires, and child components created via
   * createDOMNode() already have their DOM by the time the effect first runs.
   */
  public setupReactivity(): void {
    if (this._reactivitySetup) {
      logger.lifecycle(
        `${this.component.constructor.name}: setupReactivity already called, skipping`,
      );
      return;
    }
    this._reactivitySetup = true;

    logger.lifecycle(`${this.component.constructor.name}: setupReactivity`);

    let _firstRun = true;
    let _commitPending = false;
    let _pendingVNode: VNode | null = null;

    const renderEffect = effect(() => {
      // Run render inside the effect so state reads are tracked by Signal/Effect.
      const newVNode = this.component.safeRender();

      untrack(() => {
        if (newVNode === null) return;

        if (_firstRun) {
          // Initial execution runs synchronously during initialize(). The mount()
          // method (or createDOMNode for child components) handles the first DOM
          // commit explicitly — skip here to avoid a double-commit.
          _firstRun = false;
          return;
        }

        // Coalesce rapid signal changes: store the latest VNode and schedule exactly
        // one DOM commit per microtask tick. Subsequent changes before the microtask
        // fires overwrite _pendingVNode so only the final state is committed.
        // _signalCommitPending is read by UpdateManager.scheduleUpdate() to avoid
        // queueing a redundant second reconciliation pass when both a signal effect
        // and an explicit scheduleUpdate() fire in the same synchronous event handler.
        _pendingVNode = newVNode;
        if (_commitPending) return;
        _commitPending = true;
        this.component._signalCommitPending = true;

        queueMicrotask(() => {
          _commitPending = false;
          this.component._signalCommitPending = false;
          const vnode = _pendingVNode;
          _pendingVNode = null;
          if (vnode !== null) this.component.commitVNode(vnode);
        });
      });
    });
    this.trackEffect(renderEffect);
  }

  /**
   * Ensure state is reactive
   */
  public ensureStateReactive(): void {
    if (!(this.component.state as Record<string, unknown>)['__reactive']) {
      this.component.state = reactive(this.component.state as S) as S;
    }
  }

  /**
   * Track an effect for cleanup
   */
  public trackEffect(disposer: EffectDisposer): void {
    this._effects.add(disposer);
  }

  /**
   * Clear all effects
   */
  public clearEffects(): void {
    this._effects.forEach((disposer) => disposer());
    this._effects.clear();
  }

  /**
   * Check if reactivity is setup
   */
  public isSetup(): boolean {
    return this._reactivitySetup;
  }
}
