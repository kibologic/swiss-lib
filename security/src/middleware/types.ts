/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Minimal structural interfaces for HTTP middleware — framework-agnostic,
 * compatible with Express/Connect/Fastify adapters.
 *
 * @internal
 */

export interface MiddlewareRequest {
  ip?: string;
  id?: string;
  path?: string;
  url?: string;
  method?: string;
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  get?: (name: string) => string | undefined;
}

export interface MiddlewareResponseChain {
  json(body: unknown): void;
}

export interface MiddlewareResponse {
  set(header: string, value: string | number): this;
  set(headers: Record<string, string | number>): this;
  status(code: number): MiddlewareResponseChain;
}

export type NextFunction = (error?: unknown) => void;

export type MiddlewareFn = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: NextFunction,
) => void | Promise<void>;
