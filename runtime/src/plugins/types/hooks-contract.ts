/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Stable plugin hooks and registry surface (types only)

export type HookName =
  | 'beforePluginRegister'
  | 'afterPluginRegister'
  | 'beforePluginUnregister'
  | 'afterPluginUnregister'
  | 'pluginActivate'
  | 'pluginDeactivate'
  | 'securityError'
  // Routing and component lifecycle hooks (used by plugins)
  | 'beforeRouteResolve'
  | 'afterRouteResolve'
  | 'beforeComponentMount'
  | 'afterComponentMount'
  | 'onCapabilityAudit'
  | 'runtimeReady'
  // Phase 4: extended hook surface
  | 'onRegisterServices'
  | 'onCompile'
  | 'devServerReady'
  | 'routesDiscovered';

export interface HookPayloads {
  beforePluginRegister: { plugin: { name: string } };
  afterPluginRegister: { plugin: { name: string } };
  beforePluginUnregister: { plugin: { name: string } };
  afterPluginUnregister: { plugin: { name: string } };
  pluginActivate: { plugin: { name: string } };
  pluginDeactivate: { plugin: { name: string } };
  securityError: { plugin?: { name: string }; reasons?: string[]; context?: Record<string, unknown> };
  // Route path string for compatibility with file-router plugin
  beforeRouteResolve: string;
  afterRouteResolve: { path: string; resolved: unknown };
  // Be permissive to avoid cross-package type coupling
  beforeComponentMount: unknown;
  afterComponentMount: unknown;
  onCapabilityAudit: import('./index.js').AuditResult;
  runtimeReady: { version?: string };
  // Phase 4: extended hook payloads
  /** Fired after all plugins have called their init/load; signals service registration window. */
  onRegisterServices: { pluginNames: string[] };
  /** Fired by compiler plugins when a file is being compiled. Result replaces code if returned. */
  onCompile: { code: string; id: string; result?: string };
  /** Fired when the dev server is ready to accept connections. */
  devServerReady: { port: number; host: string };
  /** Fired when the file router has finished discovering routes. */
  routesDiscovered: { routes: Array<{ path: string; file?: string }> };
}

export type HookHandler<K extends HookName = HookName> = (payload: HookPayloads[K]) => unknown;

export type HookRegistration = {
  [K in HookName]: {
    name: K;
    handler: HookHandler<K>;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  }
}[HookName];

export interface HookRegistrySurface {
  addHook<K extends HookName>(name: K, handler: HookHandler<K>, owner?: string, priority?: HookRegistration['priority']): void;
  removeHooks(owner: string): void;
  callHook<K extends HookName>(name: K, payload: HookPayloads[K]): void;
}
