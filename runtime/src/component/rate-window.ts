/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Sliding-window rate limiter used by UpdateManager's loop guards.
 *
 * Keeps the timestamps of the events admitted during the last `windowMs`. An event is
 * refused only when `max` events were already admitted within that window, so a component
 * that commits steadily at a sustainable rate (e.g. once per 900 ms, forever) never trips,
 * and a tripped guard recovers as soon as the rate drops (old events slide out of the
 * window). Refused events are not recorded, so a refusal never extends the throttle.
 */
export class SlidingRateWindow {
  private readonly stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number = 1000,
  ) {}

  private prune(now: number): void {
    let drop = 0;
    while (drop < this.stamps.length && now - this.stamps[drop] >= this.windowMs) drop++;
    if (drop > 0) this.stamps.splice(0, drop);
  }

  /** Admits an event at `now` and returns true, or returns false when the budget is spent. */
  public tryAcquire(now: number): boolean {
    this.prune(now);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }

  /** Events admitted within the current window. */
  public count(now: number): number {
    this.prune(now);
    return this.stamps.length;
  }

  /** Milliseconds until the next event would be admitted (0 when it would be admitted now). */
  public retryAfter(now: number): number {
    this.prune(now);
    if (this.stamps.length < this.max) return 0;
    return Math.max(0, this.stamps[0] + this.windowMs - now);
  }

  public reset(): void {
    this.stamps.length = 0;
  }
}
