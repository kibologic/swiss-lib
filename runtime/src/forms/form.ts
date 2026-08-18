/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Article 18: built entirely on SwissJS's own reactivity primitives
// (Signal / computed / effect from runtime/src/reactivity) — no bridging
// machinery, no cloned React Hook Form / Formik internals.
import { signal, computed, type Signal } from "../reactivity/index.js";
import type { FieldValidator } from "./validators.js";

/** Per-field configuration for `createForm`. */
export interface FieldConfig<T = unknown> {
  /** Initial value for the field, and the value `reset()` restores. */
  initialValue: T;
  /** Synchronous validators, run in order; the first error wins. */
  validators?: Array<FieldValidator<T>>;
  /** Optional async validator, run after sync validators pass. */
  asyncValidator?: (value: T, values: Record<string, unknown>) => Promise<string | undefined>;
  /**
   * When interactive validation runs for this field: on every value change,
   * on blur, or only when the form is submitted. Default: "change".
   */
  validateOn?: "change" | "blur" | "submit";
}

export interface FormConfig {
  fields: Record<string, FieldConfig<any>>;
}

/** Reactive, per-field state plus handlers returned by `createForm`. */
export interface FormApi<V extends Record<string, unknown> = Record<string, unknown>> {
  /** Reactive value signal per field. */
  values: { [K in keyof V]: Signal<V[K]> };
  /** Reactive error-message signal per field (`undefined` = no error). */
  errors: Record<keyof V, Signal<string | undefined>>;
  /** Reactive touched signal per field. */
  touched: Record<keyof V, Signal<boolean>>;
  /** Reactive dirty signal per field (value !== its initial value). */
  dirty: Record<keyof V, Signal<boolean>>;
  /** Computed: true when no field currently has an error. */
  isValid: Signal<boolean>;
  /** True while a submit or async field validation is in flight. */
  isSubmitting: Signal<boolean>;

  setValue<K extends keyof V>(field: K, value: V[K]): void;
  setTouched(field: keyof V, isTouched?: boolean): void;
  /** Accepts a DOM change Event, or (field, value) directly — no DOM required. */
  handleChange(fieldOrEvent: keyof V | Event, value?: unknown): void;
  /** Accepts a DOM blur Event, or a field name directly — no DOM required. */
  handleBlur(fieldOrEvent: keyof V | Event): void;
  /** Restores all values/errors/touched/dirty to their initial state. */
  reset(): void;
  /**
   * Returns a submit handler. Validates every field (sync + async) before
   * calling `onValid` with the current values; does nothing if invalid.
   */
  handleSubmit(onValid: (values: V) => void | Promise<void>): (event?: Event) => Promise<void>;

  /** Snapshot of current values (non-reactive read). */
  getValues(): V;
}

function eventTarget(event: Event): { name?: string; value?: unknown; checked?: boolean; type?: string } | null {
  const target = event.target as unknown as
    | { name?: string; value?: unknown; checked?: boolean; type?: string }
    | null;
  return target;
}

