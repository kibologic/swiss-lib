/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { ComponentRegistry } from './ComponentRegistry.js';
import { HookRegistry } from '../hooks/hookRegistry.js';

declare module './ComponentRegistry.js' {
  interface ComponentRegistry {
    register(name: string, component: any): void;
    get(name: string): any;
  }
  
  namespace ComponentRegistry {
    function register(name: string, component: any): void;
    function get(name: string): any;
  }
}

let instance: ComponentRegistry;

(ComponentRegistry as any).register = function(name: string, component: any): void {
  if (!instance) {
    instance = new ComponentRegistry(new HookRegistry());
  }
  instance.register(name, component);
};

(ComponentRegistry as any).get = function(name: string): any {
  if (!instance) {
    instance = new ComponentRegistry(new HookRegistry());
  }
  return instance.get(name);
};
