/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export class PathTransformer {
  /**
   * Transform file path to route pattern
   * 
   * Examples:
   * - /routes/index.ui -> /
   * - /routes/about.ui -> /about
   * - /routes/user/[id].ui -> /user/:id
   * - /routes/blog/[slug]/edit.ui -> /blog/:slug/edit
   */
  filePathToRoute(filePath: string, routePrefix: string = '', baseDir: string = ''): string {
    // Extract relative path from base directory (pages/ or routes/)
    let relativePath = filePath;
    if (baseDir) {
      const baseIndex = filePath.indexOf(baseDir);
      if (baseIndex !== -1) {
        relativePath = filePath.substring(baseIndex + baseDir.length);
      }
    } else {
      // Fallback: try to find /pages or /routes in path
      const pagesMatch = filePath.match(/[\/\\](?:pages|routes)([\/\\].*)$/);
      if (pagesMatch) {
        relativePath = pagesMatch[1];
      }
    }
    
    let route = relativePath
      // Remove route prefix if provided
      .replace(new RegExp('^' + routePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '')
      // Handle index files
      .replace(/[\/\\]index\.(ui|uix|js|ts)$/, '/')
      .replace(/^index\.(ui|uix|js|ts)$/, '/')
      // Remove file extensions
      .replace(/\.(ui|uix|js|ts)$/, '')
      // Convert [param] to :param (Next.js style)
      .replace(/\[([^\]]+)\]/g, ':$1')
      // Convert [[...param]] to :param* (catch-all routes)
      .replace(/\[\[\.\.\.([^\]]+)\]\]/g, ':$1*')
      // Normalize path separators
      .replace(/[\/\\]+/g, '/')
      // Clean up double slashes
      .replace(/\/+/g, '/')
      // Ensure starts with /
      .replace(/^(?!\/)/, '/');

    // Handle root route
    if (route === '' || route === '/index') {
      route = '/';
    }

    return route;
  }

  /**
   * Transform route pattern back to potential file paths
   * Useful for reverse lookups and debugging
   */
  routeToFilePaths(route: string, routesDir: string, extensions: string[]): string[] {
    const paths: string[] = [];
    
    const basePath = route === '/' ? 'index' : route.replace(/^\//, '');
    const pathWithParams = basePath.replace(/:([^/]+)/g, '[$1]');
    
    for (const ext of extensions) {
      paths.push(`${routesDir}/${pathWithParams}${ext}`);
      
      if (route === '/') {
        paths.push(`${routesDir}/index${ext}`);
      }
    }
    
    return paths;
  }

  /**
   * Extract parameter names from route pattern
   */
  extractParamNames(route: string): string[] {
    const matches = route.match(/:([^/]+)/g);
    return matches ? matches.map(match => match.slice(1)) : [];
  }

  /**
   * Check if route pattern matches path
   */
  matchRoute(pattern: string, path: string): { match: boolean; params: Record<string, string> } {
    const params: Record<string, string> = {};
    
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    const match = path.match(regex);
    
    if (!match) {
      return { match: false, params: {} };
    }
    
    // Extract parameters
    const paramNames = this.extractParamNames(pattern);
    paramNames.forEach((name, index) => {
      params[name] = match[index + 1] || '';
    });
    
    return { match: true, params };
  }
} 