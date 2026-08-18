/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { eventListeners, originalHandlers } from "./storage.js";
import { isEventProp } from "./types.js";
import { logger } from "../utils/logger.js";

export function reconcileProps(
  element: HTMLElement,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
) {
  const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

  allKeys.forEach((key) => {
    if (key === "children" || key === "key" || key === "transition") return;

    const oldValue = oldProps[key];
    const newValue = newProps[key];

    if (oldValue === newValue) return;

    try {
      if (key.startsWith("on")) {
        updateEventListener(element, key, oldValue, newValue);
      } else if (key === "className" || key === "class") {
        updateClassName(element, newValue);
      } else if (key === "style") {
        updateStyle(element, key, oldValue, newValue);
      } else if (key in element && !isEventProp(key)) {
        updateProperty(element, key, oldValue, newValue);
      } else {
        updateAttribute(element, key, newValue);
      }
    } catch (error) {
      logger.warn(`Property update error for "${key}":`, error);
    }
  });
}

export function updateEventListener(
  element: HTMLElement,
  key: string,
  oldHandler: unknown,
  newHandler: unknown,
) {
  const eventName = key.substring(2).toLowerCase();
  let listenerMap = eventListeners.get(element);
  let originalHandlerMap = originalHandlers.get(element);

  if (!listenerMap) {
    listenerMap = new Map();
    eventListeners.set(element, listenerMap);
  }
  if (!originalHandlerMap) {
    originalHandlerMap = new Map();
    originalHandlers.set(element, originalHandlerMap);
  }

  const existingWrappedListener = listenerMap.get(eventName);
  const existingOriginalHandler = originalHandlerMap.get(eventName);

  // Compare original handlers, not wrapped listeners
  // This allows us to detect when the handler function reference hasn't changed
  // even though arrow functions create new instances on each render
  if (typeof newHandler === "function") {
    // Check if the original handler is the same reference
    if (existingOriginalHandler === newHandler) {
      // Same handler reference, no update needed
      return;
    }

    // Handler has changed, remove old one if it exists
    if (existingWrappedListener) {
      element.removeEventListener(eventName, existingWrappedListener);
    }

    // Wrap handler to ensure it's called even if element is recreated
    const wrappedListener = (e: Event) => {
      try {
        (newHandler as EventListener)(e);
      } catch (error) {
        logger.error(`Event handler error for ${eventName}:`, error);
      }
    };

    if (eventName === "click") {
      const className = element.className || element.getAttribute("class") || "no-class";
      logger.events(`Attached click to ${element.tagName} ${String(className).substring(0, 50)}`);
    }

    element.addEventListener(eventName, wrappedListener);
    listenerMap.set(eventName, wrappedListener);
    originalHandlerMap.set(eventName, newHandler as EventListener);
  } else {
    // Remove listener if newHandler is null/undefined
    if (existingWrappedListener) {
      if (eventName === "click") {
        logger.events(`Removing click from ${element.tagName}`);
      }
      element.removeEventListener(eventName, existingWrappedListener);
      listenerMap.delete(eventName);
      originalHandlerMap.delete(eventName);
    }
  }
}

export function updateClassName(element: HTMLElement, value: unknown) {
  if (Array.isArray(value)) {
    element.className = value.filter(Boolean).join(" ");
  } else if (typeof value === "object" && value !== null) {
    element.className = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key])
      .join(" ");
  } else {
    element.className = (value as string) || "";
  }
}

export function updateStyle(
  element: HTMLElement,
  name: string,
  oldValue: unknown,
  newValue: unknown,
) {
  // Clear old styles
  if (oldValue && typeof oldValue === "object") {
    Object.keys(oldValue).forEach((prop) => {
      if (
        !newValue ||
        (newValue as Record<string, unknown>)[prop] === undefined
      ) {
        (element.style as unknown as Record<string, string>)[prop] = "";
      }
    });
  } else if (typeof oldValue === "string" && oldValue) {
    // FABLE-RENDER-001 D1: a string-valued old style must be cleared before anything new
    // is applied below. Previously this branch didn't exist, so string->absent (nothing
    // below touches the element either) and string->object (Object.assign only ever ADDS
    // properties, never removes leftover cssText) both left a reused DOM node's previous
    // vnode's inline style on indefinitely. Every other prop handler in this file clears
    // on the absent case (updateAttribute removes on nullish, updateClassName assigns "");
    // style uniquely didn't, because both its clearing branches were guarded on
    // `typeof === "object"`, which a string old value with a non-object new value never
    // satisfies. See __tests__/stale-inline-style-leak-repro.test.ts.
    element.style.cssText = "";
  }

  // Apply new styles
  if (newValue && typeof newValue === "object") {
    Object.assign(element.style, newValue);
  } else if (typeof newValue === "string") {
    element.style.cssText = newValue;
  }
}

export function updateProperty(
  element: HTMLElement,
  name: string,
  oldValue: unknown,
  newValue: unknown,
) {
  if (oldValue !== newValue) {
    (element as unknown as Record<string, unknown>)[name] =
      newValue === null ? "" : newValue;
  }
}

export function updateAttribute(
  element: HTMLElement,
  key: string,
  value: unknown,
) {
  if (value == null || value === false) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, value === true ? "" : String(value));
  }
}
