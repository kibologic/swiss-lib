/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * A field validator: given the current field value, returns an error message
 * string when invalid, or `undefined` when valid.
 *
 * Validators are plain functions so they compose trivially into an array per
 * field (`validators: [required(), email()]`) — no framework machinery beyond
 * that is needed.
 */
export type FieldValidator<T = unknown> = (value: T) => string | undefined;

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/** Value must be present (not undefined/null/empty string/empty array). */
export function required(message = "This field is required"): FieldValidator {
  return (value) => (isEmpty(value) ? message : undefined);
}

/** String length must be >= min. Skips empty values (pair with required()). */
export function minLength(min: number, message?: string): FieldValidator<string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return String(value).length < min
      ? message ?? `Must be at least ${min} characters`
      : undefined;
  };
}

/** String length must be <= max. Skips empty values. */
export function maxLength(max: number, message?: string): FieldValidator<string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return String(value).length > max
      ? message ?? `Must be at most ${max} characters`
      : undefined;
  };
}

/** Value must match the given regular expression. Skips empty values. */
export function pattern(regex: RegExp, message = "Invalid format"): FieldValidator<string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return regex.test(String(value)) ? undefined : message;
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Value must look like an email address. Skips empty values. */
export function email(message = "Invalid email address"): FieldValidator<string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return EMAIL_RE.test(String(value)) ? undefined : message;
  };
}

/** Numeric value must be >= min. Skips empty values. */
export function min(minValue: number, message?: string): FieldValidator<number | string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return Number(value) < minValue ? message ?? `Must be at least ${minValue}` : undefined;
  };
}

/** Numeric value must be <= max. Skips empty values. */
export function max(maxValue: number, message?: string): FieldValidator<number | string | undefined> {
  return (value) => {
    if (isEmpty(value)) return undefined;
    return Number(value) > maxValue ? message ?? `Must be at most ${maxValue}` : undefined;
  };
}
