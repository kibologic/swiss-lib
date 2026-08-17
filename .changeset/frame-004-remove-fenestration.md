---
"@swissjs/core": minor
---

Remove `runtime/src/fenestration/` and its published export surface
(`FenestrationRegistry`, `FenestrationContext`, `SwissComponent.fenestrate`/
`fenestrateAsync`, `CapabilityManagerComponent`). This is a breaking change for
any consumer that imported `FenestrationRegistry`/`FenestrationContext` from
`@swissjs/core` or called `fenestrate`/`fenestrateAsync` on a `SwissComponent`
instance.

Disposition and full rationale: `registry/fable/framework/FABLE-FRAME-004-fenestration-disposition.md`
(FABLE-FRAME-004). Read that document before concluding the underlying idea was
judged worthless -- it was not. The *implementation* is removed (zero product
consumers, zero tests, decorative security -- `register()` hardcoded
`security: {}`/`scope: "component"` so `validateSecurity` degenerated to "do
you have a component?", and `FenestrationContext` let the caller assert its
own `user.roles`/`session.permissions`). The *idea* -- capabilities brokered
and audited at a boundary crossing, rather than propagated through layers --
is preserved as the design of record for `AR-031`, the federation trust
boundary finding, gated on that work being scheduled.

`SwissComponent.validateCapabilities()` and `clearCapabilityCache()` are kept
as no-op lifecycle hooks (still called unconditionally by `ssr.ts` and
`component-lifecycle.ts`); only the fenestration-backed capability resolution
path is removed.
