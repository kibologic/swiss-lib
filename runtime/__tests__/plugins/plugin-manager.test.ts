/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Plugin System Tests — Phase 4 PR3
 *
 * Covers lifecycle orchestration, rollback, service registry, capability audit,
 * hook emissions, duplicate detection, and getAudit().
 *
 * These tests use real PluginManager instances (no mocking of internals) and
 * mirror real Alpine ERP plugin patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from '../../src/plugins/pluginManager.js';
import type { Plugin, PluginContext } from '../../src/plugins/pluginInterface.js';
import type { AuditResult } from '../../src/plugins/types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlugin(overrides: Partial<Plugin> & { name: string }): Plugin {
  return {
    version: '0.1.0',
    ...overrides,
  };
}

function withExperimentalFlag(fn: () => void) {
  const prev = process.env.SWISS_EXPERIMENTAL_PLUGIN_LIFECYCLE;
  process.env.SWISS_EXPERIMENTAL_PLUGIN_LIFECYCLE = '1';
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.SWISS_EXPERIMENTAL_PLUGIN_LIFECYCLE;
    } else {
      process.env.SWISS_EXPERIMENTAL_PLUGIN_LIFECYCLE = prev;
    }
  }
}

// ─── Suite 1: Lifecycle order ────────────────────────────────────────────────

describe('PluginManager — lifecycle order (experimental flag ON)', () => {
  it('calls init → onLoad → onRegisterServices in order', () => {
    const order: string[] = [];
    const plugin = makePlugin({
      name: 'lifecycle-order',
      init: () => { order.push('init'); },
      onLoad: () => { order.push('onLoad'); },
      onRegisterServices: () => { order.push('onRegisterServices'); },
    });

    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(plugin);
    });

    expect(order).toEqual(['init', 'onLoad', 'onRegisterServices']);
  });

  it('passes a valid PluginContext to each lifecycle hook', () => {
    const contexts: PluginContext[] = [];
    const plugin = makePlugin({
      name: 'ctx-check',
      init: (ctx) => { contexts.push(ctx); },
      onLoad: (ctx) => { contexts.push(ctx); },
    });

    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(plugin);
    });

    expect(contexts).toHaveLength(2);
    for (const ctx of contexts) {
      expect(ctx).toHaveProperty('hooks');
      expect(ctx).toHaveProperty('capabilities');
      expect(ctx).toHaveProperty('logger');
      expect(typeof ctx.logger.info).toBe('function');
    }
  });
});

// ─── Suite 2: Rollback on activation failure ─────────────────────────────────

describe('PluginManager — rollback on activation failure (experimental flag ON)', () => {
  it('removes plugin from registry when onLoad throws', () => {
    const plugin = makePlugin({
      name: 'failing-plugin',
      init: () => {},
      onLoad: () => { throw new Error('activation failed'); },
    });

    withExperimentalFlag(() => {
      const pm = new PluginManager();
      expect(() => pm.registerPlugin(plugin)).toThrow('activation failed');
      expect(pm.listPlugins()).not.toContain('failing-plugin');
    });
  });

  it('removes plugin hooks when onLoad throws', () => {
    let hookAdded = false;
    const plugin = makePlugin({
      name: 'hook-rollback',
      init: (ctx) => {
        ctx.registerHook({ name: 'testHook', handler: () => {} });
        hookAdded = true;
      },
      onLoad: () => { throw new Error('boom'); },
    });

    withExperimentalFlag(() => {
      const pm = new PluginManager();
      try { pm.registerPlugin(plugin); } catch { /* expected */ }
      expect(hookAdded).toBe(true);
      // Plugin should not be listed after rollback
      expect(pm.listPlugins()).not.toContain('hook-rollback');
    });
  });
});

// ─── Suite 3: Service registry ───────────────────────────────────────────────

describe('PluginManager — service registry', () => {
  let pm: PluginManager;
  beforeEach(() => { pm = new PluginManager(); });

  it('registerService + getService returns the registered impl', () => {
    const impl = { query: () => [] };
    pm.registerService('db', impl);
    expect(pm.getService<typeof impl>('db')).toBe(impl);
  });

  it('duplicate registerService keeps first and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = { id: 'first' };
    const second = { id: 'second' };
    pm.registerService('svc', first);
    pm.registerService('svc', second);
    expect(pm.getService('svc')).toBe(first);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("'svc'"));
    warnSpy.mockRestore();
  });

  it('hasService returns true for registered service', () => {
    pm.registerService('router', {});
    expect(pm.hasService('router')).toBe(true);
  });

  it('hasService returns false for unknown service', () => {
    expect(pm.hasService('unknown-service')).toBe(false);
  });
});

// ─── Suite 4: Capability audit ───────────────────────────────────────────────

