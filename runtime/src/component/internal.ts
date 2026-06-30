/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from './component.js';
import type { VNode } from '../vdom/types/index.js';
import type { ComponentHook, SwissEventHandlerEntry } from './types/index.js';

/**
 * Internal shape of SwissComponent accessible to framework-internal helper
 * modules (component-lifecycle, update-manager, update-strategies, portals).
 *
 * Consumer code must never reference this interface — it exposes protected
 * framework internals that are not part of the public component API.
 */
export interface ComponentInternals {
  readonly _devtoolsId: string;
  _isMounted: boolean;
  _container: HTMLElement | null;
  _domNode: Node | null;
  _vnode: VNode | null;
  _portals: Map<HTMLElement, VNode>;
  _hooks: ComponentHook[];
  _slotContent: Map<string, VNode[]>;
  _parent: SwissComponent | null;
  _children: SwissComponent[];
  _mounting: boolean;
  _skipNextUpdate: boolean;
  _signalCommitPending: boolean;
  _initialized: boolean;
  /** Renderer-internal: set to true when the instance has been fully init'd by the DOM renderer */
  __initialized: boolean;
  /** Renderer-internal: the last component VNode that rendered this instance */
  __componentVNode: VNode | null;
  /** Renderer-internal: key from the VNode used to mount this instance, for reconciliation */
  __vnodeKey?: string | number;
  _swissEventHandlers?: SwissEventHandlerEntry[];
  state: Record<string, unknown>;
  clearCapabilityCache(): void;
  initialize(): void;
  executeHookPhase(phase: string): Promise<void>;
  captureError(error: unknown, phase: string): void;
  captureChildError(child: SwissComponent, errorInfo: unknown): boolean;
  commitVNode(vnode: VNode): void;
  safeRender(): VNode | null;
  clearEffects(): void;
  scheduleUpdate(): void;
  [method: string]: unknown;
}

export function asInternal(comp: SwissComponent): ComponentInternals {
  return comp as unknown as ComponentInternals;
}
