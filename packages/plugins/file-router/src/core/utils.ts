/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { RouteDefinition, ComponentConstructor } from '@kibologic/core';

/**
 * Create a route definition from file path and component
 */
export function createRouteDefinition(
  path: string,
  component: () => Promise<{ default: ComponentConstructor }>,
  options: {
    layout?: () => Promise<{ default: ComponentConstructor }>;
    meta?: Record<string, unknown>;
  } = {}
): RouteDefinition {
  return {
    path,
    component,
    layout: options.layout,
    meta: options.meta
  };
}

