# SWISS Security Framework

## Overview

The SWISS Security Framework provides a comprehensive set of tools and patterns to help developers build secure applications. It addresses common security vulnerabilities found in modern web frameworks, including those identified in recent CVEs affecting React and Next.js.

## Key Security Features

### 1. **Secure Serialization**
- Prevents prototype pollution attacks (like React2Shell CVE-2025-55182)
- Safe JSON parsing and stringifying
- Protection against unsafe deserialization

### 2. **Input Validation & Sanitization**
- JSON Schema-based validation
- Context-aware output encoding
- CSV injection prevention
- XSS protection

### 3. **Security Middleware**
- Request validation
- Rate limiting
- Security headers
- Authentication and authorization

### 4. **Comprehensive Auditing**
- Security event logging
- Threat detection
- Compliance reporting
- Real-time monitoring

## Addressing Recent Vulnerabilities

### React2Shell (CVE-2025-55182)
**Problem**: Remote Code Execution via unsafe deserialization in React Server Components.

**SWISS Solution**:
- Use `SafeSerializer.safeParse()` instead of `JSON.parse()`
- Implement strict input validation for all serialized data
- Add prototype pollution protection

```typescript
// Instead of this (vulnerable):
const data = JSON.parse(userInput);

// Use this (secure):
import { SafeSerializer } from '@swissjs/security/serialization';
const data = SafeSerializer.safeParse(userInput);
```

### CSV Injection (CVE-2025-11279, CVE-2025-55745)
**Problem**: Malicious formulas in exported CSV files.

**SWISS Solution**:
- Automatic CSV sanitization
- Context-aware output encoding

```typescript
import { ContentSecurity } from '@swissjs/security/content';

const safeCsv = userInput.map(cell => 
  ContentSecurity.sanitizeForCsv(cell)
).join(',');
```

### Middleware Bypass (CVE-2025-29927)
**Problem**: Header injection bypassing authentication.

**SWISS Solution**:
- Secure header validation
- Trust boundary enforcement
- Multi-layer authentication

```typescript
import { createSecurityMiddleware } from '@swissjs/security/middleware';

app.use(createSecurityMiddleware(securityEngine, {
  validateHeaders: true,
  trustInternalHeaders: false
}));
```

## Quick Start

### Installation

```bash
npm install @swissjs/security
```

### Basic Setup

```typescript
import { getDefaultSecurityEngine } from '@swissjs/security';
import { createSecurityMiddleware } from '@swissjs/security/middleware';
import { SecurityAudit } from '@swissjs/security/audit';
import express from 'express';

const app = express();
const securityEngine = getDefaultSecurityEngine();
const audit = new SecurityAudit(securityEngine);

// Register security policies
securityEngine.registerPolicy({
  id: 'api:access',
  target: 'api:*',
  rateLimitPerMinute: 100,
  inputValidation: {
    sanitization: 'strict'
  }
});

// Apply security middleware
app.use(createSecurityMiddleware(securityEngine));

// Your routes here
app.get('/api/data', (req, res) => {
  // Request is already validated and sanitized
  res.json({ message: 'Secure data' });
});
```

## Architecture

### Security Layers

1. **Network Layer**
   - Rate limiting
   - IP filtering
   - DDoS protection

2. **Application Layer**
   - Input validation
   - Authentication
   - Authorization

3. **Data Layer**
   - Secure serialization
   - Output encoding
   - Data encryption

4. **Monitoring Layer**
   - Audit logging
   - Threat detection
   - Compliance reporting

### Trust Boundaries

SWISS enforces strict trust boundaries:

```
[Client] ←→ [Security Middleware] ←→ [Application] ←→ [Data Store]
    ↑              ↑                        ↑
  Untrusted      Validated               Protected
```

## Security Policies

### Default Policies

SWISS includes pre-configured security policies:

```typescript
// API access policy
{
  id: 'api:default',
  target: 'api:*',
  rateLimitPerMinute: 100,
  inputValidation: {
    sanitization: 'moderate'
  }
}

// File upload policy
{
  id: 'files:upload',
  target: 'files:upload',
  inputValidation: {
    allowedContentTypes: ['image/*', 'application/pdf'],
    maxSize: 10 * 1024 * 1024 // 10MB
  }
}

// Data export policy
{
  id: 'data:export',
  target: 'data:export',
  roles: ['user'],
  rateLimitPerMinute: 10
}
```

## Best Practices

### 1. Defense in Depth

```typescript
// Multiple layers of security
app.use(securityMiddleware);           // Layer 1: Network
app.use(authMiddleware);               // Layer 2: Authentication
app.use(authorizationMiddleware);      // Layer 3: Authorization
app.use(inputValidationMiddleware);   // Layer 4: Input validation
```

