/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Error Reporter
 * 
 * Centralized error reporting system for SwissJS framework.
 * Similar to how React/Vue teams use Sentry, LogRocket, or Bugsnag.
 * 
 * This reporter:
 * 1. Captures errors with stack traces
 * 2. Logs errors to console (development)
 * 3. Can send errors to external services (production)
 * 4. Provides error aggregation and analysis
 */

export interface ErrorContext {
  componentStack?: string;
  errorBoundary?: string;
  context?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ErrorReport {
  error: Error;
  context: ErrorContext;
  timestamp: number;
  userAgent?: string;
  url?: string;
  sessionId?: string;
}

class ErrorReporterImpl {
  private errorQueue: ErrorReport[] = [];
  private maxQueueSize = 100;
  private enabled = true;
  private sessionId: string;

  constructor() {
    // Generate session ID for error tracking
    this.sessionId = this.generateSessionId();
    
    // Listen for unhandled errors
    if (typeof window !== 'undefined') {
      // Expose ErrorReporter to window for debugging (development only)
      const isDev = typeof process !== 'undefined' 
        ? (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)
        : true; // Default to dev mode in browser
      if (isDev) {
        (window as any).__swissErrorReporter = this;
      }
      
      window.addEventListener('error', (event) => {
        this.report(event.error || new Error(event.message), {
          context: 'unhandledError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
        this.report(error, {
          context: 'unhandledRejection',
        });
      });
    }
  }

  /**
   * Reports an error with context
   */
  report(error: Error, context: ErrorContext = {}): void {
    if (!this.enabled) return;

    const report: ErrorReport = {
      error,
      context: {
        ...context,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        sessionId: this.sessionId,
      },
      timestamp: Date.now(),
    };

    // Add to queue
    this.errorQueue.push(report);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest
    }

    // Log to console in development
    const isDev = typeof process !== 'undefined' 
      ? (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)
      : true; // Default to dev mode in browser
    if (isDev) {
      console.error('[ErrorReporter]', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context,
      });
    }

    // In production, you would send to external service:
    // this.sendToExternalService(report);
  }

  /**
   * Sends error report to external service (Sentry, LogRocket, etc.)
   * This is a placeholder - implement based on your telemetry service
   */
  private async sendToExternalService(report: ErrorReport): Promise<void> {
    // Example: Send to external service
    // await fetch('/api/errors', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(report),
    // });
  }

  /**
   * Gets all errors in the current session
   */
  getErrors(): ErrorReport[] {
    return [...this.errorQueue];
  }

  /**
   * Clears the error queue
   */
  clear(): void {
    this.errorQueue = [];
  }

  /**
   * Enables or disables error reporting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Gets the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// Singleton instance
export const ErrorReporter = new ErrorReporterImpl();
