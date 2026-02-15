# SWISS Security Implementation Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Security Components](#core-security-components)
3. [Step-by-Step Implementation](#step-by-step-implementation)
4. [Advanced Configurations](#advanced-configurations)
5. [Testing Security](#testing-security)
6. [Deployment Considerations](#deployment-considerations)
7. [Maintenance and Monitoring](#maintenance-and-monitoring)

## Getting Started

### Prerequisites

- Node.js 18+ 
- SWISS Framework installed
- Basic understanding of security concepts

### Installation

```bash
# Install security package
npm install @swissjs/security

# Install peer dependencies
npm install @swissjs/core @swissjs/types
```

## Core Security Components

### 1. Security Engine
The central component that manages security policies and enforcement.

### 2. Security Middleware
Express/Connect middleware for request validation and protection.

### 3. Serialization Utilities
Safe serialization and deserialization functions.

### 4. Content Security
Input sanitization and output encoding functions.

### 5. Audit System
Comprehensive logging and monitoring of security events.

## Step-by-Step Implementation

### Step 1: Initialize Security Engine

```typescript
// src/security/index.ts
import { getDefaultSecurityEngine } from '@swissjs/security';

export const securityEngine = getDefaultSecurityEngine();

// Configure default settings
securityEngine.setContextDefaults({
  layer: 'application',
  environment: process.env.NODE_ENV || 'development'
});
```

### Step 2: Register Security Policies

```typescript
// src/security/policies.ts
import { securityEngine } from './index';

// API Access Policy
securityEngine.registerPolicy({
  id: 'api:access',
  description: 'Controls access to API endpoints',
  target: 'api:*',
  rateLimitPerMinute: 100,
  inputValidation: {
    sanitization: 'moderate',
    maxSize: 1024 * 1024 // 1MB
  }
});

// Authentication Policy
securityEngine.registerPolicy({
  id: 'auth:login',
  description: 'Controls login attempts',
  target: 'auth:login',
  rateLimitPerMinute: 5,
  inputValidation: {
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 }
      },
      required: ['email', 'password']
    }
  }
});

// Data Export Policy
securityEngine.registerPolicy({
  id: 'data:export',
  description: 'Controls data export functionality',
  target: 'data:export',
  roles: ['user', 'admin'],
  rateLimitPerMinute: 10,
  outputEncoding: {
    context: 'csv',
    rules: [
      { match: /^[=+\-@]/, replace: (match) => `'${match}` }
    ]
  }
});

// File Upload Policy
securityEngine.registerPolicy({
  id: 'files:upload',
  description: 'Controls file uploads',
  target: 'files:upload',
  roles: ['user'],
  inputValidation: {
    allowedContentTypes: [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'text/csv'
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    sanitization: 'strict'
  }
});
```

### Step 3: Set Up Security Middleware

```typescript
// src/middleware/security.ts
import { createSecurityMiddleware } from '@swissjs/security/middleware';
import { securityEngine } from '../security';

export const securityMiddleware = createSecurityMiddleware(securityEngine, {
  validateRequests: true,
  enableRateLimiting: true,
  addSecurityHeaders: true,
  requestSizeLimit: '10mb',
  onError: (error, req, res, next) => {
    console.error('Security middleware error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.message
      });
    }
    
    if (error.name === 'RateLimitError') {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: error.retryAfter
      });
    }
    
    next(error);
  }
});
```

### Step 4: Configure Audit System

```typescript
// src/security/audit.ts
import { SecurityAudit } from '@swissjs/security/audit';
import { securityEngine } from './index';

export const audit = new SecurityAudit(securityEngine, {
  enabled: true,
  maxEntries: 10000,
  persist: true,
  storage: {
    type: 'file',
    path: './logs/audit.log',
    rotation: 'daily',
    compression: true
  },
  retentionDays: 30
});

// Set up alerts for suspicious activity
audit.on('log', (entry) => {
  // Alert on multiple failed logins
  if (entry.action === 'auth.login.failure') {
    const recentFailures = audit.getAuditLog({
      action: 'auth.login.failure',
      ip: entry.context.ip,
      since: Date.now() - 300000 // Last 5 minutes
    });
    
    if (recentFailures.length >= 5) {
      sendSecurityAlert({
        type: 'brute_force_attack',
        ip: entry.context.ip,
        count: recentFailures.length,
        timestamp: Date.now()
      });
    }
  }
  
  // Alert on security threats
  if (entry.action === 'security.threat.detected') {
    sendSecurityAlert({
      type: 'security_threat',
      details: entry.details,
      timestamp: Date.now()
    });
  }
});

