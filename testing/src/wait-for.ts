/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { SwissTestingError } from "./queries.js";
import { flushUpdates } from "./flush.js";

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

const DEFAULT_TIMEOUT = 1000;
const DEFAULT_INTERVAL = 20;

/**
 * Polls `callback` until it returns without throwing, flushing the real update
 * scheduler (see flush.ts) between attempts so reactive/async updates driven by
 * scheduleUpdate() have a chance to land before the next check.
 *
 * This is what findBy* is built on (see queries.ts) and is also exported directly
 * for asserting on state that updates asynchronously (e.g. after a fetch or a
 * timer inside the component).
 */
export async function waitFor<T>(
  callback: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start <= timeout) {
    await flushUpdates(1);
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, interval));
    }
  }

  if (lastError instanceof Error) {
    throw new SwissTestingError(`waitFor timed out after ${timeout}ms: ${lastError.message}`);
  }
  throw new SwissTestingError(`waitFor timed out after ${timeout}ms`);
}
