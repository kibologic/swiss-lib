/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { SwissComponent } from "../component.js";
import { CapabilityManager } from "../../security/capability-manager.js";

const SWISS_CAPABILITIES = Symbol("swiss:capabilities");

export interface CapabilityOptions {
  strict?: boolean;
  fallback?: string;
  scope?: "children" | "siblings" | "global";
  conditional?: (context: unknown) => boolean;
  audit?: boolean;
}

export function RequireCapability(capability: string, options: CapabilityOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const hasCapability = CapabilityManager.has(capability, this as SwissComponent);
      
      if (!hasCapability) {
        if (options.strict) {
          throw new Error(`Required capability '${capability}' not found`);
        }
        
        if (options.fallback) {
          const fallbackMethod = (this as any)[options.fallback];
          if (typeof fallbackMethod === 'function') {
            return fallbackMethod.apply(this, args);
          }
        }
        
        return null;
      }
      
      // Check conditional if provided
      if (options.conditional && !options.conditional(this)) {
        return null;
      }
      
      // Audit if enabled
      if (options.audit) {
        console.log(`[AUDIT] Capability '${capability}' used on ${propertyKey}`);
      }
      
      return originalMethod.apply(this, args);
    };
    
    // Store capability metadata
    const existingCapabilities = Reflect.getMetadata(SWISS_CAPABILITIES, target) || [];
    existingCapabilities.push({ capability, propertyKey, options });
    Reflect.defineMetadata(SWISS_CAPABILITIES, existingCapabilities, target);
    
    return descriptor;
  };
}

export function getCapabilityMetadata(target: any): any[] {
  return Reflect.getMetadata(SWISS_CAPABILITIES, target) || [];
}
