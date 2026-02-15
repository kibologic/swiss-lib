# SWISS Security Middleware

## Overview
The security middleware provides request validation, rate limiting, and security headers. It should be one of the first middlewares in your application.

## Installation

```bash
npm install @swissjs/security
```

## Usage

```typescript
import { getDefaultSecurityEngine } from '@swissjs/security';
import { createSecurityMiddleware } from '@swissjs/security/middleware';
import express from 'express';

const app = express();
const securityEngine = getDefaultSecurityEngine();

// Register security policies
securityEngine.registerPolicy({
  id: 'api:public',
  target: 'api:*',
  rateLimitPerMinute: 100
});

// Apply security middleware
app.use(createSecurityMiddleware(securityEngine));

// Your routes here
app.get('/api/data', (req, res) => {
  res.json({ message: 'Secure data' });
});
```

## Features

### 1. Request Validation
- Validates request bodies, query parameters, and route parameters
- Supports JSON Schema validation
- Automatic error responses for invalid requests

### 2. Rate Limiting
- Per-IP rate limiting
- Configurable rate limits per policy
- Automatic 429 responses when limits are exceeded

### 3. Security Headers
Sets secure default headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: default-src 'self'`

### 4. Input Sanitization
- Removes potentially dangerous characters
- Prevents XSS and injection attacks
- Configurable sanitization levels

## Configuration

```typescript
interface SecurityMiddlewareOptions {
  // Whether to enable request validation (default: true)
  validateRequests?: boolean;
  
  // Whether to enable rate limiting (default: true)
  enableRateLimiting?: boolean;
  
  // Whether to add security headers (default: true)
  addSecurityHeaders?: boolean;
  
  // Custom error handler
  onError?: (error: Error, req: Request, res: Response, next: NextFunction) => void;
  
  // Request size limit (default: '1mb')
  requestSizeLimit?: string | number;
}
```

## Error Handling

The middleware will automatically respond with appropriate HTTP status codes:

- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

You can provide a custom error handler via the `onError` option.

## Security Considerations

- Always place this middleware early in your middleware stack
- Configure appropriate rate limits for your application
- Regularly review and update your security policies
- Use HTTPS in production
- Keep dependencies up to date

## Advanced Usage

### Custom Validators

You can add custom validators for specific content types:

```typescript
import { Validator } from '@swissjs/security/validation';

class CustomValidator extends Validator {
  validate(data: any): boolean {
    // Your custom validation logic
    return true;
  }
}

// Register the validator
securityEngine.registerValidator('custom/type', new CustomValidator());
```

### Rate Limit Overrides

Override rate limits for specific routes:

```typescript
app.post('/api/rate-limited', 
  createRateLimitMiddleware({ windowMs: 60000, max: 5 }),
  (req, res) => {
    res.json({ message: 'This route has a custom rate limit' });
  }
);
```

### Security Headers Configuration

Customize security headers:

```typescript
app.use(createSecurityMiddleware(securityEngine, {
  securityHeaders: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'trusted-cdn.com'],
        // ... other directives
      }
    },
    // Other headers
    xssProtection: '1; mode=block',
    noSniff: true,
    frameOptions: 'DENY'
  }
}));
```

## Troubleshooting

### Common Issues

1. **Headers not being set**
   - Ensure the middleware is mounted before other middleware that might end the request-response cycle
   - Check for errors in the middleware chain

2. **Rate limiting too aggressive**
   - Adjust the `rateLimitPerMinute` in your policies
   - Consider using a distributed rate limiter for multi-instance deployments

3. **Validation errors**
   - Check that your JSON Schema is valid
   - Ensure request content-type headers are set correctly

## Performance Considerations

- The middleware adds minimal overhead when properly configured
- For high-traffic applications, consider:
  - Using a distributed rate limiter (Redis, etc.)
  - Caching validation results for repeated requests
  - Disabling unnecessary validations in production

## Best Practices

1. **Test your security configuration**
   - Write tests for your security policies
   - Test edge cases and malicious inputs

2. **Monitor and log security events**
   - Log all security-related events
   - Set up alerts for suspicious activity

3. **Keep dependencies updated**
   - Regularly update the security middleware
   - Stay informed about security advisories
