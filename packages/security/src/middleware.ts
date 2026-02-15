/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { 
  SecurityGateway, 
  SecurityContext, 
  SecurityPolicy, 
  SecurityMiddlewareOptions, 
  JSONSchema
} from './types.js';
import { SecurityError } from './types.js';
import { ContentSecurity } from './serialization.js';

/**
 * Creates a security middleware for Express/Connect applications
 */
export function createSecurityMiddleware(
  securityEngine: SecurityGateway,
  options: SecurityMiddlewareOptions = {}
) {
  const {
    validateRequests = true,
    enableRateLimiting = true,
    addSecurityHeaders = true,
    requestSizeLimit: _requestSizeLimit = '1mb',
    validateHeaders = true,
    trustInternalHeaders = false,
    onError,
    securityHeaders = {}
  } = options;

  return async (req: any, res: any, next: any) => {
    try {
      // Create security context
      const ctx: SecurityContext = {
        layer: 'middleware',
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
        requestId: req.id || generateRequestId(),
        target: determineTarget(req)
      };

      // Validate headers if enabled
      if (validateHeaders && !trustInternalHeaders) {
        validateSecurityHeaders(req, ctx);
      }

      // Check rate limiting if enabled
      if (enableRateLimiting) {
        const rateLimitKey = `rate_limit:${ctx.ip}:${ctx.target}`;
        const allowed = await securityEngine.checkRateLimit(rateLimitKey);
        if (!allowed) {
          return handleRateLimit(res, onError);
        }
      }

      // Validate request body if enabled
      if (validateRequests && req.body) {
        await validateRequestBody(req, securityEngine, ctx);
      }

      // Add security headers if enabled
      if (addSecurityHeaders) {
        addSecurityHeadersToResponse(res, securityHeaders);
      }

      next();
    } catch (error) {
      if (onError) {
        onError(error as Error, req, res, next);
      } else {
        handleSecurityError(error as Error, res, next);
      }
    }
  };
}

/**
 * Creates a rate limiting middleware
 */
export function createRateLimitMiddleware(config: {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: any) => string;
}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100,
    message = 'Too many requests',
    keyGenerator = (req) => req.ip || 'unknown'
  } = config;

  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: any, res: any, next: any) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const record = requests.get(key);

    if (!record || now > record.resetTime) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    record.count++;
    next();
  };
}

/**
 * Creates an input validation middleware
 */
export function createValidationMiddleware(schema: JSONSchema, options: {
  target?: string;
  sanitize?: boolean;
}) {
  const { target: _target = 'default', sanitize = true } = options;

  return async (req: any, res: any, next: any) => {
    try {
      // Validate request body
      if (req.body) {
        const validation = validateAgainstSchema(req.body, schema);
        if (!validation.ok) {
          return res.status(400).json({
            error: 'Invalid request data',
            details: validation.reasons
          });
        }

        // Sanitize if enabled
        if (sanitize) {
          req.body = sanitizeRequestBody(req.body, schema);
        }
      }

      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        error: 'Validation failed',
        message: errorMessage
      });
    }
  };
}

/**
 * Creates a CORS security middleware
 */
