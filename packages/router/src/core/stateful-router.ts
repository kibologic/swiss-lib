/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { Router, type RouterOptions } from "./router.js";

/**
 * Route state that can be serialized and restored
 */
export interface RouteState {
  /**
   * URL path
   */
  path: string;

  /**
   * Query parameters
   */
  query: Record<string, string>;

  /**
   * Component-specific state
   */
  componentState?: Record<string, unknown>;

  /**
   * Scroll position
   */
  scroll?: {
    x: number;
    y: number;
  };

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Stateful router options
 */
export interface StatefulRouterOptions extends RouterOptions {
  /**
   * Called when route state changes
   */
  onStateChange?: (state: RouteState) => void;

  /**
   * Called when restoring route from URL
   */
  onStateRestore?: (state: RouteState) => void;

  /**
   * Persist scroll position
   */
  persistScroll?: boolean;
}

/**
 * Stateful router that preserves component state in URLs
 * Enables shareable links with full application state
 */
export class StatefulRouter extends Router {
  private options: StatefulRouterOptions;
  private currentState: RouteState | null = null;

  constructor(options: StatefulRouterOptions) {
    super(options);
    this.options = options;
  }

  /**
   * Parse URL into route state
   */
  parseURL(url: string = window.location.href): RouteState {
    const urlObj = new URL(url, window.location.origin);
    const path = urlObj.pathname;
    const query: Record<string, string> = {};

    // Parse query parameters
    urlObj.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Extract component state from special query param if present
    let componentState: Record<string, unknown> | undefined;
    if (query.__state) {
      try {
        componentState = JSON.parse(
          decodeURIComponent(query.__state),
        ) as Record<string, unknown>;
        delete query.__state; // Remove from query object
      } catch (error) {
        console.error(
          "[StatefulRouter] Failed to parse component state",
          error,
        );
      }
    }

    // Extract scroll position if present
    let scroll: { x: number; y: number } | undefined;
    if (query.__scrollX && query.__scrollY) {
      scroll = {
        x: parseInt(query.__scrollX, 10),
        y: parseInt(query.__scrollY, 10),
      };
      delete query.__scrollX;
      delete query.__scrollY;
    }

    return {
      path,
      query,
      componentState,
      scroll,
    };
  }

  /**
   * Build URL from route state
   */
  buildURL(state: RouteState): string {
    const url = new URL(state.path, window.location.origin);

    // Add regular query params
    Object.entries(state.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    // Add component state if present
    if (state.componentState && Object.keys(state.componentState).length > 0) {
      url.searchParams.set(
        "__state",
        encodeURIComponent(JSON.stringify(state.componentState)),
      );
    }

    // Add scroll position if present and enabled
    if (this.options.persistScroll && state.scroll) {
      url.searchParams.set("__scrollX", state.scroll.x.toString());
      url.searchParams.set("__scrollY", state.scroll.y.toString());
    }

    return url.pathname + url.search;
  }

  /**
   * Navigate with state
   */
  async pushWithState(
    state: Partial<RouteState> & { path: string },
  ): Promise<void> {
    const fullState: RouteState = {
      path: state.path,
      query: state.query || {},
      componentState: state.componentState,
      scroll: state.scroll,
      metadata: state.metadata,
    };

    const url = this.buildURL(fullState);
    await this.push(url);

    this.currentState = fullState;

    if (this.options.onStateChange) {
      this.options.onStateChange(fullState);
    }
  }

  /**
   * Replace with state
   */
  async replaceWithState(
    state: Partial<RouteState> & { path: string },
  ): Promise<void> {
    const fullState: RouteState = {
      path: state.path,
      query: state.query || {},
      componentState: state.componentState,
      scroll: state.scroll,
      metadata: state.metadata,
    };

    const url = this.buildURL(fullState);
    await this.replace(url);

    this.currentState = fullState;

    if (this.options.onStateChange) {
      this.options.onStateChange(fullState);
    }
  }

  /**
   * Update current route state without navigation
   * Useful for updating query params or component state
   */
  updateState(updates: Partial<Omit<RouteState, "path">>): void {
    if (!this.currentState) {
      this.currentState = this.parseURL();
    }

    this.currentState = {
      ...this.currentState,
      query: { ...this.currentState.query, ...updates.query },
      componentState: {
        ...this.currentState.componentState,
        ...updates.componentState,
      },
      scroll: updates.scroll || this.currentState.scroll,
      metadata: { ...this.currentState.metadata, ...updates.metadata },
    };

    const url = this.buildURL(this.currentState);
    history.replaceState(null, "", url);

    if (this.options.onStateChange) {
      this.options.onStateChange(this.currentState);
    }
  }

  /**
   * Get current route state
   */
  getCurrentState(): RouteState {
    if (!this.currentState) {
      this.currentState = this.parseURL();
    }
    return this.currentState;
  }

  /**
   * Restore state from URL (e.g., when page loads from shared link)
   */
  restoreFromURL(): RouteState {
    const state = this.parseURL();
    this.currentState = state;

    if (this.options.onStateRestore) {
      this.options.onStateRestore(state);
    }

    // Restore scroll position if present
    if (state.scroll && this.options.persistScroll) {
      window.scrollTo(state.scroll.x, state.scroll.y);
    }

    return state;
  }

  /**
   * Save current scroll position to state
   */
  saveScrollPosition(): void {
    if (!this.options.persistScroll) return;

    this.updateState({
      scroll: {
        x: window.scrollX,
        y: window.scrollY,
      },
    });
  }

  /**
   * Update component state in URL
   * This makes the current view shareable
   */
  updateComponentState(state: Record<string, unknown>): void {
    this.updateState({ componentState: state });
  }

  /**
   * Clear component state from URL
   */
  clearComponentState(): void {
    this.updateState({ componentState: {} });
  }
}
