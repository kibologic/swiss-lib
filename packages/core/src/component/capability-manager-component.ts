/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from "./component.js";
import {
  FenestrationRegistry,
  type FenestrationContext,
} from "../fenestration/registry.js";

/**
 * Manages capability resolution for components via fenestration
 */
export class CapabilityManagerComponent {
  private _capabilityCache: Map<string, unknown> = new Map();
  private _userContext: { id: string; roles: string[] } | undefined = undefined;
  private _sessionContext: { id: string; permissions: string[] } | undefined = undefined;
  private _tenantContext: string | undefined = undefined;

  constructor(private component: SwissComponent) {}

  /**
   * Fenestrate - Core capability resolution method for SwissComponent
   * Provides secure, scoped access to capabilities across architectural layers
   */
  public fenestrate<T>(capabilityId: string, ...params: unknown[]): T | null {
    try {
      if (this._capabilityCache.has(capabilityId)) {
        return this._capabilityCache.get(capabilityId) as T;
      }

      const context: FenestrationContext = {
        component: this.component,
        user: this._userContext,
        session: this._sessionContext,
        tenant: this._tenantContext,
        layer: "component",
        requiredCapabilities: (this.component.constructor as any).requires,
      };

      const result = FenestrationRegistry.pierce<T>(
        capabilityId,
        context,
        ...params,
      );
      if (result.success) {
        this._capabilityCache.set(capabilityId, result.data);
        return result.data ?? null;
      }
      this.component.captureError(new Error(result.error), `fenestrate:${capabilityId}`);
      return null;
    } catch (error) {
      this.component.captureError(error as Error, `fenestrate:${capabilityId}`);
      return null;
    }
  }

  /**
   * Async version of fenestrate for capabilities that require async resolution
   */
  public async fenestrateAsync<T>(
    capabilityId: string,
    ...params: unknown[]
  ): Promise<T | null> {
    try {
      if (this._capabilityCache.has(capabilityId)) {
        return this._capabilityCache.get(capabilityId) as T;
      }

      const context: FenestrationContext = {
        component: this.component,
        user: this._userContext,
        session: this._sessionContext,
        tenant: this._tenantContext,
        layer: "component",
        requiredCapabilities: (this.component.constructor as any).requires,
      };

      const result = await FenestrationRegistry.pierceAsync<T>(
        capabilityId,
        context,
        ...params,
      );
      if (result.success) {
        this._capabilityCache.set(capabilityId, result.data);
        return result.data ?? null;
      }
      this.component.captureError(
        new Error(result.error),
        `fenestrateAsync:${capabilityId}`,
      );
      return null;
    } catch (error) {
      this.component.captureError(error as Error, `fenestrateAsync:${capabilityId}`);
      return null;
    }
  }

  /**
   * Set user context for capability resolution
   */
  public setUserContext(context: { id: string; roles: string[] } | undefined): void {
    this._userContext = context;
  }

  /**
   * Set session context for capability resolution
   */
  public setSessionContext(context: { id: string; permissions: string[] } | undefined): void {
    this._sessionContext = context;
  }

  /**
   * Set tenant context for capability resolution
   */
  public setTenantContext(context: string | undefined): void {
    this._tenantContext = context;
  }

  /**
   * Clear capability cache
   */
  public clearCache(): void {
    this._capabilityCache.clear();
  }

  /**
   * Validate capabilities (can be overridden by subclasses)
   */
  public async validateCapabilities(): Promise<void> {
    return Promise.resolve();
  }
}

