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
  return {
    el,
    selStart: input.selectionStart ?? null,
    selEnd: input.selectionEnd ?? null,
    identity: input.name || input.id || null,
    tag,
    inputType: input.type ?? null,
  };
}

/**
 * Restores focus after a reconciliation pass.
 *
 * Cases handled:
 * - Element still in DOM and still focused: no-op.
 * - Element still in DOM but lost focus (e.g. blur side-effect): re-focus + restore cursor.
 * - Element removed from DOM (replaceChild): find replacement by name/id, re-focus + restore cursor.
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

  // Element was replaced — try to locate the replacement
  if (!saved.identity) return;

  const escapedId = _cssEscape(saved.identity);
  const candidate =
    (document.querySelector(`${saved.tag.toLowerCase()}[name="${escapedId}"]`) as HTMLInputElement | null) ||
    (document.getElementById(saved.identity) as HTMLInputElement | null);

  if (!candidate || candidate.tagName !== saved.tag) return;

  candidate.focus();
  const valLen = candidate.value?.length ?? 0;
  const s = typeof saved.selStart === 'number' ? Math.min(saved.selStart, valLen) : valLen;
  const e = typeof saved.selEnd === 'number' ? Math.min(saved.selEnd, valLen) : valLen;
  _restoreCursor(candidate, s, e);
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
