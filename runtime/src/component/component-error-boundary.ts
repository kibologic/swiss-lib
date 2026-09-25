/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Error boundary system, split out of component.ts (FRAME-PROPS-CHANGE-HOOK) to make room
// for the new prop-change hook wiring while keeping component.ts within the project's
// 700-line module-size limit. Pure extraction -- same logic, now free functions taking the
// component instance as their first argument instead of class methods, reaching the
// class's protected fields via asInternal() (the same pattern component-lifecycle.ts and
// update-manager.ts already use). component.ts's public methods (captureChildError,
// resetErrorBoundary, captureError, dispatchGlobalError) delegate to these unchanged, so
// nothing outside this file needed to change.
import type { SwissComponent } from "./component.js";
import type { SwissErrorInfo } from "./types/index.js";
import { asInternal } from "./internal.js";
import {
  getDevtoolsBridge,
  isDevtoolsEnabled,
  isTelemetryEnabled,
} from "../devtools/bridge.js";
import { getRemediationMessage } from "../error/remediation.js";

export function captureChildError(
  instance: SwissComponent,
  child: SwissComponent,
  errorInfo: SwissErrorInfo,
): boolean {
  const ci = asInternal(instance);
  if (
    (instance.constructor as typeof SwissComponent).isErrorBoundary &&
    !instance.error
  ) {
    ci._childErrors.set(child, errorInfo);
    instance.error = {
      error: new Error(`Error in child component ${child.constructor.name}`),
      phase: "render",
      component: instance,
      timestamp: Date.now(),
    };
    instance.scheduleUpdate();
    return true;
  }

  if (ci._parent) {
    return ci._parent.captureChildError(instance, errorInfo);
  }

  return false;
}

export function resetErrorBoundary(instance: SwissComponent): void {
  const ci = asInternal(instance);
  if (instance.error || ci._capturedError) {
    instance.error = null;
    ci._capturedError = null;
    ci._childErrors.clear();
    instance.scheduleUpdate();
  }

  ci._children.forEach((child) => {
    if ((child.constructor as typeof SwissComponent).isErrorBoundary) {
      child.resetErrorBoundary();
    }
  });
}

export function captureError(
  instance: SwissComponent,
  error: unknown,
  phase: string,
): void {
  const ci = asInternal(instance);
  if (ci._errorHandlingPhase) return;
  ci._errorHandlingPhase = true;

  const normalizedError =
    error === undefined || error === null
      ? new Error(`${phase}: component threw ${String(error)}`)
      : error;

  const errorInfo: SwissErrorInfo = {
    error: normalizedError,
    phase,
    component: instance,
    timestamp: Date.now(),
  };

  instance.error = errorInfo;

  console.error(
    `Error in component ${instance.constructor.name} during ${phase}:`,
    error,
  );

  if (isDevtoolsEnabled()) {
    try {
      const required =
        (instance.constructor as typeof SwissComponent).requires ?? [];
      const advice = getRemediationMessage(error, phase, instance, required);
      getDevtoolsBridge().recordEvent({
        t: Date.now(),
        type: "error",
        msg: `${ci._devtoolsId}:${advice.message}`,
      });
      if (isTelemetryEnabled() && getDevtoolsBridge().recordEventTyped) {
        try {
          getDevtoolsBridge().recordEventTyped!({
            t: Date.now(),
            category: "error",
            name: "boundary-error",
            componentId: ci._devtoolsId,
            data: { message: advice.message, phase },
          });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  let boundary = ci._parent;
  while (boundary && !boundary.captureChildError(instance, errorInfo)) {
    boundary = asInternal(boundary)._parent;
  }

  if (!boundary) {
    instance.dispatchGlobalError(error, phase);
  }

  ci._errorHandlingPhase = false;
}

export function dispatchGlobalError(
  instance: SwissComponent,
  error: unknown,
  phase: string,
): void {
  const event = new CustomEvent("swiss-error", {
    detail: {
      error,
      phase,
      component: instance,
      timestamp: Date.now(),
    },
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}
