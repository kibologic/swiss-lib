/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-PROPS-CHANGE-HOOK: the first-class prop-change lifecycle hook. A bare method named
// `onUpdate(prevProps)` on a component class is NOT and has never been a lifecycle hook in
// this framework (verified by grep across compiler/src and runtime/src -- zero references,
// see parent-driven-prop-push-updated-hook-repro.test.ts). This module gives components a
// real, framework-invoked way to react to a prop change specifically (as opposed to
// "updated", which fires on every DOM commit including state-only re-renders), and warns
// when a component defines one of the dead-hook trap names instead.
import type { SwissComponent } from "./component.js";
import { asInternal } from "./internal.js";
import { logger } from "../utils/logger.js";

/**
 * Method names that look like a prop-change/update lifecycle hook but are never invoked by
 * the framework. Each one has shown up as dead code in real components (office PRs #167/#169
 * for `onUpdate`; the others are the same trap under a different spelling).
 */
const DEAD_LIFECYCLE_METHOD_NAMES: readonly string[] = [
  "onUpdate",
  "componentDidUpdate",
  "onPropsChanged",
];

const warnedClasses = new WeakSet<object>();

function isDevMode(): boolean {
  return !(
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV === "production"
  );
}

/**
 * Dev-mode-only warning for a class that defines a method matching a known dead-hook trap
 * name. Warns once per class (not per instance) to stay cheap under repeated mounts. A
 * compile-time warning would catch this earlier, but only for `.ui`/`.uix` sources compiled
 * by this framework's own compiler -- this runtime check also covers plain `.ts`/`.js`
 * component classes and third-party components, at effectively zero cost (one prototype
 * property lookup per name, only in dev builds).
 */
export function warnDeadLifecycleMethods(instance: SwissComponent): void {
  if (!isDevMode()) return;
  const ctor = instance.constructor;
  if (warnedClasses.has(ctor)) return;

  const record = instance as unknown as Record<string, unknown>;
  const found = DEAD_LIFECYCLE_METHOD_NAMES.filter(
    (name) => typeof record[name] === "function",
  );
  if (found.length === 0) return;

  warnedClasses.add(ctor);
  found.forEach((name) => {
    logger.warn(
      `[Swiss] ${ctor.name} defines a method named "${name}" -- this is NOT a SwissJS ` +
        `lifecycle hook and is never called by the framework. Use ` +
        `"onPropsChange(prevProps, nextProps)" to react to a prop change, or ` +
        `this.on("updated", cb) to react to any DOM commit.`,
    );
  });
}

function shallowCloneProps(props: Record<string, unknown>): Record<string, unknown> {
  return { ...props };
}

/** Default comparison for onPropsChange: shallow, key-by-key, reference equality per key.
 *  To react to one specific prop only, compare that key inside onPropsChange itself, e.g.
 *  `if (prevProps.resourceId !== nextProps.resourceId) { ... }` -- both snapshots are plain
 *  objects, so any per-key comparison (including a deep one) is the caller's choice. */
function shallowEqualProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Registers every declared instance-method lifecycle hook (onMount, mounted, onPropsChange)
 * against the LifecycleManager, and runs the dead-hook-name warning. Moved out of
 * component.ts's initialize() (FRAME-PROPS-CHANGE-HOOK) to keep that file under the
 * project's 700-line module-size limit while adding onPropsChange wiring.
 */
export function wireDeclaredHooks(instance: SwissComponent): void {
  const ci = asInternal(instance);

  if (typeof instance.onMount === "function") {
    ci._lifecycle.on("mounted", async () => {
      try {
        await instance.onMount!();
      } catch (error) {
        instance.captureError(error, "mounted");
      }
    });
  }
  if (typeof instance.mounted === "function") {
    ci._lifecycle.on("mounted", () => {
      try {
        instance.mounted!();
      } catch (error) {
        instance.captureError(error, "mounted");
      }
    });
  }

  warnDeadLifecycleMethods(instance);

  if (typeof instance.onPropsChange === "function") {
    ci._lifecycle.on("propsChanged", (...args: unknown[]) => {
      const [prevProps, nextProps] = args as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      try {
        instance.onPropsChange!(prevProps as never, nextProps as never);
      } catch (error) {
        instance.captureError(error, "propsChanged");
      }
    });
  }
}

/**
 * Baselines the prop-change snapshot at mount time, BEFORE any "updated" phase can fire.
 * Must run at mount, not lazily on the first "updated" call: by the time "updated" fires,
 * the DOM commit it follows has already applied whatever props triggered it, so a lazy
 * first-call baseline would silently swallow that very first real prop change instead of
 * reporting it. Called from component-lifecycle.ts's mountComponent().
 */
export function baselinePropsSnapshot(instance: SwissComponent): void {
  const ci = asInternal(instance);
  ci._lastPropsSnapshot = shallowCloneProps((instance.props ?? {}) as Record<string, unknown>);
}

/**
 * Diffs the component's current props against the last-observed snapshot and, on a real
 * shallow change, fires the "propsChanged" phase with (prevProps, nextProps). Called from
 * SwissComponent.executeHookPhase() right before it fires "updated" -- "updated" fires on
 * every DOM commit, including state-only re-renders where props never changed; this narrows
 * that to actual prop changes.
 *
 * The snapshot is normally already baselined by baselinePropsSnapshot() at mount time; the
 * `prevSnapshot === undefined` branch here is a defensive fallback for any instance that
 * reaches this without having gone through mountComponent (e.g. a hand-constructed test
 * double), so onPropsChange still never fires for what is effectively that instance's first
 * observed state instead of a real change.
 */
export async function checkAndFirePropsChanged(instance: SwissComponent): Promise<void> {
  const ci = asInternal(instance);
  const currentProps = (instance.props ?? {}) as Record<string, unknown>;
  const prevSnapshot = ci._lastPropsSnapshot;

  if (prevSnapshot === undefined) {
    ci._lastPropsSnapshot = shallowCloneProps(currentProps);
    return;
  }

  if (shallowEqualProps(prevSnapshot, currentProps)) return;

  const nextSnapshot = shallowCloneProps(currentProps);
  ci._lastPropsSnapshot = nextSnapshot;
  await instance.executeHookPhase("propsChanged", undefined, [prevSnapshot, nextSnapshot]);
}
