/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { PluginManager } from './pluginManager.js';

declare module './pluginManager.js' {
  interface PluginManager {
    unregister(name: string): void;
    get<T = any>(name: string): T | undefined;
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    list(): string[];
  }
}

PluginManager.prototype.unregister = function(name: string): void {
  (this as any).unregisterPlugin(name);
};

PluginManager.prototype.get = function<T = any>(name: string): T | undefined {
  const plugin = (this as any).plugins.get(name);
  return plugin as T;
};

PluginManager.prototype.initialize = async function(): Promise<void> {
  // Initialize all registered plugins
  for (const plugin of (this as any).plugins.values()) {
    if (plugin.init) {
      await plugin.init();
    }
  }
};

PluginManager.prototype.destroy = async function(): Promise<void> {
  // Destroy all plugins
  const pluginNames = Array.from((this as any).plugins.keys());
  for (const name of pluginNames) {
    (this as any).unregisterPlugin(name);
  }
};

PluginManager.prototype.list = function(): string[] {
  return Array.from((this as any).plugins.keys());
};