export function createForm<V extends Record<string, unknown> = Record<string, unknown>>(
  config: FormConfig,
): FormApi<V> {
  const fieldNames = Object.keys(config.fields) as Array<keyof V & string>;
  const initialValues = {} as V;

  const values = {} as { [K in keyof V]: Signal<V[K]> };
  const errors = {} as Record<keyof V, Signal<string | undefined>>;
  const touched = {} as Record<keyof V, Signal<boolean>>;
  const dirty = {} as Record<keyof V, Signal<boolean>>;

  for (const name of fieldNames) {
    const fieldConfig = config.fields[name];
    (initialValues as Record<string, unknown>)[name] = fieldConfig.initialValue;
    values[name] = signal(fieldConfig.initialValue) as Signal<V[typeof name]>;
    errors[name] = signal<string | undefined>(undefined);
    touched[name] = signal(false);
    dirty[name] = computed(() => values[name].value !== (initialValues as Record<string, unknown>)[name]);
  }

  const isSubmitting = signal(false);

  const isValid = computed(() => fieldNames.every((name) => !errors[name].value));

  function getValues(): V {
    const out = {} as V;
    for (const name of fieldNames) {
      (out as Record<string, unknown>)[name] = values[name].peek();
    }
    return out;
  }

  function runSyncValidators(name: keyof V & string, value: unknown): string | undefined {
    const validators = config.fields[name].validators;
    if (!validators) return undefined;
    for (const validate of validators) {
      const message = validate(value as never);
      if (message) return message;
    }
    return undefined;
  }

  async function runAsyncValidator(name: keyof V & string, value: unknown): Promise<void> {
    const asyncValidator = config.fields[name].asyncValidator;
    if (!asyncValidator) return;
    isSubmitting.value = true;
    try {
      const message = await asyncValidator(value as never, getValues());
      // Ignore stale results: only apply if the field still holds this value.
      if (values[name].peek() === value) {
        errors[name].value = message;
      }
    } finally {
      isSubmitting.value = false;
    }
  }

  /** Runs sync validation for a field, then kicks off async validation if configured. */
  function validateField(name: keyof V & string, value: unknown): void {
    const message = runSyncValidators(name, value);
    errors[name].value = message;
    if (!message && config.fields[name].asyncValidator) {
      void runAsyncValidator(name, value);
    }
  }

  function setValue<K extends keyof V>(field: K, value: V[K]): void {
    const name = field as keyof V & string;
    values[name].value = value as V[typeof name];
    const validateOn = config.fields[name].validateOn ?? "change";
    if (validateOn === "change") {
      validateField(name, value);
    }
  }

  function setTouched(field: keyof V, isTouched = true): void {
    const name = field as keyof V & string;
    touched[name].value = isTouched;
  }

  function handleChange(fieldOrEvent: keyof V | Event, value?: unknown): void {
    if (typeof fieldOrEvent === "string") {
      setValue(fieldOrEvent as keyof V, value as V[keyof V]);
      return;
    }
    const event = fieldOrEvent as Event;
    const target = eventTarget(event);
    if (!target?.name) return;
    const nextValue = target.type === "checkbox" ? target.checked : target.value;
    setValue(target.name as keyof V, nextValue as V[keyof V]);
  }

  function handleBlur(fieldOrEvent: keyof V | Event): void {
    let name: keyof V & string;
    if (typeof fieldOrEvent === "string") {
      name = fieldOrEvent as keyof V & string;
    } else {
      const target = eventTarget(fieldOrEvent as Event);
      if (!target?.name) return;
      name = target.name as keyof V & string;
    }
    setTouched(name, true);
    const validateOn = config.fields[name].validateOn ?? "change";
    if (validateOn === "blur" || validateOn === "change") {
      validateField(name, values[name].peek());
    }
  }

  function reset(): void {
    for (const name of fieldNames) {
      values[name].value = (initialValues as Record<string, unknown>)[name] as V[typeof name];
      errors[name].value = undefined;
      touched[name].value = false;
    }
    isSubmitting.value = false;
  }

  function handleSubmit(onValid: (values: V) => void | Promise<void>) {
    return async (event?: Event): Promise<void> => {
      event?.preventDefault?.();
      isSubmitting.value = true;
      try {
        for (const name of fieldNames) {
          touched[name].value = true;
          const message = runSyncValidators(name, values[name].peek());
          errors[name].value = message;
        }

        const pendingAsync: Array<Promise<void>> = [];
        for (const name of fieldNames) {
          if (!errors[name].peek() && config.fields[name].asyncValidator) {
            pendingAsync.push(runAsyncValidator(name, values[name].peek()));
          }
        }
        if (pendingAsync.length > 0) {
          await Promise.all(pendingAsync);
        }

        if (isValid.value) {
          await onValid(getValues());
        }
      } finally {
        isSubmitting.value = false;
      }
    };
  }

  return {
    values,
    errors,
    touched,
    dirty,
    isValid,
    isSubmitting,
    setValue,
    setTouched,
    handleChange,
    handleBlur,
    reset,
    handleSubmit,
    getValues,
  };
}
