/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { PathTransformer } from './transformer.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RouteDefinition } from '@swissjs/core';
import type { FileRouterOptions } from '../types/index.js';

export class RouteScanner {
  private transformer = new PathTransformer();
  private baseDir: string = '';

  constructor(private config: FileRouterOptions) {}

  async scanRoutes(directory: string): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    this.baseDir = directory;
    try {
      await this.scanDirectory(directory, routes, '');
    } catch (error) {
      console.error(`Failed to scan routes directory: ${directory}`, error);
      throw error;
    }
    return this.sortRoutesBySpecificity(routes);
  }

  private async scanDirectory(
    dirPath: string,
    routes: RouteDefinition[],
    routePrefix: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, routes, routePrefix);
          continue;
        }
        
        // Check if file has valid route extension
        const extensions = this.config.extensions ?? ['.ui', '.uix'];
        const isRouteFile = extensions.some((ext: string) =>
          entry.name.endsWith(ext)
        );
        
        if (!isRouteFile) continue;
        
        const route = await this.createRouteFromFile(fullPath, routePrefix);
        if (route) {
          routes.push(route);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read, skip silently
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    }
  }

  private async createRouteFromFile(
    filePath: string,
    routePrefix: string
  ): Promise<RouteDefinition | null> {
    try {
      const routePath = this.transformer.filePathToRoute(filePath, routePrefix, this.baseDir);
      
      // Convert file path to HTTP URL for browser import
      // This ensures the file is served through SWITE's middleware which rewrites imports
      const httpUrl = this.filePathToHttpUrl(filePath);
      
      // Store httpUrl in a variable that can be captured in the closure
      const componentUrl = httpUrl;
      
      return {
        path: routePath,
        component: () => {
          // Use the captured URL to ensure it's available when the function is called
          return import(componentUrl);
        },
        meta: {
          filePath,
          httpUrl: componentUrl,
          lastModified: Date.now() // Simplified for now
        }
      };
    } catch (error) {
      console.warn(`Failed to create route from file: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Convert absolute file path to HTTP URL that SWITE can serve
   */
  private filePathToHttpUrl(filePath: string): string {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check if it's a SWISS package
    const swissMatch = normalizedPath.match(/SWISS[/\\]packages[/\\](.+)$/);
    if (swissMatch) {
      return `/swiss-packages/${swissMatch[1]}`;
    }
    
    // Check if it's in lib/ or packages/ (workspace packages)
    const libMatch = normalizedPath.match(/(?:^|[/\\])(lib|packages)[/\\](.+)$/);
    if (libMatch) {
      return `/${libMatch[1]}/${libMatch[2]}`;
    }
    
    // Check if it's in src/pages (app pages)
    const pagesMatch = normalizedPath.match(/src[/\\]pages[/\\](.+)$/);
    if (pagesMatch) {
      return `/src/pages/${pagesMatch[1]}`;
    }
    
    // Fallback: try to extract relative path from baseDir
    if (this.baseDir) {
      const baseNormalized = this.baseDir.replace(/\\/g, '/');
      if (normalizedPath.startsWith(baseNormalized)) {
        const relative = normalizedPath.substring(baseNormalized.length).replace(/^\/+/, '');
        // Try to determine if it's lib/, packages/, or src/
        if (normalizedPath.includes('/lib/')) {
          return `/lib/${relative}`;
        } else if (normalizedPath.includes('/packages/')) {
          return `/packages/${relative}`;
        } else {
          return `/src/${relative}`;
        }
      }
    }
    
    // Last resort: use the file path as-is (might not work, but better than nothing)
    return normalizedPath;
  }

  private sortRoutesBySpecificity(routes: RouteDefinition[]): RouteDefinition[] {
    return routes.sort((a, b) => {
      const aIsDynamic = a.path.includes(':');
      const bIsDynamic = b.path.includes(':');
      if (aIsDynamic && !bIsDynamic) return 1;
      if (!aIsDynamic && bIsDynamic) return -1;
      const aSegments = a.path.split('/').length;
      const bSegments = b.path.split('/').length;
      return bSegments - aSegments;
    });
  }
} 