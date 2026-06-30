/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { getDevtoolsBridge, type GraphSnapshot, type ComponentNodePayload } from '@swissjs/core/browser';

export interface ComponentNode extends ComponentNodePayload {
  children?: ComponentNode[];
}

export type RuntimeEvent = {
  t: number;
  type: string;
  msg: string;
};

export interface SnapshotEntry {
  id: string;
  t: number;
  state: Record<string, unknown>;
}

/**
 * Minimal data access layer for the Runtime Inspector.
 * Bridges to core devtools bridge where available; otherwise returns safe defaults.
 */
export class DataService {
  getSnapshot(): GraphSnapshot {
    try {
      return getDevtoolsBridge().getGraphSnapshot();
    } catch {
      return { nodes: [], edges: [], createdAt: Date.now() };
    }
  }

  /**
   * Convert flat nodes to hierarchical tree based on parentId.
   */
  toHierarchy(nodes: ComponentNodePayload[]): ComponentNode[] {
    const map = new Map<string, ComponentNode & { children: ComponentNode[] }>();
    const roots: ComponentNode[] = [];

    nodes.forEach(n => map.set(n.id, { ...n, children: [] }));

    nodes.forEach(n => {
      const current = map.get(n.id)!;
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children!.push(current);
      } else {
        roots.push(current);
      }
    });

    return roots;
  }

  /**
   * Request a fresh state snapshot via the bridge's live-state channel.
   * Falls back to the last stored snapshot when no live callback is registered.
   */
  getShallowState(id: string): Record<string, unknown> {
    try {
      return getDevtoolsBridge().requestStateSnapshot(id);
    } catch {
      return {};
    }
  }

  /**
   * Non-destructive paged access to the event buffer. Returns newest events first.
   */
  drainEventsPaged(offset: number, limit: number): { events: RuntimeEvent[]; total: number } {
    try {
      const result = getDevtoolsBridge().drainEventsPaged(offset, limit);
      return { events: result.events as RuntimeEvent[], total: result.total };
    } catch {
      return { events: [], total: 0 };
    }
  }

  drainEvents(): RuntimeEvent[] {
    try {
      return getDevtoolsBridge().drainEvents() as RuntimeEvent[];
    } catch {
      return [];
    }
  }

  /**
   * Find component IDs by display name. O(1) via bridge name index.
   */
  getComponentsByName(name: string): string[] {
    try {
      return getDevtoolsBridge().getComponentsByName(name);
    } catch {
      return [];
    }
  }

  takeSnapshot(id: string): SnapshotEntry | null {
    const state = this.getShallowState(id);
    return { id, t: Date.now(), state };
  }

  restoreSnapshot(id: string, state: Record<string, unknown>): boolean {
    try {
      return getDevtoolsBridge().restoreState(id, state);
    } catch {
      return false;
    }
  }
}
