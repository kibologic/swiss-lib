---
"@swissjs/core": patch
---

Fire the `"updated"` lifecycle hook on every DOM-commit path, not just the explicit
`scheduleUpdate()`/`performUpdate()` path. Three independent commit strategies existed
(`commitVNode`, `performUpdate`, and `dom-updates.ts`'s `updateComponentNode`, which runs when a
parent's own reconciliation revisits an already-mounted child component's vnode position); all
three now fire `"updated"` after a real DOM commit. Root-caused a bug where `this.on('updated', cb)`
was silently dead for any component whose re-renders are driven by reactive state writes rather
than an explicit update call (office's `PdfViewerPage` and others). Also fixes `event-system.ts`'s
module-level `on()` override shadowing the lifecycle-hook registrar on
`SwissComponent.prototype.on`, which was the actual root cause once traced through.

Commits: 8cbf81d, 7b2d0e9, 560662a.
