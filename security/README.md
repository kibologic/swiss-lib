# @swissjs/security

Security engine for SwissJS. Implements the `SecurityGateway` interface consumed by `@swissjs/core`, plus rate limiting, JSON schema validation, and security middleware.

---

## Installation

```bash
pnpm add @swissjs/security
```

Wire it at app startup before any components mount:

```typescript
import { setSecurityGateway } from '@swissjs/core';
import { InMemorySecurityEngine } from '@swissjs/security';

setSecurityGateway(new InMemorySecurityEngine());
```

---

## `InMemorySecurityEngine`

Reference implementation of `SecurityGateway`. Stores policies, audit log, and rate limit state in memory.

```typescript
import { InMemorySecurityEngine } from '@swissjs/security';

const engine = new InMemorySecurityEngine({
  windowMs: 60_000,    // rate limit window in ms
  maxRequests: 100,    // max requests per window per key
});

// Register a policy
engine.registerPolicy({
  id: 'allow-network',
  target: 'network',
  effect: 'allow',
  conditions: [],
});

// Evaluate a capability check
const allowed = engine.evaluate('network', { layer: 'component', componentName: 'UserList' });

// Read the audit log
const log = engine.getAuditLog();
```

---

## `SecurityValidator`

JSON Schema validation for payloads.

```typescript
import { SecurityValidator } from '@swissjs/security';

const validator = new SecurityValidator();

validator.addSchema('CreateUser', {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
  },
  additionalProperties: false,
});

const result = validator.validate('CreateUser', body);
if (!result.ok) {
  console.error('Validation failed:', result.reasons);
}
```

---

## `RateLimiter`

```typescript
import { RateLimiter } from '@swissjs/security';

const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 50 });

const result = limiter.check('user-123');
if (!result.allowed) {
  console.warn('Rate limit exceeded, retry after:', result.retryAfter);
}
```

---

## Middleware (Express-compatible)

```typescript
import {
  createSecurityHeadersMiddleware,
  createRateLimitMiddleware,
  createValidationMiddleware,
  createPolicyValidationMiddleware,
} from '@swissjs/security';

// Security headers (HSTS, CSP, X-Frame-Options, etc.)
app.use(createSecurityHeadersMiddleware({
  contentSecurityPolicy: "default-src 'self'",
}));

// Rate limiting per route
app.use('/api', createRateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }));

// Request body validation
app.post('/api/users',
  createValidationMiddleware({ schema: 'CreateUser', validator }),
  handler,
);

// Policy enforcement
app.use('/api/admin',
  createPolicyValidationMiddleware({ capability: 'admin', engine }),
  adminRouter,
);
```

---

## Types

```typescript
import type {
  SecurityGateway,
  SecurityContext,
  SecurityPolicy,
  ValidationResult,
  AuditEntry,
  AuditFilter,
  AuditConfig,
  JSONSchema,
  SecurityError,
  SecurityEvent,
  SecurityMiddlewareOptions,
  RateLimitConfig,
  RateLimitResult,
  ValidationRule,
  CompiledSchema,
} from '@swissjs/security';
```

---

## Custom gateway

For production, implement `SecurityGateway` to integrate with your auth system:

```typescript
import { setSecurityGateway } from '@swissjs/core';
import type { SecurityGateway, SecurityContext, ValidationResult } from '@swissjs/security';

class ProductionGateway implements SecurityGateway {
  evaluate(target: string, ctx: SecurityContext): boolean {
    return authService.hasPermission(ctx.userId!, target);
  }

  audit(entry: { action: string; target?: string; success?: boolean }) {
    auditService.log(entry);
  }

  auditPlugin(plugin: { name: string; requiredCapabilities?: string[] }): ValidationResult {
    return { ok: true };
  }
}

setSecurityGateway(new ProductionGateway());
```