function sendSecurityAlert(alert: any) {
  // Implement your alerting mechanism
  console.warn('SECURITY ALERT:', alert);
  
  // Could send to:
  // - Slack webhook
  // - Email notification
  // - SIEM system
  // - Monitoring service
}
```

### Step 5: Integrate with Application

```typescript
// src/app.ts
import express from 'express';
import { securityMiddleware } from './middleware/security';
import { audit } from './security/audit';

const app = express();

// Apply security middleware first
app.use(securityMiddleware);

// Your existing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication routes
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Log login attempt弹性
    audit.logSecurityEvent({
      action: 'auth.login.attempt',
      target: `user:${email}`,
      context: {
        layer: 'authentication',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    // Authenticate user (your existing logic)
    const user = await authenticateUser(email, password);
    
    if (user) {
      // Log successful login
      audit.logSecurityEvent({
        action: 'auth.login.success',
        target: `user:${user.id}`,
        context: {
          layer: 'authentication',
          userId: user.id,
          ip: req.ip
        },
        details: { success: true }
      });
      
      res.json({ token: generateToken(user) });
    } else {
      // Log failed login
      audit.logSecurityEvent({
        action: 'auth.login.failure',
        target: `user:${email}`,
        context: {
          layer: 'authentication',
          ip: req.ip
        },
        details: { 
          success: false,
          reason: 'Invalid credentials'
        }
      });
      
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    audit.logSecurityEvent({
      action: 'auth.login.error',
      target: `user:${email}`,
      context: {
        layer: 'authentication',
        ip: req.ip
      },
      details: {
        success: false,
        error: error.message
      }
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Data export route
app.post('/api/export', async (req, res) => {
  const { format, filters } = req.body;
  
  try {
    // Data is already validated by security middleware
    const data = await getExportData(filters);
    
    let output;
    let contentType;
    
    switch (format) {
      case 'csv':
        output = convertToCsv(data); // Uses secure CSV conversion
        contentType = 'text/csv';
        break;
      case 'json':
        output = JSON.stringify(data);
        contentType = 'application/json';
        break;
      default:
        return res.status(400).json({ error: 'Unsupported format' });
    }
    
    // Log export event
    audit.logSecurityEvent({
      action: 'data.export',
      target: 'data:export',
      context: {
        layer: 'application',
        userId: req.user?.id,
        ip: req.ip
      },
      details: {
        format,
        recordCount: data.length,
        filters
      }
    });
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="export.${format}"`);
    res.send(output);
  } catch (error) {
    audit.logSecurityEvent({
      action: 'data.export.error',
      target: 'data:export',
      context: {
        layer: 'application',
        userId: req.user?.id,
        ip: req.ip
      },
      details: {
        error: error.message
      }
    });
    
    res.status(500).json({ error: 'Export failed' });
  }
});

// File upload route
app.post('/api/upload', async (req, res) => {
  try {
    // File is already validated by security middleware
    const file = req.file;
    
    // Process file (your existing logic)
    const result = await processFile(file);
    
    // Log upload event
    audit.logSecurityEvent({
      action: 'files.upload',
      target: 'files:upload',
      context: {
        layer: 'application',
        userId: req.user?.id,
        ip: req.ip
      },
      details: {
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }
    });
    
    res.json({ success: true, fileId: result.id });
  } catch (error) {
    audit.logSecurityEvent({
      action: 'files.upload.error',
      target: 'files:upload',
      context: {
        layer: 'application',
        userId: req.user?.id,
        ip: req.ip
      },
      details: {
        error: error.message
      }
    });
    
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default app;
```

### Step 6: Secure Data Handling

```typescript
// src/utils/security.ts
import { SafeSerializer, ContentSecurity } from '@swissjs/security';

export class SecureDataHandler {
  // Handle user input securely
  static handleUserInput(rawInput: any): any {
    try {
      // Validate input structure
      if (!this.validateInputStructure(rawInput)) {
        throw new Error('Invalid input structure');
      }
      
      // Sanitize for storage
      const sanitized = this.sanitizeForStorage(rawInput);
      
      // Serialize safely
      return SafeSerializer.safeStringify(sanitized);
    } catch (error) {
      console.error('Input handling error:', error);
      throw new Error('Invalid input data');
    }
  }
  
  // Export data securely
  static exportData(data: any[], format: string): string {
    switch (format) {
      case 'csv':
        return this.toSecureCsv(data);
      case 'json':
        return SafeSerializer.safeStringify(data);
      default:
        throw new Error('Unsupported export format');
    }
  }
  
  // Generate HTML content safely
  static generateHtml(userContent: string, context: 'div' | 'span' | 'input' = 'div'): string {
    const escaped = ContentSecurity.escapeHtml(userContent);
    
    switch (context) {
      case 'div':
        return `<div class="user-content">${escaped}</div>`;
      case 'span':
        return `<span class="user-text">${escaped}</span>`;
      case 'input':
        return `<input value="${escaped}" />`;
      default:
        return escaped;
    }
  }
  
  private static validateInputStructure(input: any): boolean {
    // Implement your validation logic
    return typeof input === 'object' && input !== null;
  }
  
  private static sanitizeForStorage(input: any): any {
    // Implement your sanitization logic
    if (typeof input === 'string') {
      return input.trim();
    }
    return input;
  }
  
  private static toSecureCsv(data: any[]): string {
    const headers = Object.keys(data[0] || {});
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.map(h => ContentSecurity.sanitizeForCsv(h)).join(','));
    
    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        const stringValue = value == null ? '' : String(value);
        return ContentSecurity.sanitizeForCsv(stringValue);
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
}
```

## Advanced Configurations

### Custom Security Policies

```typescript
// src/security/custom-policies.ts
import { securityEngine } from './index';

// Time-based access policy
securityEngine.registerPolicy({
  id: 'time:restricted',
  target: 'admin:*',
  predicate: (ctx) => {
    const hour = new Date().getHours();
    // Only allow admin access during business hours
    return hour >= 9 && hour <= 17;
  }
});

// IP whitelist policy
securityEngine.registerPolicy({
  id: 'ip:whitelist',
  target: 'api:sensitive',
  predicate: (ctx) => {
    const allowedIPs = ['192.168.1.0/24', '10.0.0.0/8'];
    const clientIP = ctx.ip;
    
    return allowedIPs.some(range => 
      ipInCIDR(clientIP, range)
    );
  }
});

// Geolocation-based policy
securityEngine.registerPolicy({
  id: 'geo:restricted',
  target: 'data:export',
  predicate: async (ctx) => {
    const geo = await getGeoLocation(ctx.ip);
    const allowedCountries = ['US', 'CA', 'GB'];
    return allowedCountries.includes(geo.country);
  }
});
```

### Custom Validators

```typescript
// src/security/validators.ts
import { Validator } from '@swissjs/security/validation';

class BusinessEmailValidator extends Validator {
  validate(email: string): boolean {
    // Block personal email providers
    const blocked = ['gmail.com', 'yahoo.com', 'hotmail.com'];
    const domain = email.split('@')[1]?.toLowerCase();
    return !blocked.includes(domain);
  }
}

class CreditCardValidator extends Validator {
  validate(cardNumber: string): boolean {
    // Luhn algorithm check
    const digits = cardNumber.replace(/\D/g, '');
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }
}

// Register validators
securityEngine.registerValidator('business-email', new BusinessEmailValidator());
securityEngine.registerValidator('credit-card', new CreditCardValidator());
```

## Testing Security

### Unit Tests

```typescript
// tests/security.test.ts
import { SafeSerializer, ContentSecurity } from '@swissjs/security';
import { securityEngine } from '../src/security';

describe('Security Features', () => {
  describe('SafeSerializer', () => {
    test('prevents prototype pollution', () => {
      const malicious = '{"__proto__": {"isAdmin": true}}';
      expect(() => SafeSerializer.safeParse(malicious)).toThrow('SecurityError');
    });
    
    test('handles normal objects correctly', () => {
      const normal = '{"name": "test", "value": 123}';
      const result = SafeSerializer.safeParse(normal);
      expect(result).toEqual({ name: 'test', value: 123 });
    });
  });
  
  describe('ContentSecurity', () => {
    test('prevents csv injection', () => {
      const malicious = '=SUM(1,2)';
      const safe = ContentSecurity.sanitizeForCsv(malicious);
      expect(safe).toBe("'=SUM(1,2)");
    });
    
    test('escapes html correctly', () => {
      const malicious = '<script>alert("xss")</script>';
      const safe = ContentSecurity.escapeHtml(malicious);
      expect(safe).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });
  
  describe('Security Policies', () => {
    test('enforces rate limiting', async () => {
      const ctx = { layer: 'test', ip: '127.0.0.1' };
      
      // Should allow first request
      expect(securityEngine.checkRateLimit('test:rate', ctx)).resolves.toBe(true);
      
      // Exceed rate limit
      for (let i = 0; i < 100; i++) {
        await securityEngine.checkRateLimit('test:rate', ctx);
      }
      
      // Should be rate limited
      expect(securityEngine.checkRateLimit('test:rate', ctx)).resolves.toBe(false);
    });
  });
});
```

### Integration Tests

```typescript
// tests/security-integration.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Security Integration', () => {
  test('blocks malicious requests', async () => {
    const response = await request(app)
      .post('/api/data')
      .send({ __proto__: { isAdmin: true } })
      .expect(400);
    
    expect(response.body.error).toContain('Invalid request data');
  });
  
  test('enforces rate limiting', async () => {
    // Make multiple rapid requests
    const promises = Array(10).fill(null).map(() =>
      request(app).post('/auth/login').send({
        email: 'test@example.com',
        password: 'password'
      })
    );
    
    const responses = await Promise.all(promises);
    
    // Some should be rate limited
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
  
  test('sanitizes csv exports', async () => {
    const response = await request(app)
      .post('/api/export')
      .send({
        format: 'csv',
        filters: {}
      })
      .expect(200);
    
    const csv = response.text;
    // Should not contain formula characters at start of lines
    const lines = csv.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        expect(line).not.toMatch(/^[=+\-@]/);
      }
    });
  });
});
```

### Security Scans

```json
// package.json scripts
{
  "scripts": {
    "test:security": "npm run test:unit && npm run test:integration",
    "audit:dependencies": "npm audit --audit-level=high",
    "scan:vulnerabilities": "npx snyk test",
    "scan:code": "npx eslint --ext .ts src/ --config .eslintrc.security.js",
    "test:penetration": "npx zap-baseline.py -t http://localhost:3000"
  }
}
```

## Deployment Considerations

### Environment Variables

```bash
# .env.production
SECURITY_ENABLED=true
SECURITY_LEVEL=high
SECURITY_AUDIT_ENABLED=true
SECURITY_RATE_LIMIT_STRICT=true
SECURITY_HEADERS_STRICT=true
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S swiss -u 1001

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY --chown=swiss:nodejs . .

# Switch to non-root user
USER swiss

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

### Kubernetes Security Context

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: swiss-app
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: app
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        resources:
          limits:
            cpu: 500m
            memory: 512Mi
          requests:
            cpu: 100m
            memory: 128Mi
```

## Maintenance and Monitoring

### Log Monitoring

```typescript
// src/monitoring/security-monitor.ts
import { audit } from '../security/audit';

class SecurityMonitor {
  private metrics = new Map<string, number>();
  
  start() {
    // Collect metrics every minute
    setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
    }, 60000);
  }
  
  private collectMetrics() {
    const now = Date.now();
    const lastHour = now - 3600000;
    
    // Failed logins
    const failedLogins = audit.getAuditLog({
      action: 'auth.login.failure',
      since: lastHour
    }).length;
    
    // Blocked requests
    const blockedRequests = audit.getAuditLog({
      action: 'security.blocked',
      since: lastHour
    }).length;
    
    // Threats detected
    const threats = audit.getAuditLog({
      action: 'security.threat.detected',
      since: lastHour
    }).length;
    
    this.metrics.set('failed_logins', failedLogins);
    this.metrics.set('blocked_requests', blockedRequests);
    this.metrics.set('threats_detected', threats);
  }
  
  private checkThresholds() {
    const failedLogins = this.metrics.get('failed_logins') || 0;
    const threats = this.metrics.get('threats_detected') || 0;
    
    // Alert on high failed login rate
    if (failedLogins > 50) {
      this.sendAlert({
        type: 'high_failed_login_rate',
        value: failedLogins,
        threshold: 50
      });
    }
    
    // Alert on threat detection
    if (threats > 0) {
      this.sendAlert({
        type: 'threats_detected',
        value: threats
      });
    }
  }
  
  private sendAlert(alert: any) {
    // Send to monitoring system
    console.warn('SECURITY ALERT:', alert);
  }
}

export const securityMonitor = new SecurityMonitor();
```

### Regular Security Tasks

```bash
#!/bin/bash
# scripts/security-maintenance.sh

echo "Running security maintenance..."

# Update dependencies
npm update

# Run security audit
npm audit

# Scan for vulnerabilities
npx snyk test

# Generate security report
npm run security:report

# Rotate secrets
npm run secrets:rotate

# Backup audit logs
npm run audit:backup

echo "Security maintenance complete"
```

### Compliance Checklist

- [ ] Regular security reviews (quarterly)
- [ ] Penetration testing (annually)
- [ ] Dependency updates (monthly)
- [ ] Security training (bi-annually)
- [ ] Incident response testing (quarterly)
- [ ] Backup verification (monthly)
- [ ] Access review (quarterly)

## Conclusion

This implementation guide provides a comprehensive approach to securing SWISS applications. By following these steps and best practices, you can protect against common security vulnerabilities while maintaining good performance and usability.

Remember that security is an ongoing process - regularly review and update your security measures as new threats emerge.