### 2. Fail Securely

```typescript
// Default to deny
const policy = {
  id: 'strict:policy',
  target: 'sensitive:*',
  roles: [], // Empty means no roles allowed by default
  predicate: (ctx) => false // Deny by default
};
```

### 3. Validate Everything

```typescript
// Validate all inputs
const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 }
  },
  required: ['email', 'password']
};
```

### 4. Log Everything

```typescript
// Comprehensive audit logging
audit.logSecurityEvent({
  action: 'user.login',
  target: `user:${userId}`,
  context: { layer: 'auth', ip: req.ip },
  details: { success: true, method: 'password' }
});
```

## Testing Security

### Unit Tests

```typescript
import { SafeSerializer, ContentSecurity } from '@swissjs/security';

describe('Security', () => {
  test('prevents prototype pollution', () => {
    const malicious = '{"__proto__": {"isAdmin": true}}';
    expect(() => SafeSerializer.safeParse(malicious)).toThrow();
  });

  test('prevents csv injection', () => {
    const malicious = '=SUM(1,2)';
    const safe = ContentSecurity.sanitizeForCsv(malicious);
    expect(safe).toMatch(/^'/);
  });
});
```

### Integration Tests

```typescript
describe('Security Integration', () => {
  test('blocks malicious requests', async () => {
    const response = await request(app)
      .post('/api/data')
      .send({ __proto__: { isAdmin: true } })
      .expect(400);
    
    expect(response.body.error).toContain('Invalid input');
  });
});
```

### Security Scans

```bash
# Run security audit
npm audit

# Scan for vulnerabilities
npx snyk test

# Run OWASP ZAP
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3000
```

## Monitoring and Alerting

### Key Metrics

- Failed authentication attempts
- Rate limit violations
- Unusual access patterns
- Security policy violations
- System errors

### Alert Configuration

```typescript
// Alert on suspicious activity
audit.on('log', (entry) => {
  if (entry.action === 'auth.login.failure') {
    const recentFailures = getRecentFailures(entry.context.ip);
    if (recentFailures >= 5) {
      sendAlert({
        type: 'brute_force',
        ip: entry.context.ip,
        count: recentFailures
      });
    }
  }
});
```

## Compliance

### Supported Standards

- **OWASP Top 10**: Protection against common web vulnerabilities
- **GDPR**: Data protection and privacy
- **SOC 2**: Security controls and procedures
- **ISO 27001**: Information security management

### Audit Trails

SWISS provides comprehensive audit trails for:

- User authentication and authorization
- Data access and modification
- System configuration changes
- Security events and incidents

## Performance Considerations

### Optimization Tips

1. **Cache validation results** for repeated requests
2. **Use streaming** for large data processing
3. **Implement log sampling** for high-traffic applications
4. **Optimize database queries** for audit log storage

### Benchmarks

- Request validation: <1ms overhead
- Rate limiting: <0.5ms overhead
- Security headers: <0.1ms overhead
- Audit logging: <2ms overhead

## Migration Guide

### From Express

```typescript
// Before
app.use(express.json());
app.use(cors());

// After
app.use(createSecurityMiddleware(securityEngine));
```

### From Custom Security

```typescript
// Before
app.use((req, res, next) => {
  if (req.headers['x-custom-header']) {
    // Custom logic
  }
  next();
});

// After
securityEngine.registerPolicy({
  id: 'custom:policy',
  target: 'api:*',
  predicate: (ctx) => validateCustomHeader(ctx)
});
```

## Troubleshooting

### Common Issues

1. **Headers not being set**
   - Ensure middleware is mounted first
   - Check for conflicts with other middleware

2. **Rate limiting too aggressive**
   - Adjust policy rate limits
   - Consider distributed rate limiting

3. **Validation errors**
   - Check JSON Schema syntax
   - Verify content-type headers

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG = 'swiss:security';

// Get detailed audit information
const detailedLog = audit.getAuditLog({ 
  verbose: true,
  includeStackTrace: true
});
```

## Contributing

### Security Issues

For security vulnerabilities, please:

1. Do not open a public issue
2. Email security@swissjs.com
3. Include detailed reproduction steps
4. Wait for our response before disclosing

### Development

```bash
# Clone the repository
git clone https://github.com/swissjs/security.git

# Install dependencies
npm install

# Run tests
npm test

# Run security tests
npm run test:security
```

## License

SWISS Security Framework is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

## Support

- **Documentation**: https://swissjs.com/security
- **Issues**: https://github.com/swissjs/security/issues
- **Discussions**: https://github.com/swissjs/security/discussions
- **Twitter**: @swissjs

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
