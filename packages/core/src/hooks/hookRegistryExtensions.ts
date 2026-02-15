/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { HookRegistry } from './hookRegistry.js';

declare module './hookRegistry.js' {
  interface HookRegistry {
    registerHook(hookName: string, options?: { priority?: number; plugin?: string }, handler?: (...args: unknown[]) => unknown): void;
    getStats(): { totalHooks: number; hooks: Record<string, number> };
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

HookRegistry.prototype.getStats = function(): { totalHooks: number; hooks: Record<string, number> } {
  const hooks = (this as any).hooks;
  return {
    totalHooks: hooks.size,
    hooks: Object.fromEntries(
      Array.from(hooks.entries()).map((entry: unknown) => {
        const [name, list] = entry as [string, unknown];
        return [name, Array.isArray(list) ? list.length : 0];
      })
    ),
  };
};
