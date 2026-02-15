/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { SwissComponent } from "../component.js";

const SWISS_COMPONENT = Symbol("swiss:component");

export interface ComponentOptions {
  selector?: string;
  template?: string;
  styles?: string | string[];
  standalone?: boolean;
  shadowDom?: boolean;
}

export function Component(options: ComponentOptions = {}) {
  return function <T extends { new (...args: any[]): SwissComponent }>(
    constructor: T
  ): T {
    // Store component metadata
    Reflect.defineMetadata(SWISS_COMPONENT, options, constructor);
    
    // Add selector property if provided
    if (options.selector) {
      (constructor as any).selector = options.selector;
    }
    
    // Add template property if provided
    if (options.template) {
      (constructor as any).template = options.template;
    }
    
    // Add styles property if provided
    if (options.styles) {
      (constructor as any).styles = Array.isArray(options.styles) 
        ? options.styles 
        : [options.styles];
    }
    
    return constructor;
  };
}

export function getComponentMetadata(constructor: any): ComponentOptions | undefined {
  return Reflect.getMetadata(SWISS_COMPONENT, constructor);
}
