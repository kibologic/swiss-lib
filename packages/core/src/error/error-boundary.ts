/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode } from '../vdom/vdom.js';
import { createVNode } from '../vdom/vdom.js';
import { ErrorReporter } from './error-reporter.js';

/**
 * Error Boundary Component
 * 
 * Catches errors during component rendering and displays a fallback UI
 * instead of crashing the entire application. Similar to React's ErrorBoundary.
 * 
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary {
  private error: Error | null = null;
  private errorInfo: {
    componentStack?: string;
    errorBoundary?: string;
  } = {};

  constructor(
    private fallback: VNode | (() => VNode),
    private onError?: (error: Error, errorInfo: unknown) => void,
  ) {}

  /**
   * Catches errors thrown during rendering
   */
  catchError(error: Error, errorInfo?: unknown): void {
    this.error = error;
    this.errorInfo = errorInfo as typeof this.errorInfo;

    // Report error to telemetry
    ErrorReporter.report(error, {
      componentStack: this.errorInfo.componentStack,
      errorBoundary: this.errorInfo.errorBoundary,
      context: 'ErrorBoundary',
    });

    // Call custom error handler if provided
    if (this.onError) {
      this.onError(error, errorInfo);
    }
  }

  /**
   * Renders the fallback UI if an error occurred, otherwise renders children
   */
  render(children: VNode): VNode {
    if (this.error) {
      const fallbackVNode =
        typeof this.fallback === 'function' ? this.fallback() : this.fallback;
      return fallbackVNode;
    }
    return children;
  }

  /**
   * Resets the error state (useful for retry functionality)
   */
  reset(): void {
    this.error = null;
    this.errorInfo = {};
  }

  /**
   * Checks if an error is currently caught
   */
  hasError(): boolean {
    return this.error !== null;
  }

  /**
   * Gets the current error
   */
  getError(): Error | null {
    return this.error;
  }
}

/**
 * Creates a simple error boundary VNode
 * Used internally when component rendering fails
 */
export function createErrorBoundary(
  message: string,
  error?: Error,
): VNode {
  // Report error
  if (error) {
    ErrorReporter.report(error, {
      context: 'createErrorBoundary',
      message,
    });
  }

  // Create a simple error display
  return createVNode('div', {
    className: 'swiss-error-boundary',
    style: {
      padding: '1rem',
      border: '1px solid #f00',
      backgroundColor: '#fee',
      color: '#c00',
    },
  },
    createVNode('h3', {}, 'Error'),
    createVNode('p', {}, message),
    ...(error
      ? [createVNode('details', {},
          createVNode('summary', {}, 'Error Details'),
          createVNode('pre', {
            style: {
              fontSize: '0.875rem',
              overflow: 'auto',
              maxHeight: '200px',
            },
          }, error.stack || error.message),
        )]
      : []),
  );
}

/**
 * Wraps a render function with error boundary protection
 */
export function withErrorBoundary<T extends unknown[]>(
  renderFn: (...args: T) => VNode,
  fallback?: VNode | (() => VNode),
): (...args: T) => VNode {
  return ((...args: T): VNode => {
    try {
      return renderFn(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorBoundary = createErrorBoundary(
        'Component rendering failed',
        err,
      );
      if (fallback) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }
      return errorBoundary;
    }
  });
}
