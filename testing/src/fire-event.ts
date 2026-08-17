/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { flushUpdates } from "./flush.js";

/**
 * Dispatches a REAL DOM event on `element` (jsdom's native event dispatch — no
 * synthetic event system of our own) and then drains the SwissJS update scheduler
 * so any scheduleUpdate() triggered by the component's event handler (see
 * runtime/src/component/event-system.ts, which binds handlers directly as DOM
 * listeners) has committed before fireEvent resolves.
 *
 * This is intentionally a thin wrapper, not a synthetic event system: SwissJS
 * event binding (bindEventHandlers in component-lifecycle.ts) attaches real
 * `addEventListener` handlers, so real events are what actually exercises that
 * path.
 */
export async function fireEvent(
  element: Element | Document | Window,
  event: Event,
): Promise<boolean> {
  const result = element.dispatchEvent(event);
  await flushUpdates();
  return result;
}

export interface EventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  [key: string]: unknown;
}

function makeMouseEvent(type: string, init?: EventInit): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

function makeEvent(type: string, init?: EventInit): Event {
  return new Event(type, { bubbles: true, cancelable: true, ...init });
}

function makeKeyboardEvent(type: string, init?: EventInit): KeyboardEvent {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
}

fireEvent.click = (element: Element, init?: EventInit) => fireEvent(element, makeMouseEvent("click", init));
fireEvent.dblClick = (element: Element, init?: EventInit) => fireEvent(element, makeMouseEvent("dblclick", init));
fireEvent.mouseDown = (element: Element, init?: EventInit) => fireEvent(element, makeMouseEvent("mousedown", init));
fireEvent.mouseUp = (element: Element, init?: EventInit) => fireEvent(element, makeMouseEvent("mouseup", init));
fireEvent.mouseOver = (element: Element, init?: EventInit) => fireEvent(element, makeMouseEvent("mouseover", init));
fireEvent.focus = (element: Element, init?: EventInit) => fireEvent(element, makeEvent("focus", { bubbles: false, ...init }));
fireEvent.blur = (element: Element, init?: EventInit) => fireEvent(element, makeEvent("blur", { bubbles: false, ...init }));
fireEvent.keyDown = (element: Element, init?: EventInit) => fireEvent(element, makeKeyboardEvent("keydown", init));
fireEvent.keyUp = (element: Element, init?: EventInit) => fireEvent(element, makeKeyboardEvent("keyup", init));
fireEvent.input = (element: Element, init?: EventInit) => fireEvent(element, makeEvent("input", init));
fireEvent.change = (element: Element, init?: EventInit) => fireEvent(element, makeEvent("change", init));
fireEvent.submit = (element: Element, init?: EventInit) => fireEvent(element, makeEvent("submit", init));

/**
 * Minimal user-event-shaped helpers layered on fireEvent. Each step dispatches
 * real DOM events (and, for typing, sets `.value` the way a browser would before
 * firing `input`) and flushes the scheduler between them.
 */
export const userEvent = {
  async click(element: Element): Promise<void> {
    await fireEvent.mouseDown(element);
    await fireEvent.mouseUp(element);
    await fireEvent.click(element);
  },
  async type(element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
    for (const char of text) {
      element.value += char;
      await fireEvent.input(element);
    }
  },
  async clear(element: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    element.value = "";
    await fireEvent.input(element);
  },
};
