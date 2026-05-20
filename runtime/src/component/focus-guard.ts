/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Saved state of a focused interactive element before a DOM reconciliation pass.
 * Used to restore focus after replaceChild or other operations that destroy DOM nodes.
 */
export interface FocusState {
  el: HTMLElement;
  selStart: number | null;
  selEnd: number | null;
  /** name attribute or id — used to find a replacement element after replaceChild */
  identity: string | null;
  tag: string;
  inputType: string | null;
  /** Parent element at save time — used as the scope for positional fallback */
  parentEl: HTMLElement | null;
  /** Position among focusable siblings (input/textarea/select) within parentEl */
  siblingIndex: number;
}

/**
 * Captures the current focus state before a reconciliation pass.
 * Returns null if no interactive element is focused or we're in SSR.
 */
export function saveFocusState(): FocusState | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;

  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return null;

  const input = el as HTMLInputElement;

  // Record position among focusable siblings as a fallback when identity is unavailable
  const parentEl = el.parentElement;
  let siblingIndex = -1;
  if (parentEl) {
    const focusable = Array.from(parentEl.querySelectorAll('input, textarea, select'));
    siblingIndex = focusable.indexOf(el);
  }

  return {
    el,
    selStart: input.selectionStart ?? null,
    selEnd: input.selectionEnd ?? null,
    identity: input.name || input.id || null,
    tag,
    inputType: input.type ?? null,
    parentEl,
    siblingIndex,
  };
}

/**
 * Restores focus after a reconciliation pass.
 *
 * Cases handled:
 * - Element still in DOM and still focused: no-op.
 * - Element still in DOM but lost focus (e.g. blur side-effect): re-focus + restore cursor.
 * - Element removed from DOM (replaceChild): find replacement by name/id, then fall back
 *   to positional match (siblingIndex within the original parent) for inputs that have
 *   neither name nor id.
 */
export function restoreFocusState(saved: FocusState | null): void {
  if (!saved) return;
  if (typeof document === 'undefined') return;

  // Already focused — nothing to do
  if (document.activeElement === saved.el) return;

  if (document.contains(saved.el)) {
    // Element survived the reconciliation — just lost focus somehow
    (saved.el as HTMLElement).focus();
    _restoreCursor(saved.el as HTMLInputElement, saved.selStart, saved.selEnd);
    return;
  }

  // Element was replaced — try to locate the replacement.

  // Primary: match by name/id attribute
  if (saved.identity) {
    const escapedId = _cssEscape(saved.identity);
    const candidate =
      (document.querySelector(`${saved.tag.toLowerCase()}[name="${escapedId}"]`) as HTMLInputElement | null) ||
      (document.getElementById(saved.identity) as HTMLInputElement | null);

    if (candidate && candidate.tagName === saved.tag) {
      _focusAndRestoreCursor(candidate, saved.selStart, saved.selEnd);
      return;
    }
  }

  // Fallback: match by position among focusable siblings in the same parent.
  // Handles inputs that have no name/id but whose parent element survived reconciliation.
  if (
    saved.parentEl !== null &&
    saved.siblingIndex >= 0 &&
    document.contains(saved.parentEl)
  ) {
    const focusable = Array.from(
      saved.parentEl.querySelectorAll('input, textarea, select'),
    ) as HTMLInputElement[];
    const candidate = focusable[saved.siblingIndex];
    if (candidate && candidate.tagName === saved.tag) {
      _focusAndRestoreCursor(candidate, saved.selStart, saved.selEnd);
    }
  }
}

function _focusAndRestoreCursor(
  el: HTMLInputElement,
  selStart: number | null,
  selEnd: number | null,
): void {
  el.focus();
  const valLen = el.value?.length ?? 0;
  const s = typeof selStart === 'number' ? Math.min(selStart, valLen) : valLen;
  const e = typeof selEnd === 'number' ? Math.min(selEnd, valLen) : valLen;
  _restoreCursor(el, s, e);
}

function _restoreCursor(
  el: HTMLInputElement,
  selStart: number | null,
  selEnd: number | null,
): void {
  if (typeof selStart !== 'number' || typeof selEnd !== 'number') return;
  try {
    el.setSelectionRange(selStart, selEnd);
  } catch {
    // Some input types (number, email, date) don't support setSelectionRange — ignore
  }
}

function _cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  // Fallback: escape double-quotes only
  return value.replace(/"/g, '\\"');
}