export function createCorsMiddleware(options: {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
} = {}) {
  const {
    origins = ['*'],
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization'],
    credentials = false
  } = options;

  return (req: any, res: any, next: any) => {
    const origin = req.get('Origin');
    
    if (origins.includes('*') || (origin && origins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  };
}

/**
 * Validates security headers to prevent header injection attacks
 */
function validateSecurityHeaders(req: any, _ctx: SecurityContext) {
  const suspiciousHeaders = [
    'x-middleware-subrequest',
    'x-forwarded-host',
    'x-original-url',
    'x-rewrite-url'
  ];

  for (const header of suspiciousHeaders) {
    if (req.get(header) && !isTrustedSource(req)) {
      throw new SecurityError(`Suspicious header detected: ${header}`, 'SUSPICIOUS_HEADER');
    }
  }
}

/**
 * Validates request body against security policies
 */
async function validateRequestBody(req: any, securityEngine: SecurityGateway, _ctx: SecurityContext) {
  // Find matching policy for this request
  const policy = findPolicyForRequest(securityEngine, req);
  
  if (policy?.inputValidation) {
    const { schema, maxSize, allowedContentTypes, sanitization } = policy.inputValidation;

    // Check content type if specified
    if (allowedContentTypes) {
      const contentType = req.get('Content-Type');
      if (!allowedContentTypes.some(type => contentType?.includes(type))) {
        throw new SecurityError(`Content type not allowed: ${contentType}`, 'INVALID_CONTENT_TYPE');
      }
    }

    // Check size if specified
    if (maxSize) {
      const size = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      if (size > maxSize) {
        throw new SecurityError(`Request too large: ${size} bytes`, 'REQUEST_TOO_LARGE');
      }
    }

    // Validate against schema if provided
    if (schema) {
      const validation = securityEngine.validateInput(req.body, schema);
      if (!validation.ok) {
        throw new SecurityError(`Validation failed: ${validation.reasons?.join(', ')}`, 'VALIDATION_FAILED');
      }
    }

    // Apply sanitization if specified
    if (sanitization && sanitization !== 'none') {
      req.body = sanitizeRequestBody(req.body, schema);
    }
  }
}

/**
 * Adds security headers to the response
 */
function addSecurityHeadersToResponse(res: any, customHeaders: any = {}) {
  // Default security headers
  const defaultHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  };

  // Content Security Policy
  const defaultCSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
  
  // Apply headers
  const headers = { ...defaultHeaders, ...customHeaders };
  
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  // CSP needs special handling
  if (!headers['Content-Security-Policy'] && !customHeaders.contentSecurityPolicy) {
    res.setHeader('Content-Security-Policy', defaultCSP);
  }
}

/**
 * Handles rate limit exceeded
 */
function handleRateLimit(res: any, onError?: Function) {
  const error = new SecurityError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
  
  if (onError) {
    onError(error, null, res, null);
  } else {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: 60
    });
  }
}

/**
 * Handles security errors
 */
function handleSecurityError(error: Error, res: any, next: any) {
  if (error instanceof SecurityError) {
    const statusMap: Record<string, number> = {
      'VALIDATION_FAILED': 400,
      'INVALID_CONTENT_TYPE': 400,
      'REQUEST_TOO_LARGE': 413,
      'RATE_LIMIT_EXCEEDED': 429,
      'SUSPICIOUS_HEADER': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403
    };

    const status = statusMap[error.code || ''] || 500;
    
    return res.status(status).json({
      error: error.message,
      code: error.code
    });
  }

  next(error);
}

/**
 * Determines the security target for a request
 */
function determineTarget(req: any): string {
  const path = req.path || req.url || '/';
  const method = req.method?.toLowerCase() || 'get';
  
  // Convert path to target format
  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, ':');
  
  return cleanPath ? `${cleanPath}:${method}` : `root:${method}`;
}

/**
 * Finds a security policy for a request
 */
function findPolicyForRequest(_securityEngine: SecurityGateway, _req: any): SecurityPolicy | undefined {
  // This would need to be implemented based on how policies are stored
  // For now, return undefined to use default behavior
  return undefined;
}

/**
 * Validates input against JSON schema
 */
function validateAgainstSchema(input: any, schema: JSONSchema) {
  const reasons: string[] = [];
  
  if (schema.type && typeof input !== schema.type) {
    reasons.push(`Type mismatch: expected ${schema.type}, got ${typeof input}`);
  }
  
  if (schema.required && typeof input === 'object' && input !== null) {
    for (const required of schema.required) {
      if (!(required in input)) {
        reasons.push(`Missing required field: ${required}`);
      }
    }
  }
  
  if (schema.enum && !schema.enum.includes(input)) {
    reasons.push(`Invalid enum value: ${input}`);
  }
  
  return { ok: reasons.length === 0, reasons: reasons.length ? reasons : undefined };
}

/**
 * Sanitizes request body based on schema
 */
function sanitizeRequestBody(body: any, _schema?: JSONSchema): any {
  if (typeof body !== 'object' || body === null) {
    return body;
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      // Basic string sanitization
      sanitized[key] = ContentSecurity.escapeHtml(value.trim());
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Checks if the request comes from a trusted source
 */
function isTrustedSource(req: any): boolean {
  // Implement your trust logic here
  // For example, check if request is from internal network
  const ip = req.ip || req.connection?.remoteAddress;
  const trustedNetworks = ['127.0.0.1', '::1', 'localhost'];
  
  return trustedNetworks.includes(ip) || ip?.startsWith('192.168.') || ip?.startsWith('10.');
}

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
