/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode } from "../vdom/vdom.js";
import type { VElement } from "../vdom/vdom.js";
import { ErrorReporter } from "../error/error-reporter.js";

export class DiffingError extends Error {
  constructor(
    message: string,
    public vnode?: VNode,
  ) {
    super(message);
    this.name = "DiffingError";
    // Fixed: Added type-safe captureStackTrace check
    if (
      typeof (Error as { captureStackTrace?: (a: unknown, b: unknown) => void })
        .captureStackTrace === "function"
    ) {
      (
        Error as { captureStackTrace: (a: unknown, b: unknown) => void }
      ).captureStackTrace(this, DiffingError);
    }
    
    // Report diffing errors to error reporter
    ErrorReporter.report(this, {
      context: 'DiffingError',
      vnode: vnode ? String(vnode) : undefined,
    });
  }
}

// Helper functions
// Error boundary implementation
export function createErrorBoundary(message: string, error?: Error): VElement {
  // Report error if provided
  if (error) {
    ErrorReporter.report(error, {
      context: 'createErrorBoundary',
      message,
    });
  }
  
  return {
    type: "div",
    props: { 
      className: "error-boundary",
      style: {
        padding: '1rem',
        border: '1px solid #f00',
        backgroundColor: '#fee',
        color: '#c00',
      },
    },
    children: [
      {
        type: "h3",
        props: {},
        children: ["Error"],
      },
      {
        type: "p",
        props: {},
        children: [message],
      },
      error && error.stack
        ? {
            type: "details",
            props: {},
            children: [
              {
                type: "summary",
                props: {},
                children: ["Error Details"],
              },
              {
                type: "pre",
                props: {
                  style: {
                    fontSize: '0.875rem',
                    overflow: 'auto',
                    maxHeight: '200px',
                  },
                },
                children: [error.stack || error.message],
              },
            ],
          }
        : null,
      {
        type: "button",
        props: {
          onClick: () => window.location.reload(),
          className: "retry-button",
        },
        children: ["Retry"],
      },
    ].filter(Boolean) as VNode[],
  };
}

