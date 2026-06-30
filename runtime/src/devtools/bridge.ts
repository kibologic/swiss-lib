/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
 * SwissJS Devtools Bridge (dev-only)
 *
 * Provides a lightweight interface for the runtime to emit component lifecycle
 * and capability events to devtools. The bridge is disabled by default and can
 * be enabled via the SWISS_DEVTOOLS=1 env flag or globalThis.SWISS_DEVTOOLS = true.
 */

export type ComponentId = string;
export type CapabilityName = string;

export interface ComponentNodePayload {
  id: ComponentId;
  name: string;
  parentId: ComponentId | null;
  provides: CapabilityName[];
  consumes: CapabilityName[];
}

/** Opt-in telemetry flag separate from devtools enablement */
export function isTelemetryEnabled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = (typeof globalThis !== 'undefined') ? (globalThis as any) : {};
    if (typeof process !== 'undefined' && process?.env?.SWISS_TELEMETRY) {
      return process.env.SWISS_TELEMETRY === '1' || process.env.SWISS_TELEMETRY === 'true';
    }
    if (typeof g.SWISS_TELEMETRY !== 'undefined') return !!g.SWISS_TELEMETRY;
  } catch {
    // ignore
  }
  return false;
}

export interface ComponentUpdatePayload {
  id: ComponentId;
  stateSummary?: Record<string, unknown>;
  capabilityUsageDeltas?: Record<CapabilityName, number>;
}

export interface GraphSnapshot {
  nodes: ComponentNodePayload[];
  edges: Array<{ from: ComponentId; to: ComponentId; type: 'provides' | 'consumes' | 'parent' }>; 
  createdAt: number; // epoch ms
}

export interface DevtoolsBridge {
  onComponentMount(payload: ComponentNodePayload): void;
  onComponentUpdate(payload: ComponentUpdatePayload): void;
  onComponentUnmount(id: ComponentId): void;
  getGraphSnapshot(): GraphSnapshot;
  /** Get the last stored shallow state snapshot for a component. */
  getStateSnapshot(id: ComponentId): Record<string, unknown> | undefined;
  /**
   * Request an on-demand state snapshot. If a live restore callback is registered
   * (via setRestoreCallback) it is called to retrieve current state; otherwise falls
   * back to the last stored snapshot.
   */
  requestStateSnapshot(id: ComponentId): Record<string, unknown>;
  /** Look up component IDs by display name. O(1) via name index. */
  getComponentsByName(name: string): ComponentId[];
  /** Record an arbitrary runtime event for devtools */
  recordEvent(event: { t: number; type: string; msg: string }): void;
  /** Drain and return buffered events (FIFO, destructive) */
  drainEvents(): Array<{ t: number; type: string; msg: string }>;
  /**
   * Non-destructive paged access to the event buffer.
   * `offset` is the number of events to skip (0 = most recent first).
   * `limit` is the maximum number of events to return.
   */
  drainEventsPaged(offset: number, limit: number): { events: Array<{ t: number; type: string; msg: string }>; total: number };
  /** Optional typed event channel for structured telemetry (non-breaking) */
  recordEventTyped?(event: DevtoolsEvent): void;
  /** Optional drain for typed events */
  drainEventsTyped?(): DevtoolsEvent[];
  /** Attempt to restore a shallow component state (dev-only). Returns true if accepted. */
  restoreState(id: ComponentId, state: Record<string, unknown>): boolean;
  reset(): void;
}

class NoopBridge implements DevtoolsBridge {
  onComponentMount(_payload: ComponentNodePayload): void { /* noop */ }
  onComponentUpdate(_payload: ComponentUpdatePayload): void { /* noop */ }
  onComponentUnmount(_id: ComponentId): void { /* noop */ }
  getGraphSnapshot(): GraphSnapshot { return { nodes: [], edges: [], createdAt: Date.now() }; }
  getStateSnapshot(_id: ComponentId): Record<string, unknown> | undefined { return undefined; }
  requestStateSnapshot(_id: ComponentId): Record<string, unknown> { return {}; }
  getComponentsByName(_name: string): ComponentId[] { return []; }
  recordEvent(_event: { t: number; type: string; msg: string }): void { /* noop */ }
  drainEvents(): Array<{ t: number; type: string; msg: string }> { return []; }
  drainEventsPaged(_offset: number, _limit: number): { events: Array<{ t: number; type: string; msg: string }>; total: number } { return { events: [], total: 0 }; }
  restoreState(_id: ComponentId, _state: Record<string, unknown>): boolean { return false; }
  reset(): void {}
}

let bridgeSingleton: DevtoolsBridge | null = null;

export function isDevtoolsEnabled(): boolean {
  try {
    // Prefer explicit env var in Node; also allow a global flag for non-Node runtimes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = (typeof globalThis !== 'undefined') ? (globalThis as any) : {};
    if (typeof process !== 'undefined' && process?.env?.SWISS_DEVTOOLS) {
      return process.env.SWISS_DEVTOOLS === '1' || process.env.SWISS_DEVTOOLS === 'true';
    }
    if (typeof g.SWISS_DEVTOOLS !== 'undefined') {
      return !!g.SWISS_DEVTOOLS;
    }
  } catch {
    // ignore
  }
  return false;
}

export function getDevtoolsBridge(): DevtoolsBridge {
  if (!isDevtoolsEnabled()) {
    return noopBridge;
  }
  return bridgeSingleton ?? noopBridge;
}

export function setDevtoolsBridge(impl: DevtoolsBridge): void {
  if (!isDevtoolsEnabled()) return; // do not set if disabled
  bridgeSingleton = impl;
}

const noopBridge = new NoopBridge();

