<!--
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

# SwissJS Context

## Overview

`SwissContext` (`runtime/src/component/context.ts`) gives a tree of components a way to read a
value from an ancestor `Provider` without threading it through every prop. It has zero product
consumers as of this writing (FRAME-006-capability-build-context, 2026-08-14) — this document
describes the framework capability's contract, not an established usage pattern in any Alpine
vertical.

## What it guarantees

- **Nearest-ancestor resolution.** `Consumer`/`use`/`consume` walk `component._parent` upward
  and return the value from the closest `Provider` that set one for this context's key. An
  inner `Provider` shadows an outer one for its own subtree (`context-integration.test.ts`,
  "nested providers").
- **Reactive propagation.** Calling a `Provider` again with a changed value calls
  `scheduleUpdate()` on every currently-subscribed `Consumer` whose resolved value (after any
  `select`/`equals`) actually changed — not on every subscriber unconditionally. A subscriber
  whose selected slice is unaffected by the change is not re-rendered.
- **Correct value on a late mount.** A `Consumer` that first mounts after its `Provider` has
  already provided a value sees that value immediately, not `undefined` and not stale
  (`context-integration.test.ts`). This was NOT always true — see "What was fixed" below.
- **No leak on unmount.** `cleanupContextSubscriptions`, called automatically by the framework's
  own unmount path (`component-lifecycle.ts`'s `unmountComponent`, and transitively by
  `cleanupNode` when a whole DOM subtree is torn down), removes the component from every
  context's `subscribers` set and clears its selector/selection bookkeeping. A subsequent
  `Provider` update does not touch an unmounted component (`context-integration.test.ts`,
  `cleanupContextSubscriptions()` unit tests in `context.test.ts`).
- **Selector dedup.** Calling `Consumer()` repeatedly on the same component across re-renders
  registers exactly one unsubscribe closure per (component, context) pair, not one per call.

## What it does not guarantee

- **Not validated under FRAME-001's identity model.** Subscription-driven updates commit
  through the same reconciler as everything else in the framework, which currently resolves
  child identity by DOM position/index rather than a stable compile-time key
  (FRAME-001-design-proposal). This suite has not been re-run against a post-FRAME-001
  reconciler; do not treat its passing today as proof it will still pass unchanged after that
  work lands.
- **No cross-context batching.** If a component provides to two different contexts in one
  render, each `Provider` call triggers its own independent subscriber pass. There is no single
  coalesced "this component's provided values changed" notification.
- **`defaultValue` triggers a one-time dev warning, not an error.** Resolving to `defaultValue`
  because no `Provider` was found logs `[SwissContext] Consumer resolved to default...` once per
  context instance (gated on `NODE_ENV !== "production"`), then stays silent for that context
  for the rest of the process. It is a diagnostic aid, not a mechanism you can rely on to detect
  every missing-provider case at runtime.

## What was fixed as part of this task

**A component that first appears via its parent's re-render (not present at the parent's
initial mount) never learned its own `_parent`.** `useContext` and `findErrorBoundary` both walk
`component._parent` upward; the WeakMap-style "who is the currently-rendering component" pointer
(`getCurrentComponentInstance()`/`setCurrentComponentInstance()`, `renderer/storage.ts`) that
`component-rendering.ts`'s "new instance" branch reads to set `_parent` was only ever
established around the INITIAL tree-walk (`createDOMNode`, `renderComponentImpl`). The
signal-effect-driven re-render commit path (`SwissComponent.commitVNode`) never set it, so any
component discovered fresh during an UPDATE — the ordinary `{cond && <Child/>}` pattern — got
`_parent === undefined` permanently. A `Consumer` mounted this way silently resolved to
`defaultValue`/`undefined` instead of walking up to a real `Provider`; the same break applies to
error-boundary discovery, since it walks the identical chain. Fixed in
`component.ts`'s `commitVNode` by wrapping its reconciliation call with
`setCurrentComponentInstance(this)` / restore, mirroring the pattern already used at every other
site that creates component instances. Demonstrated failing before the fix
(`context-integration.test.ts`'s "consumer mounted AFTER its provider" test), fixed, all 148
runtime tests green after.

## `SWISS_CONTEXT_SUBSCRIBE` — removed

An undocumented flag (env var, `globalThis.__SWISS_CONTEXT_SUBSCRIBE__`, or
`window.__SWISS_CONTEXT_SUBSCRIBE__`) used to be able to disable the push-notification path
above, falling back to a silent pull model where a `Consumer` only saw a new value on its own
next unrelated re-render. Grepped across swiss-lib, swite, and all six Alpine repos: nothing
anywhere ever set it, in either direction, and no test exercised the disabled state. Removed
rather than tested — there was no real second behaviour in production use to prove correct, only
an unexercised code path that could silently turn off the reactivity this API's contract
promises. Push notification (the previous default) is now unconditional.

## Failure modes

| Situation | Behaviour |
|---|---|
| `Consumer` called with no ancestor `Provider` and no `defaultValue` | Returns `undefined` |
| `Consumer` called with no ancestor `Provider`, `defaultValue` set | Returns `defaultValue`, logs once in dev |
| `Provider` called on an unmounted/detached component | Sets the value on that component's own context map; harmless, no subscribers notified since nothing is listening through a live tree |
| A subscribed `Consumer`'s host component is unmounted | Cleaned up automatically; a later `Provider` update silently skips it |
| Selector/equals function throws | Caught per-subscriber (`try { ... } catch { /* best-effort */ }`) in the `Provider` notification loop — one broken subscriber does not stop others from being notified |
