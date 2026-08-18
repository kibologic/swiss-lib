/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * SwissJS Forms Module Barrel
 * Headless, reactive form state + validation, built entirely on
 * runtime/src/reactivity (Signal / computed). No DOM or renderer coupling.
 */

export { createForm } from "./form.js";
export type { FieldConfig, FormConfig, FormApi } from "./form.js";

export {
  required,
  minLength,
  maxLength,
  pattern,
  email,
  min,
  max,
} from "./validators.js";
export type { FieldValidator } from "./validators.js";
