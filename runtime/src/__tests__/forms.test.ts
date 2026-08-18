/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect, vi } from "vitest";
import { createForm } from "../forms/form.js";
import { required, minLength, email } from "../forms/validators.js";

interface LoginValues {
  username: string;
  email: string;
}

function makeForm() {
  return createForm<LoginValues>({
    fields: {
      username: {
        initialValue: "",
        validators: [required(), minLength(3)],
      },
      email: {
        initialValue: "",
        validators: [required(), email()],
      },
    },
  });
}

describe("createForm", () => {
  it("starts with initial values, no errors, untouched, not dirty", () => {
    const form = makeForm();
    expect(form.values.username.value).toBe("");
    expect(form.values.email.value).toBe("");
    expect(form.errors.username.value).toBeUndefined();
    expect(form.errors.email.value).toBeUndefined();
    expect(form.touched.username.value).toBe(false);
    expect(form.dirty.username.value).toBe(false);
    expect(form.isValid.value).toBe(true);
    expect(form.isSubmitting.value).toBe(false);
  });

  it("setValue updates the value signal and marks the field dirty", () => {
    const form = makeForm();
    form.setValue("username", "al");
    expect(form.values.username.value).toBe("al");
    expect(form.dirty.username.value).toBe(true);
    expect(form.dirty.email.value).toBe(false);
  });

  it("minLength validator produces an error and clears once satisfied", () => {
    const form = makeForm();
    form.setValue("username", "ab");
    expect(form.errors.username.value).toBe("Must be at least 3 characters");
    form.setValue("username", "abc");
    expect(form.errors.username.value).toBeUndefined();
  });

  it("required validator fires on empty value", () => {
    const form = makeForm();
    form.setValue("username", "abc");
    expect(form.errors.username.value).toBeUndefined();
    form.setValue("username", "");
    expect(form.errors.username.value).toBe("This field is required");
  });

  it("email validator rejects malformed addresses and accepts valid ones", () => {
    const form = makeForm();
    form.setValue("email", "not-an-email");
    expect(form.errors.email.value).toBe("Invalid email address");
    form.setValue("email", "a@b.com");
    expect(form.errors.email.value).toBeUndefined();
  });

  it("isValid computed flips false when any field has an error, true once all clear", () => {
    const form = makeForm();
    expect(form.isValid.value).toBe(true);

    form.setValue("username", "a"); // too short -> error
    expect(form.isValid.value).toBe(false);

    form.setValue("email", "bad"); // also invalid
    expect(form.isValid.value).toBe(false);

    form.setValue("username", "alice");
    expect(form.isValid.value).toBe(false); // email still bad

    form.setValue("email", "alice@example.com");
    expect(form.isValid.value).toBe(true);
  });

  it("handleBlur marks the field touched", () => {
    const form = makeForm();
    expect(form.touched.username.value).toBe(false);
    form.handleBlur("username");
    expect(form.touched.username.value).toBe(true);
  });

  it("handleChange and handleBlur work with plain (field[, value]) calls, no DOM needed", () => {
    const form = makeForm();
    form.handleChange("username", "bob");
    expect(form.values.username.value).toBe("bob");
    form.handleBlur("username");
    expect(form.touched.username.value).toBe(true);
  });

  it("handleChange also accepts a DOM-shaped change Event", () => {
    const form = makeForm();
    const fakeEvent = { target: { name: "username", value: "eve" } } as unknown as Event;
    form.handleChange(fakeEvent);
    expect(form.values.username.value).toBe("eve");
  });

  it("async validator sets isSubmitting while pending and resolves the error", async () => {
    let resolveCheck!: (err: string | undefined) => void;
    const pending = new Promise<string | undefined>((resolve) => {
      resolveCheck = resolve;
    });

    const form = createForm<{ handle: string }>({
      fields: {
        handle: {
          initialValue: "",
          validators: [required()],
          asyncValidator: () => pending,
        },
      },
    });

    form.setValue("handle", "taken");
    expect(form.isSubmitting.value).toBe(true);
    expect(form.errors.handle.value).toBeUndefined();

    resolveCheck("Handle already taken");
    await pending;
    // allow the microtask that assigns errors.handle to run
    await Promise.resolve();

    expect(form.isSubmitting.value).toBe(false);
    expect(form.errors.handle.value).toBe("Handle already taken");
  });

  it("reset() restores initial values, clears errors and touched/dirty state", () => {
    const form = makeForm();
    form.setValue("username", "a");
    form.handleBlur("username");
    expect(form.dirty.username.value).toBe(true);
    expect(form.touched.username.value).toBe(true);
    expect(form.errors.username.value).toBeDefined();

    form.reset();

    expect(form.values.username.value).toBe("");
    expect(form.errors.username.value).toBeUndefined();
    expect(form.touched.username.value).toBe(false);
    expect(form.dirty.username.value).toBe(false);
    expect(form.isValid.value).toBe(true);
  });

  it("handleSubmit calls onValid only when the form is valid", async () => {
    const form = makeForm();
    const onValid = vi.fn();

    // Invalid: empty fields.
    await form.handleSubmit(onValid)();
    expect(onValid).not.toHaveBeenCalled();
    expect(form.touched.username.value).toBe(true); // submit touches all fields

    form.setValue("username", "alice");
    form.setValue("email", "alice@example.com");

    await form.handleSubmit(onValid)();
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid).toHaveBeenCalledWith({ username: "alice", email: "alice@example.com" });
  });

  it("handleSubmit blocks submission and surfaces errors when invalid", async () => {
    const form = makeForm();
    const onValid = vi.fn();

    await form.handleSubmit(onValid)();

    expect(onValid).not.toHaveBeenCalled();
    expect(form.errors.username.value).toBe("This field is required");
    expect(form.errors.email.value).toBe("This field is required");
    expect(form.isValid.value).toBe(false);
  });
});
