/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export interface FileRouterOptions {
  /** Routes directory relative to project root */
  routesDir?: string;
  
  /** File extensions to scan for routes */
  extensions?: string[];
  
  /** Enable nested layouts */
  layouts?: boolean;
  
  /** Enable lazy loading */
  lazyLoading?: boolean;
  
  /** Enable route preloading */
  preloading?: boolean;
  
  /** Custom route transformation */
  transform?: (path: string) => string;
  
  /** Development server options */
  dev?: {
    hotReload?: boolean;
    port?: number;
  };
}

