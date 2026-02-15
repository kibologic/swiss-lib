/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Plugin, PluginContext } from "../plugins/pluginInterface.js";
import type { SwissComponent } from "./component.js";
import { LifecycleManager } from "./lifecycle.js";

/**
 * Manages plugins for components
 */
export class PluginManagerComponent {
  private _pluginContext: PluginContext | null = null;
  public plugins: Plugin[] | null = null;

  constructor(
    private component: SwissComponent,
    private lifecycle: LifecycleManager,
  ) {}

  /**
   * Initialize plugins
   */
  public async loadPlugins(): Promise<void> {
    if (!this.plugins) return;
    for (const plugin of this.plugins) {
      if (plugin.init) {
        await plugin.init(this._pluginContext as PluginContext);
      }
    }
  }

  /**
   * Create plugin context
   */
  public createPluginContext(): PluginContext {
    const hooksAdapter = {
      addHook: (
        hookName: string,
        handler: (...args: unknown[]) => void,
        _pluginId: string,
        priority?: "low" | "normal" | "high" | "critical" | undefined,
      ) => {
        const priorityMap: Record<string, number> = {
          low: -1,
          normal: 0,
          high: 1,
        };
        this.lifecycle.on(hookName, handler as (...args: unknown[]) => void, {
          priority: priorityMap[priority || "normal"] ?? 0,
        });
      },
      removeHooks: () => {
        // Not supported for component-local hooks
      },
      callHook: async (hookName: string, context?: unknown) => {
        await this.component.executeHookPhase(hookName, context as Error);
      },
      hasHook: (hookName: string): boolean => {
        const hooks = this.lifecycle.getHooks();
        return !!hooks[hookName]?.length;
      },
      setGlobalContext: () => {
        // Not supported for component-local hooks
      },
      getHookSnapshot: () => {
        return Object.values(this.lifecycle.getHooks()).flat();
      },
    };

    this._pluginContext = {
      hooks:
        hooksAdapter as unknown as import("../plugins/types/hooks-contract.js").HookRegistrySurface,
      registerHook: (
        hook: import("../plugins/types/hooks-contract.js").HookRegistration,
      ) => {
        const h = hook;
        hooksAdapter.addHook(
          h.name,
          h.handler as unknown as (payload: unknown) => unknown,
          "component-local",
          h.priority as "low" | "normal" | "high" | "critical" | undefined,
        );
      },
      capabilities: new Set<string>(),
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };

    return this._pluginContext;
  }

  /**
   * Set plugins
   */
  public setPlugins(plugins: Plugin[]): void {
    this.plugins = plugins;
  }

  /**
   * Get plugin context
   */
  public getPluginContext(): PluginContext | null {
    return this._pluginContext;
  }
}

