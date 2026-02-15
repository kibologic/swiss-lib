/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { SecurityError } from './types.js';

/**
 * Safe serialization utilities to prevent prototype pollution and injection attacks
 */
export class SafeSerializer {
  private static readonly UNSAFE_PROPS = [
    '__proto__',
    'constructor',
    'prototype',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    'toString',
    'valueOf'
  ];

  /**
   * Safely converts a JavaScript value to a JSON string
   * @param value The value to convert to a JSON string
   * @param replacer Optional function that transforms the results
   * @param space Adds indentation, white space, and line break characters
   * @returns A JSON string representing the given value
   * @throws SecurityError if the object contains unsafe properties
   */
  static safeStringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string {
    try {
      return JSON.stringify(value, (key, val) => {
        // Prevent prototype pollution
        if (this.UNSAFE_PROPS.includes(key)) {
          throw new SecurityError('Unsafe property in object', 'PROTOTYPE_POLLUTION');
        }
        
        // Check for nested dangerous properties
        if (typeof val === 'object' && val !== null) {
          if (this.hasUnsafeProperties(val)) {
            throw new SecurityError('Object contains unsafe properties', 'PROTOTYPE_POLLUTION');
          }
        }
        
        return replacer ? replacer(key, val) : val;
      }, space);
    } catch (error) {
      if (error instanceof SecurityError) throw error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SecurityError(`Serialization failed: ${errorMessage}`, 'SERIALIZATION_ERROR');
    }
  }

  /**
   * Safely parses a JSON string
   * @param text The string to parse as JSON
   * @param reviver Optional function that transforms the results
   * @returns The object corresponding to the given JSON text
   * @throws SecurityError if the parsed object contains unsafe properties
   */
  static safeParse<T = any>(text: string, reviver?: (key: string, value: any) => any): T {
    try {
      const parsed = JSON.parse(text, reviver);
      
      // Validate parsed object for unsafe properties
      if (typeof parsed === 'object' && parsed !== null) {
        if (this.hasUnsafeProperties(parsed)) {
          throw new SecurityError('Parsed object contains unsafe properties', 'PROTOTYPE_POLLUTION');
        }
      }
      
      return parsed;
    } catch (error) {
      if (error instanceof SecurityError) throw error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SecurityError(`Parsing failed: ${errorMessage}`, 'PARSING_ERROR');
    }
  }

  /**
   * Creates a deep clone of an object while protecting against prototype pollution
   * @param obj The object to clone
   * @returns A deep-cloned object
   */
  static safeDeepClone<T>(obj: T): T {
    return this.safeParse(this.safeStringify(obj));
  }

  /**
   * Checks if an object contains unsafe properties
   * @param obj The object to check
   * @returns True if unsafe properties are found
   */
  private static hasUnsafeProperties(obj: any): boolean {
    for (const prop of this.UNSAFE_PROPS) {
      if (prop in obj) return true;
    }
    
    // Recursively check nested objects
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
        if (this.hasUnsafeProperties(obj[key])) return true;
      }
    }
    
    return false;
  }
}

/**
 * Content security utilities for preventing injection attacks
 */
export class ContentSecurity {
  /**
   * Sanitizes a string for safe inclusion in CSV output
   * @param input The string to sanitize
   * @returns A sanitized string safe for CSV output
   */
  static sanitizeForCsv(input: string): string {
    if (!input) return input;
    
    const trimmed = input.replace(/^\s*/, '');
    
    // Check for formula characters at the start
    if (/^[=+\-@]/.test(trimmed)) {
      // Escape by prepending single quote
      return `'${input.replace(/'/g, "''")}`;
    }
    
    return input;
  }

  /**
   * Escapes a string for safe inclusion in HTML
   * @param unsafe The string to escape
   * @returns An HTML-escaped string
   */
  static escapeHtml(unsafe: string): string {
    if (!unsafe) return unsafe;
    
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Escapes a string for safe inclusion in URLs
   * @param url The URL to escape
   * @returns A URL-encoded string
   */
  static escapeUrl(url: string): string {
    if (!url) return url;
    
    return encodeURIComponent(url);
  }

  /**
   * Sanitizes a string for safe inclusion in JSON output
   * @param input The string to sanitize
   * @returns A JSON-safe string
   */
  static sanitizeForJson(input: string): string {
    if (!input) return input;
    
    return input
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Escapes a string for safe inclusion in JavaScript
   * @param unsafe The string to escape
   * @returns A JavaScript-escaped string
   */
  static escapeJavaScript(unsafe: string): string {
    if (!unsafe) return unsafe;
    
    return unsafe
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\f/g, '\\f')
      .replace(/\v/g, '\\v')
      .replace(/\0/g, '\\0');
  }

  /**
   * Escapes a string for safe inclusion in CSS
   * @param unsafe The string to escape
   * @returns A CSS-escaped string
   */
  static escapeCss(unsafe: string): string {
    if (!unsafe) return unsafe;
    
    return unsafe.replace(/[^\w-]/g, (match) => {
      const hex = match.charCodeAt(0).toString(16);
      return `\\${hex}`;
    });
  }

  /**
   * Sanitizes input based on the specified context
   * @param input The input to sanitize
   * @param context The context for sanitization
   * @returns The sanitized input
   */
  static sanitize(input: string, context: 'html' | 'attribute' | 'css' | 'url' | 'javascript'): string {
    switch (context) {
      case 'html':
        return this.escapeHtml(input);
      case 'attribute':
        return this.escapeHtml(input).replace(/"/g, '&quot;');
      case 'css':
        return this.escapeCss(input);
      case 'url':
        return this.escapeUrl(input);
      case 'javascript':
        return this.escapeJavaScript(input);
      default:
        return input;
    }
  }

  /**
   * Validates and sanitizes email addresses
   * @param email The email to validate
   * @returns The sanitized email or null if invalid
   */
  static sanitizeEmail(email: string): string | null {
    if (!email) return null;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitized = email.toLowerCase().trim();
    
    return emailRegex.test(sanitized) ? sanitized : null;
  }

  /**
   * Validates and sanitizes phone numbers
   * @param phone The phone number to validate
   * @returns The sanitized phone number or null if invalid
   */
  static sanitizePhone(phone: string): string | null {
    if (!phone) return null;
    
    // Remove all non-digit characters except +, -, (, )
    const sanitized = phone.replace(/[^\d\+\-\(\)\s]/g, '').trim();
    
    // Basic validation - at least 10 digits
    const digits = sanitized.replace(/\D/g, '');
    return digits.length >= 10 ? sanitized : null;
  }

  /**
   * Removes potentially dangerous characters from filenames
   * @param filename The filename to sanitize
   * @returns The sanitized filename
   */
  static sanitizeFilename(filename: string): string {
    if (!filename) return filename;
    
    // Remove path traversal characters and other dangerous characters
    return filename
      .replace(/[\\/]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/[<>:"|?*]/g, '_')
      .trim();
  }
}
