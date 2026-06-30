/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Plugin } from './pluginInterface.js';
import { PluginManager } from './pluginManager.js';

declare module './pluginManager.js' {
  interface PluginManager {
    unregister(name: string): void;
    get<T = unknown>(name: string): T | undefined;
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    list(): string[];
  }
}

/** Internal shape of PluginManager exposed only to prototype extensions in this file. */
type PluginManagerInternals = {
  plugins: Map<string, Plugin>;
  unregisterPlugin(name: string): void;
};

function pm(mgr: PluginManager): PluginManagerInternals {
  return mgr as unknown as PluginManagerInternals;
}

PluginManager.prototype.unregister = function(this: PluginManager, name: string): void {
  pm(this).unregisterPlugin(name);
};

PluginManager.prototype.get = function<T = unknown>(this: PluginManager, name: string): T | undefined {
  const plugin = pm(this).plugins.get(name);
  return plugin as T;
};

PluginManager.prototype.initialize = async function(this: PluginManager): Promise<void> {
  for (const plugin of pm(this).plugins.values()) {
    if (plugin.init) {
      await (plugin.init as () => Promise<void> | void)();
    }
  }
};

PluginManager.prototype.destroy = async function(this: PluginManager): Promise<void> {
  const pluginNames = Array.from(pm(this).plugins.keys());
  for (const name of pluginNames) {
    pm(this).unregisterPlugin(name);
  }
};

PluginManager.prototype.list = function(this: PluginManager): string[] {
  return Array.from(pm(this).plugins.keys());
};