/**
 * Fixed-capacity FIFO ring buffer. Overwrites the oldest entry when full.
 * O(1) push — no allocation-heavy splice() on every write.
 */
class RingBuffer<T> {
  private buf: Array<T | undefined>;
  private head = 0;
  private size = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  drain(): T[] {
    if (this.size === 0) return [];
    const out: T[] = new Array(this.size);
    const start = this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      out[i] = this.buf[(start + i) % this.capacity] as T;
    }
    this.head = 0;
    this.size = 0;
    return out;
  }

  peekAll(): T[] {
    if (this.size === 0) return [];
    const out: T[] = new Array(this.size);
    const start = this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      out[i] = this.buf[(start + i) % this.capacity] as T;
    }
    return out;
  }

  get length(): number { return this.size; }

  reset(): void {
    this.head = 0;
    this.size = 0;
  }
}

const RING_CAPS: Record<DevtoolsEventCategory | 'legacy', number> = {
  perf: 500,
  error: 200,
  capability: 200,
  runtime: 300,
  legacy: 1000,
};

export class InMemoryBridge implements DevtoolsBridge {
  private nodes = new Map<ComponentId, ComponentNodePayload>();
  private edges: Array<{ from: ComponentId; to: ComponentId; type: 'provides' | 'consumes' | 'parent' }> = [];
  private state = new Map<ComponentId, Record<string, unknown>>();
  private legacyBuf = new RingBuffer<{ t: number; type: string; msg: string }>(RING_CAPS.legacy);
  private typedBufs: Record<DevtoolsEventCategory, RingBuffer<DevtoolsEvent>> = {
    perf: new RingBuffer(RING_CAPS.perf),
    error: new RingBuffer(RING_CAPS.error),
    capability: new RingBuffer(RING_CAPS.capability),
    runtime: new RingBuffer(RING_CAPS.runtime),
  };
  private nameIndex = new Map<string, Set<ComponentId>>();
  private restoreCallback: ((id: ComponentId) => Record<string, unknown> | undefined) | null = null;

  setRestoreCallback(fn: (id: ComponentId) => Record<string, unknown> | undefined): void {
    this.restoreCallback = fn;
  }

  onComponentMount(payload: ComponentNodePayload): void {
    this.nodes.set(payload.id, payload);
    if (payload.parentId) {
      this.edges.push({ from: payload.parentId, to: payload.id, type: 'parent' });
    }
    for (const cap of payload.provides) {
      this.edges.push({ from: payload.id, to: payload.id + ':' + cap, type: 'provides' });
    }
    for (const cap of payload.consumes) {
      this.edges.push({ from: payload.id, to: payload.id + ':' + cap, type: 'consumes' });
    }
    const names = this.nameIndex.get(payload.name) ?? new Set();
    names.add(payload.id);
    this.nameIndex.set(payload.name, names);
  }

  onComponentUpdate(payload: ComponentUpdatePayload): void {
    if (payload.stateSummary) {
      this.state.set(payload.id, payload.stateSummary);
    }
    this.legacyBuf.push({ t: Date.now(), type: 'update', msg: payload.id });
  }

  onComponentUnmount(id: ComponentId): void {
    const node = this.nodes.get(id);
    if (node) {
      const names = this.nameIndex.get(node.name);
      if (names) {
        names.delete(id);
        if (names.size === 0) this.nameIndex.delete(node.name);
      }
    }
    this.nodes.delete(id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    this.state.delete(id);
    this.legacyBuf.push({ t: Date.now(), type: 'unmount', msg: id });
  }

  getGraphSnapshot(): GraphSnapshot {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
      createdAt: Date.now(),
    };
  }

  getStateSnapshot(id: ComponentId): Record<string, unknown> | undefined {
    return this.state.get(id);
  }

  requestStateSnapshot(id: ComponentId): Record<string, unknown> {
    if (this.restoreCallback) {
      const live = this.restoreCallback(id);
      if (live !== undefined) return live;
    }
    return this.state.get(id) ?? {};
  }

  getComponentsByName(name: string): ComponentId[] {
    return Array.from(this.nameIndex.get(name) ?? []);
  }

  recordEvent(event: { t: number; type: string; msg: string }): void {
    this.legacyBuf.push(event);
  }

  drainEvents(): Array<{ t: number; type: string; msg: string }> {
    return this.legacyBuf.drain();
  }

  drainEventsPaged(offset: number, limit: number): { events: Array<{ t: number; type: string; msg: string }>; total: number } {
    const all = this.legacyBuf.peekAll().reverse();
    return { events: all.slice(offset, offset + limit), total: all.length };
  }

  recordEventTyped(event: DevtoolsEvent): void {
    this.typedBufs[event.category].push(event);
  }

  drainEventsTyped(): DevtoolsEvent[] {
    const out: DevtoolsEvent[] = [];
    for (const buf of Object.values(this.typedBufs)) {
      out.push(...buf.drain());
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  restoreState(id: ComponentId, state: Record<string, unknown>): boolean {
    this.state.set(id, state);
    this.legacyBuf.push({ t: Date.now(), type: 'restore', msg: id });
    return true;
  }

  reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.state.clear();
    this.legacyBuf.reset();
    for (const buf of Object.values(this.typedBufs)) buf.reset();
    this.nameIndex.clear();
    this.restoreCallback = null;
  }
}

// Structured devtools event model (optional)
export type DevtoolsEventCategory = 'perf' | 'error' | 'capability' | 'runtime';
export interface DevtoolsEvent {
  t: number; // epoch ms
  category: DevtoolsEventCategory;
  name: string; // e.g., 'render', 'commit', 'boundary-error'
  componentId?: string;
  data?: Record<string, unknown>;
}
