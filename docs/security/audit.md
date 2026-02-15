# Security Audit in SWISS

## Overview
The security audit system provides comprehensive logging and monitoring of security-related events in your application. It helps track authentication attempts, authorization decisions, and potential security threats.

## API Reference

### `SecurityAudit`

#### `constructor(engine: SecurityGateway)`

Creates a new SecurityAudit instance.

**Parameters:**
- `engine`: The security engine to use for logging

**Example:**
```typescript
import { getDefaultSecurityEngine } from '@swissjs/security';
import { SecurityAudit } from '@swissjs/security/audit';

const engine = getDefaultSecurityEngine();
const audit = new SecurityAudit(engine);
```

#### `logSecurityEvent(event: SecurityEvent): void`

Logs a security event.

**Parameters:**
- `event`: The security event to log

**Example:**
```typescript
audit.logSecurityEvent({
  action: 'login.attempt',
  target: 'user:123',
  context: {
    layer: 'authentication',
    userId: '123',
    ip: '192.168.1.1'
  },
  details: {
    success: false,
    reason: 'Invalid credentials'
  }
});
```

#### `logAndCheckRateLimit(key: string, context: SecurityContext): Promise<boolean>`

Checks if a rate limit has been exceeded and logs the attempt.

**Parameters:**
- `key`: The rate limit key (e.g., 'login:192.168.1.1')
- `context`: The security context

**Returns:** `true` if the request is allowed, `false` if rate limited

**Example:**
```typescript
const allowed = await audit.logAndCheckRateLimit(
  `login:${req.ip}`,
  { layer: 'authentication' }
);

if (!allowed) {
  return res.status(429).send('Too many requests');
}
```

#### `getAuditLog(filter?: AuditFilter): AuditEntry[]`

Retrieves audit log entries with optional filtering.

**Parameters:**
- `filter`: Optional filter criteria

**Returns:** Array of audit entries

**Example:**
```typescript
// Get all failed login attempts in the last hour
const failedLogins = audit.getAuditLog({
  action: 'login.attempt',
  success: false,
  since: Date.now() - 3600000
});
```

#### `exportAuditLog(format: 'json' | 'csv'): string`

Exports the audit log in the specified format.

**Parameters:**
- `format`: Export format ('json' or 'csv')

**Returns:** Formatted audit log string

**Example:**
```typescript
const csvLog = audit.exportAuditLog('csv');
fs.writeFileSync('audit.csv', csvLog);
```

## Event Schema

Security events follow this schema:

```typescript
interface SecurityEvent {
  // The action that was performed
  action: string;
  
  // The target of the action (e.g., 'user:123')
  target: string;
  
  // Security context
  context: SecurityContext & {
    // Additional context fields
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
  
  // Event details
  details?: {
    // Whether the action was successful
    success?: boolean;
    
    // Error message or status
    error?: string;
    
    // Additional metadata
    [key: string]: any;
  };
}
```

## Standard Event Types

### Authentication Events
- `auth.login.success` - Successful login
- `auth.login.failure` - Failed login attempt
- `auth.logout` - User logout
- `auth.password.reset` - Password reset request
- `auth.password.changed` - Password successfully changed
- `auth.mfa.enabled` - Multi-factor authentication enabled
- `auth.mfa.disabled` - Multi-factor authentication disabled

### Authorization Events
- `authz.granted` - Access granted
- `authz.denied` - Access denied
- `authz.elevated` - Elevated privileges granted
- `authz.suspended` - Privileges suspended

### Data Events
- `data.access` - Data accessed
- `data.create` - Data created
- `data.update` - Data updated
- `data.delete` - Data deleted
- `data.export` - Data exported
- `data.import` - Data imported

### Security Events
- `security.threat.detected` - Potential security threat detected
- `security.blocked` - Request blocked by security policy
- `security.suspicious` - Suspicious activity detected
- `security.breach` - Security breach confirmed

### System Events
- `system.startup` - System startup
- `system.shutdown` - System shutdown
- `system.error` - System error
- `system.maintenance` - Maintenance mode activated

## Configuration

### Audit Configuration

```typescript
interface AuditConfig {
  // Whether to enable audit logging (default: true)
  enabled?: boolean;
  
  // Maximum number of entries to keep in memory (default: 10000)
  maxEntries?: number;
  
  // Whether to persist logs to storage (default: false)
  persist?: boolean;
  
  // Storage configuration (if persist is true)
  storage?: {
    type: 'file' | 'database' | 'remote';
    // Storage-specific options
    [key: string]: any;
  };
  
  // Log retention period in days (default: 30)
  retentionDays?: number;
  
  // Events to exclude from logging
  excludeEvents?: string[];
  
  // Custom event transformers
  transformers?: Array<{
    event: string | RegExp;
    transform: (event: SecurityEvent) => SecurityEvent;
  }>;
}
```

