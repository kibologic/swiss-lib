/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type {
  AuditEntry,
  SecurityContext,
  SecurityGateway,
  SecurityPolicy,
  ValidationResult,
  JSONSchema,
} from "./types.js";
import { RateLimiter, type RateLimitConfig } from "./services/rate-limiter.js";
import { ValidatorService } from "./services/validator.js";

/**
 * In-memory security engine implementing the SecurityGateway surface.
 * - Maintains registered policies and defaults
 * - Provides evaluation and auditing
 */
export class InMemorySecurityEngine implements SecurityGateway {
  private policies = new Map<string, SecurityPolicy>();
  private auditLog: AuditEntry[] = [];
  private defaults: Partial<SecurityContext> = { layer: "runtime" };
  private rateLimiter: RateLimiter;
  private validator: ValidatorService;

  constructor(rateLimitConfig?: Partial<RateLimitConfig>) {
    this.rateLimiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 100,
      ...rateLimitConfig,
    });
    this.validator = new ValidatorService();
  }

  registerPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.id, policy);
  }

  removePolicy(id: string): void {
    this.policies.delete(id);
  }

  setContextDefaults(defaults: Partial<SecurityContext>): void {
    this.defaults = { ...this.defaults, ...defaults };
  }

  audit(entry: AuditEntry): void {
    this.auditLog.push(entry);
    if (this.auditLog.length > 2000)
      this.auditLog.splice(0, this.auditLog.length - 2000);
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  async evaluate(target: string, ctx: SecurityContext): Promise<boolean> {
    return this.evaluateInternal(target, ctx);
  }

  async evaluateWithPolicy(
    target: string,
    ctx: SecurityContext,
    policyId: string,
  ): Promise<boolean> {
    const policy = this.policies.get(policyId);
    const success = await this.evaluateInternal(target, ctx, policy);
    this.audit({
      timestamp: Date.now(),
      target,
      policyId,
      context: ctx,
      success,
      reason: success ? undefined : "evaluateWithPolicy:denied",
    });
    return success;
  }

  auditPlugin(plugin: {
    name: string;
    version?: string;
    requiredCapabilities?: string[];
  }): ValidationResult {
    const reasons: string[] = [];
    // Basic validations: name, optional capabilities format "ns:action"
    if (!plugin.name || typeof plugin.name !== "string") {
      reasons.push("invalid_plugin_name");
    }
    if (plugin.requiredCapabilities) {
      for (const cap of plugin.requiredCapabilities) {
        if (!/^[a-z][\w-]*:[a-z][\w-]*$/i.test(cap)) {
          reasons.push(`invalid_capability:${cap}`);
        }
      }
    }
    return {
      ok: reasons.length === 0,
      reasons: reasons.length ? reasons : undefined,
    };
  }

  async checkRateLimit(key: string): Promise<boolean> {
    const ctx: SecurityContext = { layer: "runtime", ip: key };
    const result = this.rateLimiter.checkLimit(ctx);
    return result.allowed;
  }

  validateInput(input: unknown, schema: JSONSchema): ValidationResult {
    return this.validator.validateValue(input, schema);
  }

  private async evaluateInternal(
    target: string,
    rawCtx: SecurityContext,
    policy?: SecurityPolicy,
  ): Promise<boolean> {
    const ctx: SecurityContext = {
      ...this.defaults,
      ...rawCtx,
    } as SecurityContext;

    // If a matching policy exists by target or passed policy, enforce it
    const p = policy ?? this.findPolicyForTarget(target);

    if (p) {
      // Roles
      if (p.roles && p.roles.length) {
        const roles = ctx.roles ?? [];
        if (!roles.some((r) => p.roles!.includes(r)))
          return this.deny(target, ctx, p, "role_denied");
      }
      // Permissions
      if (p.permissions && p.permissions.length) {
        const perms = ctx.permissions ?? [];
        if (!perms.some((pr) => p.permissions!.includes(pr)))
          return this.deny(target, ctx, p, "permission_denied");
      }
      // Rate limit per user
      if (p.rateLimitPerMinute && ctx.userId) {
        const key = `${p.id}:${ctx.userId}`;
        const allowed = await this.checkRateLimit(key);
        if (!allowed) {
          return this.deny(target, ctx, p, "rate_limited");
        }
      }
      // Custom predicate
      if (p.predicate && !p.predicate(ctx))
        return this.deny(target, ctx, p, "predicate_denied");
    }

    // Default allow when no policy denies
    this.audit({
      timestamp: Date.now(),
      target,
      context: ctx,
      success: true,
      policyId: p?.id,
    });
    return true;
  }

  private findPolicyForTarget(target: string): SecurityPolicy | undefined {
    // direct match first
    if (this.policies.has(target)) return this.policies.get(target);
    // namespace-only policy: "ns:*"
    const [ns] = target.split(":");
    const nsPolicy = this.policies.get(`${ns}:*`);
    if (nsPolicy) return nsPolicy;
    return undefined;
  }

  private deny(
    target: string,
    ctx: SecurityContext,
    policy: SecurityPolicy,
    reason: string,
  ): false {
    this.audit({
      timestamp: Date.now(),
      target,
      context: ctx,
      success: false,
      policyId: policy.id,
      reason,
    });
    return false;
  }
}

// Singleton factory for convenience in apps that want a default engine
let _defaultEngine: InMemorySecurityEngine | null = null;
export function getDefaultSecurityEngine(): InMemorySecurityEngine {
  if (!_defaultEngine) _defaultEngine = new InMemorySecurityEngine();
  return _defaultEngine;
}
