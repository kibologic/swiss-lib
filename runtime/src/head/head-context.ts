/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * HEAD-001: document-head management.
 *
 * Collects <title>/<meta>/<link>/<html>/<body>-attribute contributions made by
 * components during a render pass, so a server renderer can inject them into
 * the final HTML `<head>` (and useHead() can apply them directly to
 * `document.head` on the client).
 *
 * Race safety: a render's contributions live on a HeadContext instance, not on
 * module-global mutable fields. SSR call sites push a fresh HeadContext before
 * calling the (synchronous, recursive) `renderToString`, and pop it after --
 * exactly the push/pop-around-a-synchronous-call discipline
 * `renderer/storage.ts` uses for `currentComponentInstance`. Because
 * `renderToString` never awaits mid-render, no other request's render can
 * interleave between a push and its matching pop, so concurrent requests never
 * see each other's head contributions even though the stack is a module-level
 * variable.
 */

export interface HeadMeta {
  name?: string;
  property?: string;
  content: string;
}

export interface HeadLink {
  rel: string;
  href: string;
  [attr: string]: string | undefined;
}

export interface HeadConfig {
  title?: string;
  meta: HeadMeta[];
  link: HeadLink[];
  htmlAttrs: Record<string, string>;
  bodyAttrs: Record<string, string>;
}

export function createHeadConfig(): HeadConfig {
  return {
    title: undefined,
    meta: [],
    link: [],
    htmlAttrs: {},
    bodyAttrs: {},
  };
}

/**
 * One entry per active (nested) renderToString call. A stack rather than a
 * single slot because SSR-rendered layouts can, in principle, nest renders;
 * only the top of the stack is ever the "current" context.
 */
const contextStack: HeadConfig[] = [];

export function pushHeadContext(): HeadConfig {
  const ctx = createHeadConfig();
  contextStack.push(ctx);
  return ctx;
}

export function popHeadContext(): HeadConfig | undefined {
  return contextStack.pop();
}

export function currentHeadContext(): HeadConfig | undefined {
  return contextStack[contextStack.length - 1];
}

/** Input shape accepted by `useHead()` / merged into a `HeadConfig`. */
export interface HeadInput {
  title?: string;
  meta?: HeadMeta[];
  link?: HeadLink[];
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

function metaKey(meta: HeadMeta): string | undefined {
  if (meta.name !== undefined) return `name:${meta.name}`;
  if (meta.property !== undefined) return `property:${meta.property}`;
  return undefined;
}

function linkKey(link: HeadLink): string {
  return `${link.rel}:${link.href}`;
}

/**
 * Merges a HeadInput into a HeadConfig in place: title is last-writer-wins;
 * meta is de-duped/overridden by `name` or `property`; link is de-duped by
 * `rel`+`href`. Entries with no de-dup key (a meta with neither name nor
 * property) are always appended.
 */
export function applyHeadInput(ctx: HeadConfig, input: HeadInput): void {
  if (input.title !== undefined) {
    ctx.title = input.title;
  }

  for (const meta of input.meta ?? []) {
    const key = metaKey(meta);
    const existingIndex = key === undefined ? -1 : ctx.meta.findIndex((m) => metaKey(m) === key);
    if (existingIndex >= 0) {
      ctx.meta[existingIndex] = meta;
    } else {
      ctx.meta.push(meta);
    }
  }

  for (const link of input.link ?? []) {
    const key = linkKey(link);
    const existingIndex = ctx.link.findIndex((l) => linkKey(l) === key);
    if (existingIndex >= 0) {
      ctx.link[existingIndex] = link;
    } else {
      ctx.link.push(link);
    }
  }

  if (input.htmlAttrs) {
    Object.assign(ctx.htmlAttrs, input.htmlAttrs);
  }

  if (input.bodyAttrs) {
    Object.assign(ctx.bodyAttrs, input.bodyAttrs);
  }
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

function attrsString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => `${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join(" ");
}

/** Renders the collected title/meta/link tags as an HTML fragment (no surrounding <head>). */
export function renderHeadToString(ctx: HeadConfig): string {
  const parts: string[] = [];

  if (ctx.title !== undefined) {
    parts.push(`<title>${escapeHtml(ctx.title)}</title>`);
  }

  for (const meta of ctx.meta) {
    const attrs: Record<string, string> = {};
    if (meta.name !== undefined) attrs.name = meta.name;
    if (meta.property !== undefined) attrs.property = meta.property;
    attrs.content = meta.content;
    parts.push(`<meta ${attrsString(attrs)} />`);
  }

  for (const link of ctx.link) {
    const { rel, href, ...rest } = link;
    const attrs: Record<string, string> = { rel, href };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) attrs[k] = v;
    }
    parts.push(`<link ${attrsString(attrs)} />`);
  }

  return parts.join("\n    ");
}

/** Serializes htmlAttrs as a string suitable for splicing into `<html ${...}>`. */
export function htmlAttrsString(ctx: HeadConfig): string {
  return attrsString(ctx.htmlAttrs);
}

/** Serializes bodyAttrs as a string suitable for splicing into `<body ${...}>`. */
export function bodyAttrsString(ctx: HeadConfig): string {
  return attrsString(ctx.bodyAttrs);
}