### Example Configuration

```typescript
const audit = new SecurityAudit(engine, {
  enabled: true,
  maxEntries: 50000,
  persist: true,
  storage: {
    type: 'file',
    path: './logs/audit.log',
    rotation: 'daily'
  },
  retentionDays: 90,
  excludeEvents: [
    'system.startup',
    'system.shutdown'
  ]
});
```

## Integration

### With Winston

```typescript
import winston from 'winston';
import { SecurityAudit } from '@swissjs/security/audit';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'security.log' })
  ]
});

const audit = new SecurityAudit(engine);

// Forward audit logs to Winston
audit.on('log', (entry) => {
  logger.info('Security event', {
    ...entry,
    type: 'security'
  });
});
```

### With Elasticsearch

```typescript
import { Client } from '@elastic/elasticsearch';
import { SecurityAudit } from '@swissjs/security/audit';

const esClient = new Client({ node: 'http://localhost:9200' });

const audit = new SecurityAudit(engine, {
  persist: true,
  storage: {
    type: 'elasticsearch',
    client: esClient,
    index: 'security-audit'
  }
});
```

### With SIEM Systems

```typescript
import { SecurityAudit } from '@swissjs/security/audit';

const audit = new SecurityAudit(engine);

// Forward critical events to SIEM
audit.on('log', (entry) => {
  if (entry.details?.threat) {
    sendToSIEM({
      timestamp: entry.timestamp,
      event: entry.target,
      severity: 'high',
      details: entry.details
    });
  }
});
```

## Monitoring and Alerting

### Setting Up Alerts

```typescript
// Alert on multiple failed logins
audit.on('log', (entry) => {
  if (entry.action === 'auth.login.failure') {
    const recentFailures = audit.getAuditLog({
      action: 'auth.login.failure',
      ip: entry.context.ip,
      since: Date.now() - 300000 // Last 5 minutes
    });
    
    if (recentFailures.length >= 5) {
      sendAlert({
        type: 'brute_force_attack',
        ip: entry.context.ip,
        count: recentFailures.length
      });
    }
  }
});
```

### Dashboard Metrics

```typescript
// Get security metrics for dashboard
const getSecurityMetrics = () => {
  const now = Date.now();
  const last24h = now - 86400000;
  
  return {
    totalEvents: audit.getAuditLog({ since: last24h }).length,
    failedLogins: audit.getAuditLog({
      action: 'auth.login.failure',
      since: last24h
    }).length,
    blockedRequests: audit.getAuditLog({
      action: 'security.blocked',
      since: last24h
    }).length,
    threatsDetected: audit.getAuditLog({
      action: 'security.threat.detected',
      since: last24h
    }).length
  };
};
```

## Best Practices

1. **Log all security-relevant events**
   - Authentication attempts
   - Authorization decisions
   - Data access/modification
   - Security policy violations

2. **Include sufficient context**
   - User ID and IP address
   - Request ID for tracing
   - User agent and other headers
   - Timestamp and timezone

3. **Don't log sensitive information**
   - Passwords
   - Session tokens
   - Personal data (unless required)
   - Encryption keys

4. **Monitor and alert on suspicious patterns**
   - Multiple failed logins
   - Unusual access patterns
   - Privilege escalation attempts
   - Data exfiltration indicators

5. **Regularly review audit logs**
   - Daily for critical systems
   - Weekly for normal systems
   - Monthly for compliance requirements

## Security Considerations

- Store audit logs securely and tamper-proof
- Implement log rotation and retention policies
- Ensure compliance with relevant regulations (GDPR, HIPAA, SOX)
- Use write-once storage for critical logs
- Implement secure backup procedures
- Monitor for log tampering attempts

## Performance Considerations

- Audit logging adds minimal overhead when properly configured
- For high-traffic applications, consider:
  - Asynchronous logging
  - Batch log writes
  - Log sampling for non-critical events
  - Dedicated log storage servers

## Troubleshooting

### Common Issues

1. **Missing audit entries**
   - Check if audit is enabled
   - Verify event filters aren't too restrictive
   - Check storage configuration

2. **Performance degradation**
   - Reduce log verbosity
   - Implement log sampling
   - Use faster storage for logs

3. **Storage issues**
   - Check disk space
   - Verify file permissions
   - Monitor storage performance

## Compliance

### GDPR Compliance
- Log only necessary data
- Implement data retention policies
- Provide data export capabilities
- Support right to erasure

### SOX Compliance
- Maintain immutable logs
- Implement proper segregation of duties
- Regular log reviews and attestations

### HIPAA Compliance
- Log access to protected health information
- Implement audit trail for all data access
- Maintain logs for required retention period
