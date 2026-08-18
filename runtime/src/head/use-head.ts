/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import {
  applyHeadInput,
  createHeadConfig,
  currentHeadContext,
  popHeadContext,
  pushHeadContext,
  type HeadConfig,
  type HeadInput,
  type HeadLink,
  type HeadMeta,
} from "./head-context.js";

export type { HeadConfig, HeadInput, HeadLink, HeadMeta } from "./head-context.js";

/**
 * Records document-head contributions (title/meta/link/html attrs/body
 * attrs).
 *
 * - During SSR (there's an active HeadContext, pushed by the server renderer
 *   around its `renderToString` call): merges into that context. Components
 *   call this synchronously from `render()`, which executes within the same
 *   call stack as the active `renderToString`, so it always sees the right
 *   render's context.
 * - On the client with no active HeadContext: applies directly to
 *   `document.head` / `document.documentElement` / `document.body`.
 * - Neither (e.g. a plain unit test with no DOM and no context): no-op.
 */
export function useHead(input: HeadInput): void {
  const ctx = currentHeadContext();
  if (ctx) {
    applyHeadInput(ctx, input);
    return;
  }

  if (typeof document !== "undefined") {
    applyHeadInputToDocument(input);
  }
}

export function setTitle(title: string): void {
  useHead({ title });
}

export function addMeta(meta: HeadMeta): void {
  useHead({ meta: [meta] });
}

export function addLink(link: HeadLink): void {
  useHead({ link: [link] });
}

/**
 * Test helper: runs `fn` with a fresh HeadContext active and returns whatever
 * it collected. Mirrors the push/pop discipline the server renderer uses
 * around `renderToString`.
 */
export function collectHead(fn: () => void): HeadConfig {
  pushHeadContext();
  try {
    fn();
    return currentHeadContext() ?? createHeadConfig();
  } finally {
    popHeadContext();
  }
}

function applyHeadInputToDocument(input: HeadInput): void {
  if (input.title !== undefined) {
    document.title = input.title;
  }

  for (const meta of input.meta ?? []) {
    const selector = meta.name !== undefined
      ? `meta[name="${cssEscape(meta.name)}"]`
      : meta.property !== undefined
      ? `meta[property="${cssEscape(meta.property)}"]`
      : undefined;

    const existing = selector ? document.head.querySelector<HTMLMetaElement>(selector) : null;
    const el = existing ?? document.createElement("meta");
    if (meta.name !== undefined) el.setAttribute("name", meta.name);
    if (meta.property !== undefined) el.setAttribute("property", meta.property);
    el.setAttribute("content", meta.content);
    if (!existing) document.head.appendChild(el);
  }

  for (const link of input.link ?? []) {
    const selector = `link[rel="${cssEscape(link.rel)}"][href="${cssEscape(link.href)}"]`;
    const existing = document.head.querySelector<HTMLLinkElement>(selector);
    const el = existing ?? document.createElement("link");
    for (const [key, value] of Object.entries(link)) {
      if (value !== undefined) el.setAttribute(key, value);
    }
    if (!existing) document.head.appendChild(el);
  }

  if (input.htmlAttrs) {
    for (const [key, value] of Object.entries(input.htmlAttrs)) {
      document.documentElement.setAttribute(key, value);
    }
  }

  if (input.bodyAttrs && document.body) {
    for (const [key, value] of Object.entries(input.bodyAttrs)) {
      document.body.setAttribute(key, value);
    }
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
