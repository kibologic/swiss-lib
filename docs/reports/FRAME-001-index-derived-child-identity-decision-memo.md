# FRAME-001 Decision Memo — Index-Derived Child Identity: Options and Recommendation

- **For:** Themba (go/no-go decision on implementation)
- **Author:** Sonnet 5, registry harness task `FRAME-001-decision-memo`
- **Date:** 2026-07-08
- **Source finding:** `registry/fable/framework/FABLE-FRAME-001-index-derived-child-identity.md`
- **Scope of this memo:** options + recommendation only. No implementation. Per the finding's own
  2026-07-03 and 2026-07-08 updates, and this task's own directive, the compiler/runtime fix itself
  is explicitly deferred to a separate, future, high-blast-radius task requiring your explicit
  go-ahead.

---

## Executive summary

SwissJS derives a child element's reconciliation identity from **type + runtime index**
(`getKey()` in `runtime/src/renderer/types.ts:80`) whenever no explicit `key` is given. Runtime
index is positional: inserting a sibling, or toggling a conditional/null child, shifts every
subsequent sibling's index, changes its derived key, and makes the reconciler treat a stable
element as new — destroying and recreating its DOM node. This one mechanism is the shared root
cause of a whole class of bugs the platform has repeatedly hit and worked around at the app layer
(input focus loss on sibling insertion, fragment child reorder, `return null` breaking sibling
commits) and has produced a ~51-call-site heuristic "recovery stack" (type-scan fallback,
"aggressive ID matching," live-DOM scanning) that compensates for the instability rather than
fixing it. This memo lays out the options for closing it and recommends staged execution starting
now, gated behind a test harness that is already meaningfully further along than it was when the
finding was first written.

## Evidence

- `runtime/src/renderer/types.ts:80` `getKey(vnode, index)` — explicit `key` wins; otherwise
  `text_${index}` / `${componentName}_${index}` / `${type}_${index}` / `index`. The function's own
  comment already names the defect: *"Using just the index causes components to be recreated when
  siblings are added/removed."*
- `runtime/src/renderer/reconciliation.ts` (321L) layers three fallback tiers after key matching
  fails: type-based fallback for unkeyed components, type-based fallback for unkeyed elements, and
  "Aggressive ID Matching" via a `domByIdMap`.
- `runtime/src/component/update-strategies.ts` — `refreshChildDomNode()` walks live DOM to
  re-find a component's node; `updateChildComponent()` special-cases `parent.id === "app"`,
  `.app-root`, and single-child parents to "recover" a mount point. ~51 call sites reference this
  recovery machinery.
- `runtime/src/vdom/types/index.ts:19` — a `VNode` owns exactly one `dom?: Node`, which cannot
  represent a fragment (multiple top-level nodes) or a null render (zero nodes) — the structural
  reason the index-shift problem exists at all.
- **Current, executable proof the defect is still live** (verified against the real reconciler
  today, not read from the finding as a claim): `runtime/__tests__/regression/null-child-and-list-
  reorder.test.ts:151`, `it.fails('preserves a focused input inside a reordered UNKEYED list item
  (no explicit key)', ...)`. This is deliberately marked as expected-red — it will fail loudly
  (vitest raises on an `it.fails()` that starts passing) the moment a real fix lands, giving this
  memo's recommendation a concrete, mechanical "done" signal rather than a subjective one.
- Compiler-side: no source-position key assignment exists anywhere in `compiler/src` today —
  identity is left entirely to runtime index. This is what Option A below would change.

## Code locations

- `runtime/src/renderer/types.ts:80` (`getKey`)
- `runtime/src/renderer/reconciliation.ts` (fallback stack, L107–~165)
- `runtime/src/component/update-strategies.ts` (`refreshChildDomNode`, DOM-scan recovery)
- `runtime/src/vdom/types/index.ts:19` (single `.dom` pointer)
- `compiler/src/*` (no stable-key emission — the gap Option A would fill)
- `runtime/__tests__/regression/input-focus.test.ts` (9 tests, existing harness)
- `runtime/__tests__/regression/null-child-and-list-reorder.test.ts` (6 tests, added 2026-07-08;
  contains the one currently-failing, intentionally-red reproduction above)
- Dead legacy stub with zero importers, unrelated cleanup: `runtime/src/vdom/diffing.ts` (56L)

## Root cause

