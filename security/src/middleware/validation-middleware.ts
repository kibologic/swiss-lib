import { ValidatorService, type JSONSchema, type ValidationResult } from '../index.js';
import type { SecurityPolicy } from '../index.js';
import type { MiddlewareRequest, MiddlewareResponse, NextFunction } from './types.js';

export interface ValidationMiddlewareOptions {
  schema: JSONSchema;
  target?: 'body' | 'query' | 'params' | 'headers';
  onValidationError?: (result: ValidationResult) => void;
  strict?: boolean;
}

export function createValidationMiddleware(options: ValidationMiddlewareOptions) {
  const validator = new ValidatorService();
  const compiledSchema = validator.compileSchema(options.schema);

  return async (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      const target = options.target ?? 'body';
      const data = req[target as keyof MiddlewareRequest];

      const result = compiledSchema.validate(data);

      if (!result.ok) {
        if (options.onValidationError) {
          options.onValidationError(result);
        }

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request validation failed',
          details: result.reasons,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * A route-policy entry: binds an HTTP path (and optional method) to a SecurityPolicy
 * that carries inputValidation configuration for body validation.
 */
export interface RoutePolicy {
  /** Express-style path prefix or exact path, e.g. '/api/users' */
  path: string;
  /** HTTP method to match (case-insensitive). Omit to match any method. */
  method?: string;
  policy: SecurityPolicy;
}

export interface PolicyValidationMiddlewareOptions {
  /**
   * Ordered list of route-policy bindings.
   * The first entry whose path and method match the incoming request is used.
   * If empty or no entry matches, body validation is skipped.
   */
  policies: RoutePolicy[];
  onValidationError?: (result: ValidationResult, policy: SecurityPolicy) => void;
}

/**
 * Finds the first RoutePolicy whose path and method match the request.
 *
 * Matching rules:
 *  - Path: request path must start with routePolicy.path (prefix match).
 *    Use '/' to match all paths.
 *  - Method: if routePolicy.method is specified, request method must match
 *    case-insensitively. If omitted, all methods are accepted.
 *
 * Returns undefined only when no policy matches — body validation is then skipped.
 * If policies array is empty this function returns undefined immediately; the caller
 * should treat an empty policies array as a misconfiguration and log a warning.
 */
function findPolicyForRequest(
  policies: RoutePolicy[],
  reqPath: string,
  reqMethod: string,
): RoutePolicy | undefined {
  for (const entry of policies) {
    const pathMatches = reqPath === entry.path || reqPath.startsWith(entry.path.endsWith('/') ? entry.path : entry.path + '/') || reqPath === entry.path;
    if (!pathMatches) continue;

    if (entry.method !== undefined) {
      const methodMatches = entry.method.toUpperCase() === reqMethod.toUpperCase();
      if (!methodMatches) continue;
    }

    return entry;
  }
  return undefined;
}

/**
 * Creates a policy-driven body validation middleware.
 *
 * Each incoming request is matched against the configured RoutePolicy list via
 * findPolicyForRequest (path prefix + optional method). The first matching policy's
 * SecurityPolicy.inputValidation schema is used to validate req.body.
 *
 * If no policy matches, body validation is skipped (pass-through).
 * If policies is empty a warning is logged at middleware creation time — an empty
 * list means every request bypasses body validation silently.
 */
export function createPolicyValidationMiddleware(options: PolicyValidationMiddlewareOptions) {
  const { policies, onValidationError } = options;
  const validator = new ValidatorService();

  // Warn at wiring time if the policies list is empty — body validation will be
  // entirely inert and callers should know this is not a silent no-op by design.
  if (policies.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[security] createPolicyValidationMiddleware: policies array is empty — ' +
      'body validation will be skipped for all requests. ' +
      'Add RoutePolicy entries to enable per-route validation.',
    );
  }

  return async (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      const reqPath: string = req.path ?? req.url ?? '/';
      const reqMethod: string = req.method ?? 'GET';

      const matched = findPolicyForRequest(policies, reqPath, reqMethod);

      if (!matched) {
        return next();
      }

      const { policy } = matched;

      if (!policy.inputValidation) {
        return next();
      }

      const { schema, maxSize, allowedContentTypes } = policy.inputValidation;

      if (allowedContentTypes && allowedContentTypes.length > 0) {
        const rawContentType = req.get?.('Content-Type') ?? req.headers?.['content-type'] ?? '';
        const contentType = Array.isArray(rawContentType) ? rawContentType[0] ?? '' : rawContentType;
        if (!allowedContentTypes.some((t) => contentType.includes(t))) {
          return res.status(415).json({
            error: 'Unsupported Media Type',
            message: `Content-Type '${contentType}' is not allowed for this endpoint`,
          });
        }
      }

      if (maxSize !== undefined && req.body !== undefined) {
        const bodySize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
        if (bodySize > maxSize) {
          return res.status(413).json({
            error: 'Payload Too Large',
            message: `Request body exceeds maximum size of ${maxSize} bytes`,
          });
        }
      }

      if (schema && req.body !== undefined) {
        const compiled = validator.compileSchema(schema);
        const result = compiled.validate(req.body);

        if (!result.ok) {
          if (onValidationError) {
            onValidationError(result, policy);
          }

          return res.status(400).json({
            error: 'Validation Error',
            message: 'Request body validation failed',
            details: result.reasons,
          });
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
