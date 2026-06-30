/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ComponentType } from '../vdom/types/index.js';

export class ComponentRegistry {
  private static readonly _registry = new Map<string, ComponentType>();

  static register(name: string, component: ComponentType): void {
    ComponentRegistry._registry.set(name, component);
  }

  static get(name: string): ComponentType | undefined {
    return ComponentRegistry._registry.get(name);
  }

  static has(name: string): boolean {
    return ComponentRegistry._registry.has(name);
  }

  static clear(): void {
    ComponentRegistry._registry.clear();
  }
}
