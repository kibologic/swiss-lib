/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { Signal, batch, type SignalOptions } from './signals.js';

export { batch, batch as batchUpdates };

class BatchedSignal<T> extends Signal<T> {
  set value(newValue: T) {
    batch(() => {
      super.value = newValue;
    });
  }

  get value(): T {
    return super.value;
  }

  update(updater: (value: T) => T) {
    batch(() => {
      super.update(updater);
    });
  }
}

export function batchedSignal<T>(initialValue: T, options?: SignalOptions<T>): Signal<T> {
  return new BatchedSignal(initialValue, options);
}