Child identity is computed **at runtime from position** instead of assigned **at compile time from
source structure**. The compiler already knows each JSX child's stable position in the template at
compile time; that information is discarded, and the runtime is left to infer identity from an
index that shifts under insertion, removal, or conditional toggling. Every symptom (focus loss,
fragment reorder, null-return breakage) and every workaround (the ~51-site recovery stack, the
app-layer id+name/no-fragments/no-null-return conventions) descends from this one discarded fact.

## Architectural impact

- A recurring, cross-module bug class that reappears in every new feature module built on the
  framework, consuming review and QA cycles that a compile-time fix would eliminate at the source.
- A large heuristic surface (~51 recovery/fallback call sites) that is itself a secondary bug
  source — wrong-node matches, accidentally grabbing `#app`, matching a same-type sibling instead
  of the intended one (exactly what the new failing test reproduces).
- App-layer conventions (mandatory `id`+`name` on inputs, no fragments, never `return null`) exist
  **only** to work around this defect, not for any independent reason — they constrain how every
  product built on SwissJS is written and make the framework feel fragile to app developers.
- This directly blocks the Constitution's own Article 9 ("node identity is compiler-assigned, not
  positional" — see Constitution compliance below): the framework does not yet satisfy an invariant
  the platform has already ratified as binding.

## Options considered

