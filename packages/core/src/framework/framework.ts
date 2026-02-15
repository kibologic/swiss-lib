/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { HookRegistry } from "../hooks/hookRegistry.js";
import { PluginManager } from "../plugins/index.js";
import type { Plugin } from "../plugins/pluginInterface.js";
import type { SwissComponent } from "../component/component.js";
import { ComponentRegistry } from "../component/ComponentRegistry.js";
import {
  coreDirectiveHandlers,
  isCoreDirective,
} from "../directives/coreDirectives.js";
import type { DirectiveBinding } from "../directives/types/index.js";
import { SWISS_VERSION } from "./version.js";

/**
 * SwissFramework - Core framework singleton
 * Manages global state, plugins, hooks, and component lifecycle
 */
export class SwissFramework {
  private static instance: SwissFramework;
  
  public readonly hooks: HookRegistry;
  public readonly plugins: PluginManager;
  public readonly apps = new Set<any>(); // SwissApp instances
  
  private constructor() {
    this.hooks = new HookRegistry();
    this.plugins = new PluginManager();
    
    this.setupCoreHooks();
    this.setupCorePlugins();
  }

  static getInstance(): SwissFramework {
    if (!SwissFramework.instance) {
      SwissFramework.instance = new SwissFramework();
    }
    return SwissFramework.instance;
  }

  private setupCoreHooks() {
    // Core lifecycle hooks
    this.hooks.registerHook("component:init", { priority: 100 });
    this.hooks.registerHook("component:mount", { priority: 100 });
    this.hooks.registerHook("component:unmount", { priority: 100 });
    this.hooks.registerHook("component:update", { priority: 100 });
    this.hooks.registerHook("component:destroy", { priority: 100 });
    
    // Framework hooks
    this.hooks.registerHook("framework:init", { priority: 200 });
    this.hooks.registerHook("framework:ready", { priority: 100 });
    this.hooks.registerHook("framework:error", { priority: 300 });
    
    // Directive hooks
    this.hooks.registerHook("directive:register", { priority: 100 });
    this.hooks.registerHook("directive:apply", { priority: 100 });
  }

  private setupCorePlugins() {
    // Register core plugins
    this.plugins.register([{
      name: "core-directives",
      version: SWISS_VERSION,
      init: async () => {
        // Register core directives
        for (const [name, handler] of Object.entries(coreDirectiveHandlers)) {
          this.hooks.callHook("directive:register", { name, handler });
        }
      },
    }]);
  }

  async initialize(): Promise<void> {
    await this.hooks.callHook("framework:init", this);
    await this.plugins.initialize();
    await this.hooks.callHook("framework:ready", this);
  }

  async destroy(): Promise<void> {
    await this.hooks.callHook("framework:error", { message: "Framework shutting down" });
    await this.plugins.destroy();
    this.apps.clear();
  }

  registerApp(app: any): void {
    this.apps.add(app);
  }

  unregisterApp(app: any): void {
    this.apps.delete(app);
  }

  registerDirective(name: string, handler: DirectiveBinding): void {
    if (isCoreDirective(name)) {
      throw new Error(`Cannot override core directive: ${name}`);
    }
    this.hooks.callHook("directive:register", { name, handler });
  }

  async applyDirective(element: Element, directive: string, value: any): Promise<void> {
    await this.hooks.callHook("directive:apply", { element, directive, value });
  }

  async handleError(error: Error, context?: any): Promise<void> {
    await this.hooks.callHook("framework:error", { error, context });
  }

  getStats() {
    return {
      version: SWISS_VERSION,
      apps: this.apps.size,
      plugins: this.plugins.list().length,
      hooks: this.hooks.getStats(),
    };
  }
}
