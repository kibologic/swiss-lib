/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export * from './component.js';
export * from './lifecycle.js';
export * from './error-boundary.js';
export * from './context.js';
export * from './portals.js';
export * from './ssr.js';
export * from './types.js';
export * from './event-system.js';
export * from './ComponentRegistry.js';
export * from './base-component.js';

// Export decorators from organized structure
export { 
  Component,
  RequireCapability,
  OnMount,
  OnUnmount,
  OnUpdate,
  Throttle,
  Debounce,
  Memoize,
  getComponentMetadata,
  getCapabilityMetadata,
  getLifecycleMetadata,
  getPerformanceMetadata,
} from './decorators/index.js';

// Export types
export type {
  ComponentOptions,
  CapabilityOptions,
  LifecycleOptions,
  ThrottleOptions,
  DebounceOptions,
} from './decorators/index.js';

// Legacy exports for backward compatibility
import * as LegacyDecorators from './decorators/index.js';
export const Decorator = LegacyDecorators;
export const computedProperty = LegacyDecorators.Memoize;
