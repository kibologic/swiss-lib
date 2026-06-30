import { RateLimiter, type RateLimitConfig, type RateLimitResult, type SecurityContext } from '../index.js';
import type { MiddlewareRequest, MiddlewareResponse, NextFunction } from './types.js';

export interface RateLimitMiddlewareOptions {
  config: RateLimitConfig;
  onLimitExceeded?: (ctx: SecurityContext, result: RateLimitResult) => void;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const limiter = new RateLimiter(options.config);

  return async (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      const ctx: SecurityContext = {
        layer: 'middleware',
        ip: req.ip ?? req.connection?.remoteAddress,
        userAgent: req.get?.('User-Agent'),
        requestId: req.id,
        target: req.path,
      };

      const result = limiter.checkLimit(ctx);

      if (!result.allowed) {
        res.set({
          'X-RateLimit-Limit': options.config.maxRequests,
          'X-RateLimit-Remaining': result.remaining,
          'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
        });

        if (options.onLimitExceeded) {
          options.onLimitExceeded(ctx, result);
        }

        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
      }

      res.set({
        'X-RateLimit-Limit': options.config.maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
