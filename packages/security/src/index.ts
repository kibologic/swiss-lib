/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Public barrel: explicit re-exports only (no wildcards)
export { InMemorySecurityEngine, getDefaultSecurityEngine } from "./engine.js";
export type {
  AuditEntry,
  SecurityContext,
  SecurityGateway,
  SecurityPolicy,
  ValidationResult,
  JSONSchema,
  SecurityMiddlewareOptions,
  SecurityError,
  SecurityEvent,
  AuditFilter,
  AuditConfig,
} from "./types.js";
export { SecurityValidator } from "./validator.js";
export { RateLimiter, type RateLimitConfig, type RateLimitResult } from "./services/rate-limiter.js";
export { ValidatorService, type ValidationRule, type CompiledSchema } from "./services/validator.js";
export {
  createRateLimitMiddleware,
  createValidationMiddleware,
  createSecurityHeadersMiddleware,
  type RateLimitMiddlewareOptions,
  type ValidationMiddlewareOptions,
  type SecurityHeadersOptions,
} from "./middleware/index.js";
