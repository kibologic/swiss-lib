# @kibologic/core

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
