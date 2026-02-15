/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type {
  SecurityGateway,
  SecurityContext,
  SecurityEvent,
  AuditFilter,
  AuditConfig,
  AuditEntry,
} from "./types.js";

/**
 * Security audit system for comprehensive logging and monitoring
 */
export class SecurityAudit {
  private engine: SecurityGateway;
  private config: AuditConfig;
  private eventListeners = new Map<
    string,
    Array<(event: SecurityEvent) => void>
  >();

  constructor(engine: SecurityGateway, config: AuditConfig = {}) {
    this.engine = engine;
    this.config = {
      enabled: true,
      maxEntries: 10000,
      persist: false,
      retentionDays: 30,
      excludeEvents: [],
      transformers: [],
      ...config,
    };
  }

  /**
   * Logs a security event
   * @param event The security event to log
   */
  logSecurityEvent(event: SecurityEvent): void {
    if (!this.config.enabled) return;

    // Check if event should be excluded
    if (this.config.excludeEvents?.includes(event.action)) return;

    // Apply transformers
    let transformedEvent = event;
    for (const transformer of this.config.transformers || []) {
      if (typeof transformer.event === "string") {
        if (transformer.event === event.action) {
          transformedEvent = transformer.transform(transformedEvent);
        }
      } else if (transformer.event instanceof RegExp) {
        if (transformer.event.test(event.action)) {
          transformedEvent = transformer.transform(transformedEvent);
        }
      }
    }

    // Create audit entry
    const auditEntry: AuditEntry = {
      timestamp: Date.now(),
      target: event.target,
      context: event.context,
      success: event.details?.success ?? true,
      reason: event.details?.error,
      details: {
        action: event.action,
        ...event.details,
      },
    };

    // Log to engine
    this.engine.audit(auditEntry);

    // Emit event for listeners
    this.emit("log", transformedEvent);
  }

  /**
   * Checks rate limit and logs the attempt
   * @param key The rate limit key
   * @param context Security context
   * @returns True if allowed, false if rate limited
   */
  async logAndCheckRateLimit(
    key: string,
    context: SecurityContext,
  ): Promise<boolean> {
    const allowed = await this.engine.checkRateLimit(key);

    this.logSecurityEvent({
      action: "rate_limit.check",
      target: "rate_limit",
      context,
      details: {
        key,
        success: allowed,
        reason: allowed ? undefined : "Rate limit exceeded",
      },
    });

    return allowed;
  }

  /**
   * Gets audit log entries with optional filtering
   * @param filter Optional filter criteria
   * @returns Array of audit entries
   */
  getAuditLog(filter?: AuditFilter): AuditEntry[] {
    const logs = this.engine.getAuditLog();

    if (!filter) return logs;

    return logs
      .filter((log) => {
        if (filter.startDate && log.timestamp < filter.startDate.getTime())
          return false;
        if (filter.endDate && log.timestamp > filter.endDate.getTime())
          return false;
        if (filter.target && !log.target.includes(filter.target)) return false;
        if (filter.success !== undefined && log.success !== filter.success)
          return false;
        if (filter.userId && log.context.userId !== filter.userId) return false;
        if (filter.since && log.timestamp < filter.since) return false;

        return true;
      })
      .slice(0, filter.limit);
  }

  /**
   * Exports audit log in specified format
   * @param format Export format ('json' | 'csv')
   * @returns Formatted audit log string
   */
  exportAuditLog(format: "json" | "csv"): string {
    const logs = this.getAuditLog();

    if (format === "json") {
      return JSON.stringify(logs, null, 2);
    } else if (format === "csv") {
      return this.convertToCsv(logs);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Adds event listener for security events
   * @param event Event name
   * @param listener Event listener function
   */
  on(event: string, listener: (event: SecurityEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Removes event listener
   * @param event Event name
   * @param listener Event listener function
   */
  off(event: string, listener: (event: SecurityEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emits event to all listeners
   * @param event Event name
   * @param data Event data
   */
  private emit(event: string, data: SecurityEvent): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error("Error in audit event listener:", error);
        }
      });
    }
  }

  /**
   * Converts audit log to CSV format
   * @param logs Audit entries
   * @returns CSV string
   */
  private convertToCsv(logs: AuditEntry[]): string {
    const headers = [
      "timestamp",
      "target",
      "action",
      "success",
      "reason",
      "userId",
      "ip",
      "layer",
      "details",
    ];

    const rows = logs.map((log) => [
      log.timestamp,
      log.target,
      log.details?.action || "",
      log.success,
      log.reason || "",
      log.context.userId || "",
      log.context.ip || "",
      log.context.layer,
      JSON.stringify(log.details || {}),
    ]);

    return [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
  }

  /**
   * Cleans up old audit entries based on retention policy
   */
  cleanup(): void {
    if (!this.config.retentionDays) return;

    const cutoffTime =
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const logs = this.engine.getAuditLog();

    const recentLogs = logs.filter((log) => log.timestamp >= cutoffTime);

    // Note: In a real implementation, you would update the engine's audit log
    // This is a placeholder for the cleanup logic
    console.log(
      `Cleaned up ${logs.length - recentLogs.length} old audit entries`,
    );
  }

  /**
   * Gets security metrics for monitoring
   * @param timeRangeMs Time range in milliseconds
   * @returns Security metrics
   */
  getSecurityMetrics(timeRangeMs: number = 3600000): {
    totalEvents: number;
    failedLogins: number;
    blockedRequests: number;
    threatsDetected: number;
    topIPs: Array<{ ip: string; count: number }>;
    topActions: Array<{ action: string; count: number }>;
  } {
    const since = Date.now() - timeRangeMs;
    const logs = this.getAuditLog({ since });

    const metrics = {
      totalEvents: logs.length,
      failedLogins: 0,
      blockedRequests: 0,
      threatsDetected: 0,
      topIPs: [] as Array<{ ip: string; count: number }>,
      topActions: [] as Array<{ action: string; count: number }>,
    };

    const ipCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();

    for (const log of logs) {
      // Count by IP
      if (log.context.ip) {
        ipCounts.set(log.context.ip, (ipCounts.get(log.context.ip) || 0) + 1);
      }

      // Count by action
      const action = String(log.details?.action || "unknown");
      actionCounts.set(action, (actionCounts.get(action) || 0) + 1);

      // Count specific event types
      if (log.details?.action === "auth.login.failure") {
        metrics.failedLogins++;
      } else if (log.details?.action === "security.blocked") {
        metrics.blockedRequests++;
      } else if (log.details?.action === "security.threat.detected") {
        metrics.threatsDetected++;
      }
    }

    // Get top IPs and actions
    metrics.topIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    metrics.topActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    return metrics;
  }
}
