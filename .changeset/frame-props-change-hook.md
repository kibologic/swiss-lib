---
"@swissjs/core": minor
---

Add a first-class `onPropsChange(prevProps, nextProps)` lifecycle hook (FRAME-PROPS-CHANGE-HOOK).

A method literally named `onUpdate(prevProps)` was never a real lifecycle hook in this
framework — it was never invoked by the compiler or runtime, at any point. office shipped
nine components relying on that assumed convention (PRs #167/#169), each a real dead-code
stale-UI bug, and had to work around it with an app-side `watchProp()` helper diffing
`this.on('updated', ...)`.

`onPropsChange(prevProps, nextProps)` is now invoked by the framework itself:
- fires once per actual (shallow-diffed) prop change, not on every DOM commit;
- receives both the previous and next props as plain object snapshots;
- fires for a parent-driven prop push into a reused component instance (e.g. a router
  reusing the same page across a route change) as well as an ordinary parent re-render;
- never fires on mount;
- coexists with the existing `this.on('updated', cb)` hook, which still fires on every
  commit (state or props) — `onPropsChange` is the narrower, props-only signal.

Also adds a dev-mode warning when a component class defines `onUpdate`, `componentDidUpdate`,
or `onPropsChanged` — none of which the framework calls — pointing at `onPropsChange` and
`this.on('updated', cb)` instead.

See `runtime/README.md`'s "Reacting to prop changes" section for usage and how to compare a
single prop key instead of the default shallow whole-props diff.
