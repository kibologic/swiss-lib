/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { HookRegistry } from './hookRegistry.js';

declare module './hookRegistry.js' {
  interface HookRegistry {
    registerHook(hookName: string, options?: { priority?: number; plugin?: string }, handler?: (...args: unknown[]) => unknown): void;
  }
}

HookRegistry.prototype.registerHook = function(
  hookName: string,
  options: { priority?: number; plugin?: string } = {},
  handler?: (...args: unknown[]) => unknown
): void {
  if (handler) {
    this.addHook(hookName, handler, options.plugin || 'anonymous', 
      options.priority && options.priority > 2 ? 'critical' : 
      options.priority && options.priority > 1 ? 'high' : 
      options.priority && options.priority > 0 ? 'normal' : 'low');
  }
};

