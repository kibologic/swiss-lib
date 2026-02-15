/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { reactive } from "../reactivity/reactive.js";
import { effect } from "../reactivity/effect.js";
import { type EffectDisposer } from "../reactivity/types/index.js";
import type { SwissComponent } from "./component.js";
import type { BaseComponentState } from "./types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Manages reactivity setup for components
 */
export class ReactivityManager<S extends BaseComponentState = BaseComponentState> {
  private _reactivitySetup: boolean = false;
  private _effects: Set<EffectDisposer> = new Set();

  constructor(private component: SwissComponent<any, S>) {}

  /**
   * Setup reactivity for the component
   */
  public setupReactivity(): void {
    // Prevent multiple calls to setupReactivity
    if (this._reactivitySetup) {
      logger.lifecycle(`${this.component.constructor.name}: setupReactivity already called, skipping`);
      return;
    }
    this._reactivitySetup = true;

    logger.lifecycle(`${this.component.constructor.name}: setupReactivity`);
    const renderEffect = effect(() => {
      // CRITICAL: The render() method accesses state properties (e.g., this.state.sidebarCollapsed)
      // This access happens during render, which triggers the Proxy get trap
      // The get trap tracks this effect as a listener for those specific properties
      
      // Call performUpdate which will call safeRender internally
      // performUpdate handles all the DOM update logic
      (this.component as any).performUpdate();
    });
    this.trackEffect(renderEffect);
  }

  /**
   * Ensure state is reactive
   */
  public ensureStateReactive(): void {
    // Only make state reactive if it's not already reactive
    if (!(this.component.state as any).__listeners) {
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

