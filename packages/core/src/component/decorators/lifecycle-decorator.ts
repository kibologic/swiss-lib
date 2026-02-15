/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { SwissComponent } from "../component.js";

const SWISS_LIFECYCLE = Symbol("swiss:lifecycle");

export interface LifecycleOptions {
  async?: boolean;
  timeout?: number;
  retry?: number;
  throttle?: number;
  dependencies?: string[];
  cleanup?: string[];
}

export function OnMount(options: LifecycleOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    storeLifecycleHook(target, 'mount', propertyKey, options);
    return descriptor;
  };
}

export function OnUnmount(options: LifecycleOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    storeLifecycleHook(target, 'unmount', propertyKey, options);
    return descriptor;
  };
}

export function OnUpdate(options: LifecycleOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    storeLifecycleHook(target, 'update', propertyKey, options);
    return descriptor;
  };
}

function storeLifecycleHook(
  target: any,
  hookType: 'mount' | 'unmount' | 'update',
  propertyKey: string,
  options: LifecycleOptions
) {
  const existingHooks = Reflect.getMetadata(SWISS_LIFECYCLE, target) || {};
  if (!existingHooks[hookType]) {
    existingHooks[hookType] = [];
  }
  
  existingHooks[hookType].push({
    method: propertyKey,
    options,
  });
  
  Reflect.defineMetadata(SWISS_LIFECYCLE, existingHooks, target);
}

export function getLifecycleMetadata(target: any): any {
  return Reflect.getMetadata(SWISS_LIFECYCLE, target) || {};
}
