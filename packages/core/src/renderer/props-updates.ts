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
    if (key === "children" || key === "key") return;

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
      if (typeof window !== "undefined" && eventName === "click") {
        console.log(`[Swiss] click handler fired`, element.tagName, element.className || "");
      }
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
    // CRITICAL: For input/textarea elements, preserve focus when updating value
    // Check if element has focus before updating
    const isFocused = document.activeElement === element;
    const selectionStart = (element as HTMLInputElement).selectionStart;
    const selectionEnd = (element as HTMLInputElement).selectionEnd;

    (element as unknown as Record<string, unknown>)[name] =
      newValue === null ? "" : newValue;

    // Restore focus and cursor position if element had focus
    if (isFocused && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
      (element as HTMLInputElement).focus();
      // Restore cursor position if it's a valid input
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        try {
          (element as HTMLInputElement).setSelectionRange(selectionStart, selectionEnd);
        } catch (e) {
          // Some input types don't support setSelectionRange, ignore
        }
      }
    }
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
