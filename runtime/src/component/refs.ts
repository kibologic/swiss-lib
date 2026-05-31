/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * A mutable container that holds a direct reference to a DOM node or component
 * instance. Attach it via the `ref` prop on any element vnode.
 *
 * Example:
 *   const inputRef = ref<HTMLInputElement>();
 *   // In render: <input ref={inputRef} />
 *   // After mount: inputRef.current is the HTMLInputElement
 */
export interface Ref<T> {
  current: T | null;
}

/**
 * Create a ref container. The `current` property is set by the renderer when
 * the element is created and cleared when it is removed.
 */
export function ref<T = HTMLElement>(initialValue: T | null = null): Ref<T> {
  let _current = initialValue;
  return {
    get current(): T | null {
      return _current;
    },
    set current(v: T | null) {
      _current = v;
    },
  };
}
