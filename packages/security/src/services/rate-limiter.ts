import type { SecurityContext } from '../types.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (ctx: SecurityContext) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export class RateLimiter {
  private counters = new Map<string, { count: number; resetTime: number }>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  checkLimit(ctx: SecurityContext): RateLimitResult {
    const key = this.config.keyGenerator 
      ? this.config.keyGenerator(ctx)
      : this.getDefaultKey(ctx);
    
    const now = Date.now();
    const entry = this.counters.get(key);
    
    if (!entry || now > entry.resetTime) {
      const newEntry = {
        count: 1,
        resetTime: now + this.config.windowMs,
      };
      this.counters.set(key, newEntry);
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: newEntry.resetTime,
      };
    }
    
    if (entry.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }
    
    entry.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  private getDefaultKey(ctx: SecurityContext): string {
    return ctx.ip || ctx.userId || 'anonymous';
  }

  reset(key?: string): void {
    if (key) {
      this.counters.delete(key);
    } else {
      this.counters.clear();
    }
  }

  getStats(): Record<string, { count: number; resetTime: number }> {
    const stats: Record<string, { count: number; resetTime: number }> = {};
    for (const [key, value] of this.counters.entries()) {
      stats[key] = { ...value };
    }
    return stats;
  }
}