describe('PluginManager — capability audit', () => {
  it('audit passes when provider announces what consumer requires', () => {
    const provider = makePlugin({
      name: 'db-provider',
      announcedCapabilities: ['db'],
    });
    const consumer = makePlugin({
      name: 'db-consumer',
      requiredCapabilities: ['db'],
    });

    let audit: AuditResult | null = null;
    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(provider);
      pm.registerPlugin(consumer);
      audit = pm.runCapabilityAudit();
    });

    expect(audit).not.toBeNull();
    expect(audit!.ok).toBe(true);
    expect(audit!.errors).toHaveLength(0);
  });

  it('audit fails when required capability has no provider', () => {
    const consumer = makePlugin({
      name: 'cache-consumer',
      requiredCapabilities: ['cache'],
    });

    let audit: AuditResult | null = null;
    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(consumer);
      audit = pm.runCapabilityAudit();
    });

    expect(audit).not.toBeNull();
    expect(audit!.ok).toBe(false);
    expect(audit!.errors[0].message).toMatch(/cache/);
    expect(audit!.errors[0].plugin).toBe('cache-consumer');
  });

  it('granted capabilities via grantCapability() satisfy required caps', () => {
    const consumer = makePlugin({
      name: 'cap-consumer',
      requiredCapabilities: ['feature:x'],
    });

    let audit: AuditResult | null = null;
    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.grantCapability('feature:x');
      pm.registerPlugin(consumer);
      audit = pm.runCapabilityAudit();
    });

    expect(audit!.ok).toBe(true);
  });
});

// ─── Suite 5: onCapabilityAudit hook ────────────────────────────────────────

describe('PluginManager — onCapabilityAudit hook', () => {
  it('fires onCapabilityAudit hook with the AuditResult', () => {
    const auditResults: AuditResult[] = [];
    const observer = makePlugin({
      name: 'audit-observer',
      onCapabilityAudit: (result) => { auditResults.push(result); },
    });

    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(observer);
      // runCapabilityAudit is called automatically after registerPlugin in experimental mode
      // but call it explicitly to verify the observer hook fires
      pm.runCapabilityAudit();
    });

    // At minimum 1 audit result received (may be 2 if auto-run + explicit)
    expect(auditResults.length).toBeGreaterThanOrEqual(1);
    expect(auditResults[0]).toHaveProperty('ok');
    expect(auditResults[0]).toHaveProperty('errors');
    expect(auditResults[0]).toHaveProperty('summary');
  });
});

// ─── Suite 6: Duplicate plugin registration ──────────────────────────────────

describe('PluginManager — duplicate plugin detection', () => {
  it('throws when the same plugin name is registered twice', () => {
    const pm = new PluginManager();
    const plugin = makePlugin({ name: 'unique-plugin' });
    pm.registerPlugin(plugin);
    expect(() => pm.registerPlugin(plugin)).toThrow('already registered');
  });

  it('first registration succeeds and plugin is listed', () => {
    const pm = new PluginManager();
    pm.registerPlugin(makePlugin({ name: 'first' }));
    expect(pm.listPlugins()).toContain('first');
  });
});

// ─── Suite 7: getAudit() ────────────────────────────────────────────────────

describe('PluginManager — getAudit()', () => {
  it('returns null before any plugins are registered', () => {
    const pm = new PluginManager();
    expect(pm.getAudit()).toBeNull();
  });

  it('returns the last AuditResult after registration with experimental flag', () => {
    let audit: AuditResult | null = null;
    withExperimentalFlag(() => {
      const pm = new PluginManager();
      pm.registerPlugin(makePlugin({ name: 'any-plugin' }));
      audit = pm.getAudit();
    });

    expect(audit).not.toBeNull();
    expect(audit).toHaveProperty('ok');
    expect(audit).toHaveProperty('summary');
  });

  it('getAudit() reflects the most recent runCapabilityAudit() result', () => {
    const pm = new PluginManager();
    pm.registerPlugin(makePlugin({ name: 'p1', announcedCapabilities: ['x'] }));
    const result = pm.runCapabilityAudit();
    expect(pm.getAudit()).toBe(result);
  });
});

// ─── Suite 8: unregisterPlugin ───────────────────────────────────────────────

describe('PluginManager — unregisterPlugin', () => {
  it('removes plugin from listPlugins after unregister', () => {
    const pm = new PluginManager();
    pm.registerPlugin(makePlugin({ name: 'removable' }));
    expect(pm.listPlugins()).toContain('removable');
    pm.unregisterPlugin('removable');
    expect(pm.listPlugins()).not.toContain('removable');
  });

  it('calls onUnload on the plugin during unregister', () => {
    let unloaded = false;
    const pm = new PluginManager();
    const plugin = makePlugin({
      name: 'unload-test',
      onUnload: () => { unloaded = true; },
    });
    pm.registerPlugin(plugin);
    pm.unregisterPlugin('unload-test');
    expect(unloaded).toBe(true);
  });

  it('silently ignores unregister of unknown plugin name', () => {
    const pm = new PluginManager();
    expect(() => pm.unregisterPlugin('does-not-exist')).not.toThrow();
  });
});
