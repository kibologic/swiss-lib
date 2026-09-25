---
"@swissjs/core": patch
---

Fix component-renders-component instance identity (FRAME-002): when a component renders another
component directly with no wrapping element (e.g. an `ErrorBoundary` returning its single child),
both map to one DOM node. The mount path previously stored the OUTER instance in
`componentInstances`, whose guard could never match because `renderComponent` overwrites the
rendered child vnode tag with the INNER instance during recursion — so the mounted inner instance
was evicted and re-clobbered on every subsequent update. The inner (rendered) instance is now kept
as the shared-node owner.

Commit: 92f50aa.
