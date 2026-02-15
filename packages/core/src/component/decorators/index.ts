/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Component decorators
export { Component, getComponentMetadata } from './component-decorator.js';
export type { ComponentOptions } from './component-decorator.js';

// Capability decorators
export { RequireCapability, getCapabilityMetadata } from './capability-decorator.js';
export type { CapabilityOptions } from './capability-decorator.js';

// Lifecycle decorators
export { OnMount, OnUnmount, OnUpdate, getLifecycleMetadata } from './lifecycle-decorator.js';
export type { LifecycleOptions } from './lifecycle-decorator.js';

// Performance decorators
export { Throttle, Debounce, Memoize, getPerformanceMetadata } from './performance-decorator.js';
export type { ThrottleOptions, DebounceOptions } from './performance-decorator.js';