**Option A — Compile-time stable keys (the finding's solution #1, highest leverage).** In the
compiler, assign each JSX child a stable identity derived from its source position (and loop
variable for list items), emitted as an internal key alongside the existing explicit-`key` path.
This makes identity invariant under sibling insertion and conditional toggling without requiring
app authors to hand-write keys everywhere. Directly satisfies Article 9. Touches `compiler/src`
(key emission) and `runtime/src/renderer/types.ts`'s `getKey` (consume the emitted key). Does not
by itself fix the fragment/null structural gap (Option B) or remove the recovery stack (Option C) —
those depend on this landing first and being proven safe.

**Option B — First-class fragments & null as node ranges (solution #2).** Replace the single
`.dom` pointer in `vdom/types/index.ts` with a range/anchor model (start/end comment markers or an
ordered node list per component), so a `null`/`false` child becomes a stable empty anchor that does
not shift sibling indices. Larger structural change than A; directly retires the null-return and
fragment-reorder bug classes. Should follow A, not precede or replace it — A fixes the *identity*
problem, B fixes the *representation* problem the identity fix can't reach on its own (fragments
are non-representable today regardless of key stability).

**Option C — Retire the heuristic recovery stack (solution #3).** Once A (and ideally B) land and
are proven stable, delete the ~51-site fallback/recovery machinery (type-scan matching,
"aggressive ID matching," `refreshChildDomNode` DOM scanning). This is cleanup that depends on A/B,
not an independent option — listed here because it's a real, sizable piece of the eventual work and
its cost (large diff, wide blast radius) belongs in the sequencing decision below.

**Option D — Do nothing now; keep the current app-layer workaround discipline.** Zero framework
risk, zero engineering cost today. Cost is compounding: every new module pays the id+name/no-
fragment/no-null-return tax, the recovery stack keeps growing as a maintenance burden, and the
bug class keeps reappearing (as it already has at least four separate times per the finding's own
evidence). This does not close the Article 9 gap and leaves it as permanent, ratified-but-
unsatisfied platform debt.

## Recommendation

**Adopt Option A now, staged behind the existing regression harness; defer B and C to their own
sessions once A is proven.** Reasoning:

1. The finding's own prior objection — "no compiler/runtime regression harness exists to safely
   verify this" — is now partially resolved. `input-focus.test.ts` (9 tests) and
   `null-child-and-list-reorder.test.ts` (6 tests, including the one currently-`.fails()` red
   reproduction) exercise the reconciler directly against real jsdom, not just app-layer symptoms.
   This is not yet the fully exhaustive harness solution #5 describes (no compiler-source-to-
   compiled-output tests yet, no component-VNode equivalent of the failing case, no nested-fragment
   coverage) — closing those gaps should be the first work item of the implementation task, before
   touching `compiler/src`, not a precondition for approving this memo.
2. Option A is the smallest of the three structural changes and is independently shippable and
   testable (per the finding's own risk assessment) — it does not require B's range-model rewrite
   to land safely, since the existing single-`.dom` model still works for keyed/type-stable nodes
   once identity itself is stable.
3. Doing A first gives the clearest mechanical proof of success: the `.fails()` test at
   `null-child-and-list-reorder.test.ts:151` should flip to passing once compiler-assigned keys
   make same-type sibling reordering distinguishable. That test staying red is the honest current
   status; it turning green is the concrete "solution A landed" signal — no subjective judgment
   needed.
4. B and C should **not** be bundled into the same task as A. B is a materially larger structural
   change (representation model, not just identity), and C's ~51-site deletion should only happen
   once A+B have run in production long enough to trust removing the compensating heuristics. Three
   separate, independently-revertable tasks, not one.

**Sequencing for the implementation task (once approved):**
1. Close the remaining harness gaps named in the finding's 2026-07-08 update (compiler-source-to-
   compiled-output tests; component-VNode equivalent of the failing unkeyed-reorder case; nested-
   fragment interaction coverage) — this is test-writing, not compiler surgery, and is the safe
   first step.
2. Implement compile-time stable key emission (Option A) in `compiler/src`, consumed by `getKey`.
3. Verify: the `.fails()` test at `null-child-and-list-reorder.test.ts:151` should now pass —
   remove the `.fails()` marker per its own tracking comment; full runtime suite (118+ tests) stays
   green; interactive verification via the dev server against a real multi-module UI, not unit
   tests alone, per the finding's own stated standard for this file's risk level.
4. Only after A is live and stable: separately scope Option B (range/anchor model) as its own task.
5. Only after B is live and stable: separately scope Option C (recovery-stack deletion) as its own
   task, plus the app-layer convention deprecation the finding names (id+name mandate becomes an
   a11y nicety, fragments/`return null` become unconditionally safe).

**What this memo is not deciding:** exact timing/priority against other in-flight work, and
whether the harness-completion sub-step (sequencing item 1) is itself worth a dedicated task or
folds into the Option A implementation task. Both are scheduling calls for you, not architectural
ones.

## Risk assessment

- **Severity if left unaddressed:** High for framework maturity/DX (not a data or security issue).
  This is the single largest correctness/ergonomics weakness in the framework per the finding, and
  it is a ratified Constitution article (9) the framework does not yet satisfy.
- **Effort:** Medium for Option A alone (compiler key emission + one `getKey` consumption change,
  well-bounded by the existing 118+ test suite and the two regression files); Medium-High for B;
  Medium for C (mechanical deletion, but wide diff).
- **Risk of getting A wrong:** A wrong stable-key assignment could silently corrupt reconciliation
  in ways that surface as intermittent, hard-to-reproduce UI bugs weeks later across unrelated
  modules — this is exactly why sequencing item 1 (closing harness gaps first) and item 3
  (interactive dev-server verification, not unit tests alone) are non-negotiable parts of the
  recommendation, not optional polish.
- **Reversibility:** High — each of A/B/C is independently shippable and revertable per the
  finding's own risk assessment; nothing here is a one-way door.

## Constitution compliance

This recommendation directly executes **Article 9** ("node identity is compiler-assigned, not
positional") from `fable/FABLE_ACTUALLY_FABLE_DOC.md`'s Part XI — it does not create tension with
any article, it closes an existing gap between the ratified Constitution and the framework's actual
behavior. No other article is implicated: this is runtime/compiler-internal (Article 3, platform
core depends on nothing above it, is unaffected — the change stays within `swiss-lib`), does not
touch tenant isolation (Article 2) or shared-code single-sourcing (Article 4), and does not cross
the licensing boundary (Article 5, swiss-lib is MIT throughout).

## Dependencies

- Compiler + runtime coordinated release — both live in this one repo (`swiss-lib`), no cross-repo
  blocker, per the finding's own Dependencies section.
- No dependency on any other open registry finding or queue task. `FABLE-FRAME-002` (swite module
  federation) and `FABLE-DEAD-001` (dead-code register, which separately flags
  `runtime/src/vdom/diffing.ts` as a zero-importer stub) are adjacent but not blocking.
- App-layer workaround deprecation (id+name mandate, fragment/null patterns — tracked in project
  memory, not this repo) should follow, not precede or block, this work landing.

## Implementation priority

**P1**, matching the source finding. Recommended first concrete queue task, once you approve:
`FRAME-001-harness-completion` (close the three named harness gaps — spec-quality.md or a script
gate asserting compiler-output test coverage exists, your call), followed by
`FRAME-001-compile-time-keys` (Option A itself, gated on the completed harness plus the existing
`.fails()` test flipping to passing as its mechanical proof of done).
