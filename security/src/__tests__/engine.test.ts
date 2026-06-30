/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from 'vitest';
import { InMemorySecurityEngine, sanitizeString } from '../engine.js';
import type { SecurityPolicy } from '../types.js';

describe('@swissjs/security engine', () => {
  it('allows when no policy denies', async () => {
    const eng = new InMemorySecurityEngine();
    const ok = await eng.evaluate('storage:read', { layer: 'runtime' });
    expect(ok).toBe(true);
  });

  it('enforces role requirement', async () => {
    const eng = new InMemorySecurityEngine();
    const policy: SecurityPolicy = { id: 'storage:*', target: 'storage:*', roles: ['admin'] };
    eng.registerPolicy(policy);

    const denied = await eng.evaluate('storage:write', { layer: 'runtime', roles: ['user'] });
    const allowed = await eng.evaluate('storage:write', { layer: 'runtime', roles: ['admin'] });

    expect(denied).toBe(false);
    expect(allowed).toBe(true);

    const log = eng.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('sanitizeInput / sanitizeString', () => {
  const eng = new InMemorySecurityEngine();

  it('"none" returns input unchanged', () => {
    const raw = '<script>alert(1)</script>';
    expect(eng.sanitizeInput(raw, 'none')).toBe(raw);
    expect(sanitizeString(raw, 'none')).toBe(raw);
  });

  it('"basic" removes script blocks', () => {
    const out = eng.sanitizeInput('<b>hello</b><script>alert(1)</script>', 'basic');
    expect(out).not.toContain('<script>');
    expect(out).toContain('<b>hello</b>');
  });

  it('"basic" removes javascript: hrefs', () => {
    const out = eng.sanitizeInput('<a href="javascript:alert(1)">click</a>', 'basic');
    expect(out).not.toContain('javascript:');
  });

  it('"basic" removes on* event attributes', () => {
    const out = eng.sanitizeInput('<img src="x" onerror="alert(1)">', 'basic');
    expect(out).not.toContain('onerror');
  });

  it('"strict" strips all HTML tags', () => {
    const out = eng.sanitizeInput('<b>bold</b> and <i>italic</i>', 'strict');
    expect(out).toBe('bold and italic');
    expect(out).not.toContain('<');
  });

  it('"strict" decodes basic HTML entities', () => {
    const out = eng.sanitizeInput('&lt;div&gt;&amp;', 'strict');
    expect(out).toBe('<div>&');
  });
});
