/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * JS lifecycle hooks fired around an element's enter/leave transition, mirroring the
 * component lifecycle's beforeMount/mounted/beforeUnmount/unmounted symmetry (see
 * component-lifecycle.ts). Leave hooks receive `done` because the actual DOM removal
 * (cleanupNode + removeChild, see reconciliation.ts) must be deferred until the caller
 * invokes it -- see remove-with-transition.ts.
 */
export interface TransitionHooks {
  onBeforeEnter?: (el: HTMLElement) => void;
  onEnter?: (el: HTMLElement, done: () => void) => void;
  onAfterEnter?: (el: HTMLElement) => void;
  onEnterCancelled?: (el: HTMLElement) => void;

  onBeforeLeave?: (el: HTMLElement) => void;
  onLeave?: (el: HTMLElement, done: () => void) => void;
  onAfterLeave?: (el: HTMLElement) => void;
  onLeaveCancelled?: (el: HTMLElement) => void;
}

/**
 * A transition spec attached to an element via the `transition` prop. `name` drives the
 * default CSS class scheme (`${name}-enter-from`, etc.) the same way Alpine ERP authors
 * already name BEM-ish CSS classes elsewhere in the codebase -- no new class-naming
 * convention introduced. Any of the six class names can be overridden individually.
 */
export interface TransitionSpec extends TransitionHooks {
  /** Base name for the default CSS class scheme. Defaults to "swiss". */
  name?: string;
  /** Skip CSS class application entirely and rely on JS hooks' `done()` alone. */
  css?: boolean;

  enterFromClass?: string;
  enterActiveClass?: string;
  enterToClass?: string;

  leaveFromClass?: string;
  leaveActiveClass?: string;
  leaveToClass?: string;

  /** Fallback timeout (ms) if no transitionend/animationend fires. Defaults to 1000. */
  duration?: number;
}

export function resolveClassNames(spec: TransitionSpec): {
  enterFrom: string;
  enterActive: string;
  enterTo: string;
  leaveFrom: string;
  leaveActive: string;
  leaveTo: string;
} {
  const name = spec.name ?? "swiss";
  return {
    enterFrom: spec.enterFromClass ?? `${name}-enter-from`,
    enterActive: spec.enterActiveClass ?? `${name}-enter-active`,
    enterTo: spec.enterToClass ?? `${name}-enter-to`,
    leaveFrom: spec.leaveFromClass ?? `${name}-leave-from`,
    leaveActive: spec.leaveActiveClass ?? `${name}-leave-active`,
    leaveTo: spec.leaveToClass ?? `${name}-leave-to`,
  };
}
