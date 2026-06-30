/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export {
  signal,
  Signal,
  ComputedSignal,
  computed,
  batch,
  startBatch,
  endBatch,
  bindToElement,
  serializeSignalState,
  deserializeSignalState,
} from './signals.js';

export { Effect, effect, onCleanup, trackEffect } from './effect.js';

export { batch as batchUpdates, batchedSignal } from './batch.js';

export * from './store.js';

export * from './integration.js';

export { reactive, watch, watchAll } from './reactive.js';
export { computed as computedLegacy, effect as reactiveEffect } from './reactive.js';

export * from './types/index.js';
