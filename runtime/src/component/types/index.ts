/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Plugin } from '../../plugins/pluginInterface.js';
import type { SwissComponent } from '../component.js';

export type LifecyclePhase =
  | 'init' | 'mount' | 'update' | 'destroy'
  | 'secure' | 'optimize' | 'extend'
  | 'render' | 'error'
  | string;

/**
 * FRAME-on-collision: the exact set of phase names `executeHookPhase()` actually fires
 * (component-lifecycle.ts, component.ts, update-manager.ts, dom-creation.ts, hydration.ts,
 * ssr.ts, dom-updates.ts -- verified by grep against every `executeHookPhase("...")` call
 * site). `SwissComponent.prototype.on` (component.ts) is the class's own lifecycle-hook
 * registrar, delegating to `_lifecycle.on()` (LifecycleManager) -- but event-system.ts's
 * module-level `SwissComponent.prototype.on = function(eventType, ...) {...}` (a DOM-style
 * capture/bubble custom-event emitter, `_eventRegistry`-backed) unconditionally OVERWRITES
 * it at import time, since both attach to the exact same property name. Whichever module
 * happens to be imported/evaluated last wins outright -- there is no merge. Live-confirmed:
 * once event-system.ts loads, `this.on('updated', cb)` (the documented pattern for a
 * component to react to its own commits, e.g. office's PdfViewerPage) silently registers
 * into `_eventRegistry` instead of `_lifecycle.hooks`, and `executeHookPhase('updated')`
 * (which only ever reads `_lifecycle.hooks`) never invokes it -- no error, no warning,
 * the callback just never runs. event-system.ts's `on()` checks this set first and
 * delegates to the ORIGINAL lifecycle registrar for these names, restoring the class's own
 * intended behavior, while every other event name still goes through the custom emitter.
 */
export const KNOWN_LIFECYCLE_HOOK_PHASES: ReadonlySet<string> = new Set([
  'init', 'mount',
  'beforeMount', 'mounted',
  'beforeUnmount', 'unmounted',
  'beforeRender', 'afterRender',
  'updated',
]);

// Context storage used by components
export type ContextMap = Map<symbol, unknown>;

// Capability set used in component options
export type CapabilitySet = Set<string>;

// Options accepted by SwissComponent constructor
export interface SwissComponentOptions {
  context?: ContextMap;
  capabilities?: CapabilitySet;
  plugins?: Plugin[];
  errorBoundary?: boolean;
  isServer?: boolean;
}

// Lifecycle hook registration stored on SwissComponent
export interface ComponentHook {
  phase: string;
  callback: (...args: unknown[]) => void;
  once: boolean;
  capability: string | undefined;
  priority: number;
}

// Error information used by error boundaries and reporting
export interface SwissErrorInfo {
  error: Error | unknown;
  phase: string;
  component: SwissComponent;
  timestamp: number;
}

export type ComponentConstructor = new (...args: unknown[]) => unknown;

// Re-export router types used by some component consumers
import type { RouteDefinition } from '../../types/routing.js';
export type { RouteDefinition };
import type { VNode } from '../../vdom/types/index.js';

// Base component props/state
export interface BaseComponentState {
  [key: string]: unknown;
}

export interface BaseComponentProps {
  [key: string]: unknown;
}

// ErrorBoundary props/state
export interface ErrorBoundaryState {
  error: unknown | null;
  [key: string]: unknown;
}

export interface ErrorBoundaryProps {
  fallback: (error: unknown, reset: () => void) => VNode;
  children: VNode[];
  [key: string]: unknown;
}

// Event handler options for decorators
export interface EventHandlerOptions {
  selector?: string;
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  capability?: string;
  throttle?: number;
  debounce?: number;
}

export interface SwissEventHandlerEntry {
  eventType: string;
  method: string;
  selector?: string;
  options: {
    capture?: boolean;
    once?: boolean;
    passive?: boolean;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    capability?: string;
  };
}
