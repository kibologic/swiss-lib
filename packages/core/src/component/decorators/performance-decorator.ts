/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

const SWISS_PERFORMANCE = Symbol("swiss:performance");

export interface ThrottleOptions {
  delay: number;
  leading?: boolean;
  trailing?: boolean;
}

export interface DebounceOptions {
  delay: number;
  immediate?: boolean;
}

export function Throttle(options: ThrottleOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    let lastCall = 0;
    let timeoutId: any;
    
    descriptor.value = function (...args: any[]) {
      const now = Date.now();
      
      if (options.leading && now - lastCall >= options.delay) {
        lastCall = now;
        return originalMethod.apply(this, args);
      }
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        if (options.trailing) {
          originalMethod.apply(this, args);
        }
      }, options.delay - (now - lastCall));
    };
    
    storePerformanceMetadata(target, propertyKey, 'throttle', options);
    return descriptor;
  };
}

export function Debounce(options: DebounceOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    let timeoutId: any;
    
    descriptor.value = function (...args: any[]) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (options.immediate) {
        const callNow = !timeoutId;
        timeoutId = setTimeout(() => {
          timeoutId = null;
        }, options.delay);
        
        if (callNow) {
          return originalMethod.apply(this, args);
        }
      } else {
        timeoutId = setTimeout(() => {
          originalMethod.apply(this, args);
        }, options.delay);
      }
    };
    
    storePerformanceMetadata(target, propertyKey, 'debounce', options);
    return descriptor;
  };
}

export function Memoize(ttl?: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cache = new Map();
    
    descriptor.value = function (...args: any[]) {
      const key = JSON.stringify(args);
      const cached = cache.get(key);
      
      if (cached && (!ttl || Date.now() - cached.timestamp < ttl)) {
        return cached.value;
      }
      
      const result = originalMethod.apply(this, args);
      cache.set(key, {
        value: result,
        timestamp: Date.now(),
      });
      
      return result;
    };
    
    storePerformanceMetadata(target, propertyKey, 'memoize', { ttl });
    return descriptor;
  };
}

function storePerformanceMetadata(
  target: any,
  propertyKey: string,
  type: string,
  options: any
) {
  const existing = Reflect.getMetadata(SWISS_PERFORMANCE, target) || {};
  existing[propertyKey] = { type, options };
  Reflect.defineMetadata(SWISS_PERFORMANCE, existing, target);
}

export function getPerformanceMetadata(target: any): any {
  return Reflect.getMetadata(SWISS_PERFORMANCE, target) || {};
}
