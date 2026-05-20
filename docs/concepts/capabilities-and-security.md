# Capabilities and security

How SwissJS enforces capability-based access control at the component and runtime level.

---

## Overview

SwissJS uses a two-layer security model:

1. **Runtime capability checks** — components declare required capabilities; the runtime blocks mount if they aren't granted
2. **Security package** (`@swissjs/security`) — rate limiting, request validation, JSON schema enforcement, audit logging

The `@swissjs/core` runtime does not implement security directly. It holds a **gateway slot** that the security package fills at startup.

---

## Declaring capability requirements

### Swiss syntax

```typescript
@requires('network')
component UserList {
  async mount() {
    const users = await fetch('/api/users').then(r => r.json());
    this.users = users;
  }
}
```

Multiple capabilities:

```typescript
@requires('network', 'admin')
component AdminPanel { ... }
```

### Class API

```typescript
class AdminPanel extends SwissComponent {
  static requires = ['network', 'admin'];
}
```

At mount time, `evaluateCapability` is called for each entry in `static requires`. If any capability check returns `false`, the component does not mount.

---

## Setting up the security gateway

Install and wire `@swissjs/security` at app startup, before any components mount:

```typescript
import { setSecurityGateway } from '@swissjs/core';
import { InMemorySecurityEngine } from '@swissjs/security';

const engine = new InMemorySecurityEngine();

// Register policies
engine.registerPolicy({
  id: 'allow-network',
  target: 'network',
  effect: 'allow',
  conditions: [],
});

setSecurityGateway(engine);
```

If no gateway is set, all `evaluateCapability` calls return `true` (permissive default for development).

---

## Security gateway interface

`setSecurityGateway` accepts any object implementing `SecurityGateway`:

```typescript
interface SecurityGateway {
  evaluate(target: string, ctx: SecurityContext): boolean;
  audit(entry: { action: string; target?: string; success?: boolean; details?: unknown }): void;
  auditPlugin(plugin: { name: string; version?: string; requiredCapabilities?: string[] }): ValidationResult;
}
```

Custom implementations can integrate with any external authorization system.

---

## `@swissjs/security` package

### `InMemorySecurityEngine`

Reference implementation of `SecurityGateway`. Supports policy registration, evaluation, rate limiting, and audit log.

```typescript
import { InMemorySecurityEngine } from '@swissjs/security';

const engine = new InMemorySecurityEngine({
  windowMs: 60_000,   // rate limit window
  maxRequests: 100,   // max requests per window
});
```

### `SecurityValidator`

JSON Schema validation for request payloads:

```typescript
import { SecurityValidator } from '@swissjs/security';

const validator = new SecurityValidator();
validator.addSchema('CreateUser', {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
});

const result = validator.validate('CreateUser', requestBody);
if (!result.ok) console.error(result.reasons);
```

### Middleware

Express-compatible middleware for server-side endpoints:

```typescript
import {
  createRateLimitMiddleware,
  createValidationMiddleware,
  createSecurityHeadersMiddleware,
} from '@swissjs/security';

app.use(createSecurityHeadersMiddleware());
app.use('/api', createRateLimitMiddleware({ maxRequests: 50 }));
app.post('/api/users', createValidationMiddleware({ schema: 'CreateUser' }), handler);
```

### Types

```typescript
import type {
  SecurityContext,
  SecurityGateway,
  SecurityPolicy,
  ValidationResult,
  AuditEntry,
} from '@swissjs/security';
```

---

## Capability-secured Signals

Signals can require a capability to be read inside an active effect:

```typescript
import { Signal } from '@swissjs/core';

const adminData = new Signal<string[]>([], { capability: 'admin' });

// Reading inside an effect without 'admin' capability throws:
// "Access denied to signal 'adminData'. Missing capability: admin"
```

This is enforced at runtime — the Signal checks the current capability context before returning its value.

---

## Audit log

All capability evaluations can be audited:

```typescript
import { audit } from '@swissjs/core';

audit({
  action: 'component.mount',
  target: 'AdminPanel',
  success: true,
  details: { capabilities: ['admin'] },
});
```

The `InMemorySecurityEngine` stores these in an in-memory log accessible via `engine.getAuditLog()`. Production deployments should replace this with a persistent audit backend by implementing a custom `SecurityGateway`.
