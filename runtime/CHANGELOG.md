# @kibologic/core

## 0.1.6

### Patch Changes

Three distinct rendering bugs fixed, all in `runtime/src`. Root cause analysis was
T-005.

#### fix(core): focus-guard positional fallback for inputs without name/id

`focus-guard.ts` — `FocusState` now records `parentEl` and `siblingIndex` (position
among focusable siblings within the parent element). When `restoreFocusState()` cannot
locate a replacement by `name`/`id` (because the input has neither), it falls back to
finding the element at the same sibling index within the surviving parent container.

Previously, any input field that lacked a `name` or `id` attribute would permanently
lose focus on every keystroke because the guard's only recovery path required one of
those attributes.

#### fix(core): coalesce rapid signal changes into one DOM commit per microtask

`reactivity-setup.ts` — The render effect no longer commits the DOM synchronously on
every signal notification. Instead it queues a `queueMicrotask` callback that commits
the latest VNode once per microtask tick. Multiple synchronous signal changes (e.g. an
event handler that updates several state fields, or rapid input events) now produce a
single reconciliation pass rather than one per signal.

The initial effect execution is skipped — `mount()` performs the first DOM commit
explicitly after `beforeMount` fires.

#### fix(core): reconciler type-based fallback for unkeyed component VNodes

`reconciliation.ts` — When reconciling children and an exact key lookup fails for an
unkeyed component VNode, the reconciler now scans the old key map for the first
unprocessed entry with the same component constructor. This prevents mounted components
from being torn down and recreated when a conditional sibling is inserted before them
(e.g. a slide-over panel toggled via a page-level boolean signal), which shifted all
subsequent index-based keys by one and caused the reconciler to treat every existing
component as a new one.

This fallback activates only for component VNodes that have no explicit `key` prop.
Explicitly keyed components continue to match strictly by key.

#### fix(core): throttled updates reschedule instead of silent drop

`update-manager.ts` — When `updateCount >= MAX_UPDATES_PER_SECOND`, instead of
silently returning and leaving the component in a stale state, the update manager now
schedules a single `setTimeout` callback that fires after the throttle counter resets.
The deferred callback resets the counter and runs `performUpdate()` once.

Previously, a burst of rapid signal changes (e.g. window resize events firing faster
than 60/s) would hit the throttle limit and leave the component frozen at its last
rendered state until a hard browser refresh.

## 1.0.2

### Patch Changes

- c106549: fix(core): add FocusGuard to preserve input focus across reactive reconciliation passes

  Adds `packages/core/src/component/focus-guard.ts` with `saveFocusState()` and
  `restoreFocusState()`. Guards are applied in both `SwissComponent.commitVNode()` (signal
  effect path) and `UpdateManager.performUpdate()` (explicit scheduleUpdate path).

  When the VDOM reconciler uses `replaceChild` instead of an in-place update, the previously
  focused INPUT, TEXTAREA, or SELECT element is destroyed, causing immediate focus loss.
  The guard captures `activeElement` + `selectionStart`/`selectionEnd` before each
  reconciliation pass and restores them after — either to the surviving element or to a
  replacement found by `name`/`id` attribute when the original was replaced.

  Fixes: keystroke-by-keystroke focus loss in all .uix form fields and modals.
