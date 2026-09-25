/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { TransitionSpec } from "./transition-types.js";

/**
 * Elements carrying an active `transition` prop, keyed by their live DOM node -- same
 * storage shape as vnodeMetadata/componentInstances in renderer/storage.ts (WeakMap keyed
 * on the DOM node, so entries are GC'd with the element automatically; no explicit
 * teardown needed on the happy path).
 */
export const transitionSpecs = new WeakMap<HTMLElement, TransitionSpec>();

/**
 * Normalizes the `transition` prop value (string shorthand or full spec object) and
 * registers it. Called from createElementNode (dom-creation.ts) at element-creation time,
 * mirroring how the `ref` prop is captured there (see FRAME-006-capability-build-portals-refs).
 */
export function registerTransition(
  element: HTMLElement,
  transitionProp: unknown,
): void {
  if (transitionProp == null || transitionProp === false) return;
  const spec: TransitionSpec =
    typeof transitionProp === "string"
      ? { name: transitionProp }
      : (transitionProp as TransitionSpec);
  transitionSpecs.set(element, spec);
}

export function getTransition(element: HTMLElement): TransitionSpec | undefined {
  return transitionSpecs.get(element);
}
