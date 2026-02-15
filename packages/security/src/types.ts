/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Core types for @swissjs/security

// High-level policy representation
export interface SecurityPolicy {
  id: string;
  description?: string;
  // Capability or resource targeted by the policy (e.g., "storage:write")
  target: string;
  // Allowed roles/permissions; empty means allow by default unless validator rejects
  roles?: string[];
  permissions?: string[];
  // Optional rate limit: requests per minute
  rateLimitPerMinute?: number;
  // Arbitrary predicate for custom checks
  predicate?: (ctx: SecurityContext) => boolean;
  // Input validation configuration
  inputValidation?: {
    schema: JSONSchema;
    maxSize?: number;
    allowedContentTypes?: string[];
    sanitization?: "none" | "basic" | "strict";
  };
}

// Execution/security context
export interface SecurityContext {
  // Logical layer invoking the action: component, service, plugin, runtime
  layer: "component" | "service" | "plugin" | "runtime" | "middleware";
  // Optional Swiss component or plugin names for richer auditing
  componentName?: string;
  pluginName?: string;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
  // Request metadata
  ip?: string;
  userAgent?: string;
  requestId?: string;
  target?: string;
  // Arbitrary bag for extensions
  meta?: Record<string, unknown>;
}

// Standard audit entry
export interface AuditEntry {
  timestamp: number;
  target: string;
  policyId?: string;
  context: SecurityContext;
  success: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

// Validator result shape
export interface ValidationResult {
  ok: boolean;
  reasons?: string[];
}

// Gateway surface used by core (type-only in core)
export interface SecurityGateway {
  audit(entry: AuditEntry): void;
  evaluate(target: string, ctx: SecurityContext): Promise<boolean>;
  evaluateWithPolicy(
    target: string,
    ctx: SecurityContext,
    policyId: string,
  ): Promise<boolean>;
  getAuditLog(): AuditEntry[];
  setContextDefaults(defaults: Partial<SecurityContext>): void;
  auditPlugin(plugin: {
    name: string;
    version?: string;
    requiredCapabilities?: string[];
  }): ValidationResult;
  checkRateLimit(key: string): Promise<boolean>;
  validateInput(input: unknown, schema: JSONSchema): ValidationResult;
}

// Security middleware options
export interface SecurityMiddlewareOptions {
  validateRequests?: boolean;
  enableRateLimiting?: boolean;
  addSecurityHeaders?: boolean;
  requestSizeLimit?: string;
  validateHeaders?: boolean;
  trustInternalHeaders?: boolean;
  onError?: (error: Error, req: unknown, res: unknown, next: unknown) => void;
  securityHeaders?: Record<string, string>;
}

// JSON Schema interface for validation
export interface JSONSchema {
  type?: string;
  required?: string[];
  enum?: (string | number | boolean)[];
  properties?: Record<string, JSONSchema | string | number | boolean>;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

// Security error class
export class SecurityError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

// Security event for audit logging
export interface SecurityEvent {
  action: string;
  target: string;
  context: SecurityContext;
  details?: {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
  };
}

// Audit filter options
export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  target?: string;
  success?: boolean;
  userId?: string;
  limit?: number;
  since?: number;
}

// Audit configuration
export interface AuditConfig {
  retentionDays?: number;
  maxEntries?: number;
  enableFileLogging?: boolean;
  logFilePath?: string;
  enabled?: boolean;
  persist?: boolean;
  excludeEvents?: string[];
  transformers?: Array<{
    event: string | RegExp;
    transform: (event: SecurityEvent) => SecurityEvent;
  }>;
}
