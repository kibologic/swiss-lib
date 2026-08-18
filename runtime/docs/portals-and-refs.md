<!--
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

# Portals and Refs

Two small, independent primitives in `runtime/src/component/`: `createPortal`/`useSlot`
(`portals.ts`) and `ref` (`refs.ts`). Both are FRAME-006 first-class capabilities as of
2026-08-14 (build only — see `never_touch` on the task that shipped this document; migrating
`alpine-ui`'s Modal/SideModal/FloatingWindow onto `createPortal` is a separate, later task, and
`alpine-shell`'s overlay root already consumes `createPortal` directly — see
`FRONT-SHELL-002-overlay-portal-root`).

## `createPortal(content, container)`

Renders `content` into an arbitrary DOM node instead of the calling component's own position in
the tree.

```ts
import { createPortal } from '@swissjs/core';

class Toast extends SwissComponent {
  render() {
    createPortal(
      createElement('div', { class: 'toast' }, 'Saved'),
      document.getElementById('toast-root')!,
    );
    return createElement('div', {}); // this component's own, separate DOM position
  }
}
```

**Must be called during synchronous `render()`.** `createPortal` looks up the calling
component instance via `getCurrentComponentInstance()`, which — like `useSlot`'s own contract —
is only non-null while a component's `render()` is actually executing. Calling it from
`mounted()`, an event handler, or any other lifecycle hook still renders the content
(`renderToDOM` runs unconditionally), but the portal is **not** registered on the owning
instance, so it will **not** be cleaned up automatically when that instance unmounts. In that
case the caller owns the returned cleanup function and must call it itself.

**Not reactive.** Each `createPortal` call is a one-shot `renderToDOM` into `container` — it does
not subscribe to future re-renders of `content`. Calling `createPortal` again on every render (as
in the example above) is the current pattern for keeping portal content in sync with component
state; there is no persistent, updating portal instance the way there is for an element rendered
in place.

**Cleanup.** Returns a function that clears `container.innerHTML` and deregisters the entry.
Registered automatically on the owning component's `_portals` map (every `SwissComponent` has
one); `unmountComponent()` walks that map and clears every still-registered container when the
component unmounts, so most callers never need to hold onto or call the returned cleanup function
themselves — only callers who invoked `createPortal` outside `render()` need to.

**No DOM if there's no DOM.** `typeof document === 'undefined'` makes `createPortal` a no-op that
returns a working (empty) cleanup function, rather than throwing — safe to call from code that
might run during SSR.

### Known limit: node-range identity (FRAME-001)

A portal's content lives outside its parent's DOM subtree, but the framework's node-identity
model is a single `vnode.dom` pointer per vnode — it has no representation for "this vnode's
real DOM output is over there, at an unrelated container." `createPortal`'s one-shot,
non-reconciling design (above) is what keeps this from being a live problem today: because
nothing re-renders a portal's content in place, nothing ever needs to reconcile old portal output
against new. If a future change made portals reactive (subscribing to re-render on every parent
commit, the way an ordinary element does), it would need FRAME-001's node-range model first —
representing a vnode's output as a range of DOM territory rather than a single node pointer is
exactly what "renders outside the parent's position" needs. Recorded here rather than worked
around; not fixed in this task, per its own `never_touch`.

## `ref<T>()`

```ts
import { ref } from '@swissjs/core';

const inputRef = ref<HTMLInputElement>();
// In render(): createElement('input', { ref: inputRef, type: 'text' })
// After mount: inputRef.current is the HTMLInputElement, or null before mount / after unmount.
```

**Lifecycle.** `.current` is set once, by `dom-creation.ts`'s `createElementNode`, at the moment
the element is first created. It is **not** re-set by the update path — an element reconciled in
place (same tag, props/children patched) keeps the same DOM node, so there is nothing to
re-point. `.current` is cleared to `null` by `types.ts`'s `cleanupNode` when the element is
removed (added 2026-08-14 by this task — previously nothing on the removal path cleared it at
all, so a `Ref` held past its element's unmount kept pointing at a detached node indefinitely,
with no way to detect that beyond a separate, manual `.isConnected` check the ref itself never
prompted). The clear is guarded to only apply if `.current` still points at the element being
cleaned up, so a ref reassigned to a newer element by a rapid remount is never clobbered by the
older element's own teardown running after the fact.

**No reconciliation identity of its own.** A ref does not participate in the framework's own
element-identity tracking — it is a passive observer of whatever `createElementNode` decides an
element's identity is, index-derived like everything else pending FRAME-001. If the reconciler
mis-identifies which live DOM node corresponds to which vnode (the general class of defect
FRAME-001 exists to close), a ref attached to that position reflects whatever `createElementNode`
or `cleanupNode` was told, correctly per the mechanism, whether or not the mechanism itself
picked the right node. No portals/refs-specific test forces this case — it is the same
underlying risk `FRAME-006-router-ssr`'s hydration round-trip test already demonstrates for
element identity generally, not a separate one.
