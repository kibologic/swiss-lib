/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { HookRegistry } from "../hooks/hookRegistry.js";
import { PluginManager } from "../plugins/index.js";
import type { Plugin } from "../plugins/pluginInterface.js";
import { SwissComponent } from "../component/component.js";
import { ComponentRegistry } from "../component/ComponentRegistry.js";
import { SwissFramework } from "./framework.js";
import { renderToDOM } from "../renderer/renderer.js";
import { createElement } from "../vdom/vdom.js";
import type { ComponentType, VNode } from "../vdom/types/index.js";

/**
 * SwissApp - Application-level framework instance
 * Provides app-specific plugin registration and routing capabilities
 */
export class SwissApp {
  private static instances = new Map<string, SwissApp>();

  public readonly name: string;
  public readonly framework: SwissFramework;
  public readonly plugins: PluginManager;
  public readonly hooks: HookRegistry;

  private constructor(name: string) {
    this.name = name;
    this.framework = SwissFramework.getInstance();
    this.plugins = new PluginManager();
    this.hooks = this.framework.hooks;

    // Register app-specific hooks
    this.setupAppHooks();
  }

  static getInstance(name: string = "default"): SwissApp {
    if (!SwissApp.instances.has(name)) {
      SwissApp.instances.set(name, new SwissApp(name));
    }
    return SwissApp.instances.get(name)!;
  }

  private setupAppHooks() {
    // App-specific hooks
    this.hooks.registerHook("app:init", { priority: 100 });
    this.hooks.registerHook("app:destroy", { priority: 100 });
    this.hooks.registerHook("app:route", { priority: 50 });
    this.hooks.registerHook("app:error", { priority: 200 });
  }

  async initialize(): Promise<void> {
    await this.hooks.callHook("app:init", this);
    this.framework.registerApp(this);
  }

  async destroy(): Promise<void> {
    await this.hooks.callHook("app:destroy", this);
    this.framework.unregisterApp(this);
    SwissApp.instances.delete(this.name);
  }

  registerPlugin(plugin: Plugin): void {
    this.plugins.register(plugin);
  }

  unregisterPlugin(name: string): void {
    this.plugins.unregister(name);
  }

  getPlugin<T = unknown>(name: string): T | undefined {
    return this.plugins.get<T>(name);
  }

  registerComponent(name: string, component: typeof SwissComponent): void {
    ComponentRegistry.register(name, component);
  }

  getComponent(name: string): typeof SwissComponent | undefined {
    return ComponentRegistry.get(name);
  }

  async route(path: string, component: typeof SwissComponent): Promise<void> {
    await this.hooks.callHook("app:route", { path, component, app: this });
  }

  async handleError(error: Error, context?: unknown): Promise<void> {
    await this.hooks.callHook("app:error", { error, context, app: this });
  }

  /**
   * Mounts a component (functional or class) to a DOM element
   * @param component - Functional component function or class component constructor
   * @param container - CSS selector string or HTMLElement to mount to
   * @param props - Optional props to pass to the component
   */
  static mount(
    component: ComponentType,
    container: string | HTMLElement,
    props?: Record<string, unknown>,
  ): void {
    // Resolve container element
    let containerElement: HTMLElement | null;
    if (typeof container === "string") {
      containerElement = document.querySelector(container);
      if (!containerElement) {
        throw new Error(`Container element "${container}" not found`);
      }
    } else {
      containerElement = container;
    }

    if (!containerElement) {
      throw new Error("Container element is required");
    }

    // Check if component is a class component (extends SwissComponent)
    const isClassComponent =
      typeof component === "function" &&
      component.prototype &&
      component.prototype instanceof SwissComponent;

    if (isClassComponent) {
      // Class component - use instance mount method
      const instance = new (component as typeof SwissComponent)(props || {});
      instance.mount(containerElement);
    } else {
      // Functional component - render directly
      const Component = component as (props: Record<string, unknown>) => VNode;
      const componentProps = props || {};

      // Create VNode from functional component
      const vnode = createElement(Component, componentProps);

      // Render once - the component's own reactivity system will handle updates
      renderToDOM(vnode, containerElement);
    }
  }
}
