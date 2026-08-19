# FRAME-001 — Compile-Time Node Identity: Design Proposal

- **For:** Themba (design review — go/no-go on implementation, per FABLE-FRAME-006 §4.5)
- **Author:** Sonnet 5, registry harness task `FRAME-001-design-proposal`
- **Date:** 2026-08-19
- **Repo state analyzed:** `swiss-lib`, branch `docs/FRAME-001-design-proposal`, based on
  `origin/development` @ `70839d6`. `@swissjs/runtime` 1.3.0, `@swissjs/compiler` 1.3.1.
- **Source findings:** `fable/framework/FABLE-FRAME-001-index-derived-child-identity.md`,
  `fable/framework/FABLE-FRAME-006-swissjs-completion-program.md` §4.5,
  `fable/runtime/FABLE-RENDER-001-swissjs-refresh-render-instability.md` (D1/D2/D3)
- **Scope:** design document only. **No code in this repo changes as a result of this task.**
  Per the 2026-07-29 SSR carve-out and this task's own directive, the renderer refactor this
  document describes remains held pending review of the document itself. Nothing here is designed
  by analogy to React/Vue/Solid (Constitution Article 18) — every claim below is traced to
  SwissJS's own compiler pipeline, `.ui`/`.uix` source model, vnode/`.dom` model, and the two
  commit pipelines (explicit `scheduleUpdate()` and signal-driven reactive commits) as they exist
  in this repo today.

---

## 0. Why now, briefly

FABLE-FRAME-006 §2 names FRAME-001 the keystone of the completion program: SSR/hydration cannot
be *validated* (only built) without stable identity, because hydration matches server-rendered
HTML to client vnodes by identity; the router's outlet-swapping is conditional-child
reconciliation, the exact case that breaks; portals need a node-range model the single `.dom`
pointer cannot express. Five renderer defects surfaced in a two-week window in this codebase (D1
style-leak, D2 index-base asymmetry, D3 null-render slot collapse, a baseline-clobber bug, and a
`_skipNextUpdate` mis-scope), and D2 was created by a previous *correct* fix to D1's neighborhood
— direct evidence that patching the current model is no longer converging. This document answers
Themba's six required sections plus the harness assessment named as a precondition in the
program's ratified §4.5.

---

## 1. Current identity flow

### 1.1 `getKey` — `runtime/src/renderer/types.ts:80`

Verified at its current location (unchanged from the original finding's citation):

```ts
export function getKey(vnode: VNode, index: number): string | number {
  if (isTextVNode(vnode)) return `text_${index}`;
  if (typeof vnode === "object" && vnode !== null) {
    const keyedVNode = vnode as { key?: string | number; props?: { key?: string | number } };
    const key = keyedVNode.key ?? keyedVNode.props?.key;
    if (key !== undefined) return key;
  }
  if (isComponentVNode(vnode)) return `${componentName}_${index}`;
  if (isElementVNode(vnode)) return `${vnode.type}_${index}`;
  return index;
}
```

Identity is: explicit key (author-supplied `key={...}` prop) → else `type + runtime index`. The
function's own 2024 comment is still accurate and still unaddressed: *"Using just the index causes
components to be recreated when siblings are added/removed."* Type-qualifying the index (`div_1`
vs `input_1`) narrows, but does not close, the defect — inserting a same-type sibling still
produces a collision or a shift.

**One concrete finding not in the prior report:** `getKey`'s `keyedVNode.key` branch checks a
top-level `vnode.key` field, but nothing in the creation path ever sets it. `createVNode`
(`runtime/src/vdom/vdom.ts:64-107`) only ever writes `type`/`props`/`children`/`ssrState`/
`hydrationId` — no `key` field. The automatic-JSX-runtime helpers `jsx()`/`jsxs()`
(`vdom.ts:113-142`) accept a `key` parameter but immediately fold it into `props.key`
(`{ ...restProps, key }`) before calling `createVNode`. So `vnode.key` is dead code in every path
that exists today; the only real source of an explicit key is `props.key`. This is a minor,
low-risk fact today, but it matters for §2: it confirms **no code path currently stamps an
identity value onto a vnode independent of its `props` object** — whatever compile-time identity
gets added has no existing top-level field to reuse cleanly (see §2.3).

Also relevant: the compile pipeline (`compiler/src/compiler.ts:188-189`) configures esbuild with
`jsxFactory: "createElement"` / `jsxFragment: "Fragment"` — the **classic** JSX transform, not the
automatic runtime. `jsx()`/`jsxs()` are therefore not on the compiled-output path at all today;
they exist in the runtime but nothing compiler-emitted calls them.

### 1.2 The reconciler — `runtime/src/renderer/reconciliation.ts` (499 lines, not 321)

This file has grown substantially since the original finding (321L) and the decision memo — five
named fixes are layered into it since, each with its own attribution comment: a dual-commit-
pipeline staleness guard + bounded microtask retry (`STUCK-LOADING FIX`), a `filterValidVNodes`
correction to that guard (`CLICK-NO-RESPONSE FIX` — this **is** D3/`RENDER-001-E`, confirmed fixed
in this file, not merely hypothesized as the completion program's evidence-base callout states),
an index-base alignment fix for `newChildren` (`FABLE-RENDER-001 D2`, confirmed fixed), a
same-type-instance-double-claim fix (`FRAME-WA-004`), and a transition-aware removal path
(`FRAME-transition-api`). `reconcileChildren` (`reconciliation.ts:87-499`) now does, in order:

1. **Staleness guard** (L96–128): compares `filterValidVNodes(oldChildren).length` against live
   `parent.childNodes.length`; on mismatch, bails the entire pass and schedules a bounded
   microtask retry (max 3 attempts / 1s window per parent) rather than reconciling against a
   provably-stale snapshot. This exists because of two independent commit pipelines that can each
   build and commit a vnode tree for the same component in close succession.
2. **`oldKeyMap` build** (L130–206): for each old (filtered) child, `getKey(vnode, index)` — plus
   a `domByIdMap` (DOM `id` attribute → node) built alongside it for the ID-matching fallback
   below. Per-entry, DOM identity is resolved by: live `vnode.dom` if still attached to `parent`,
   else the positional `oldChildNodes[index]` (only valid when the filtered count matches the live
   DOM count — the same guard's own precondition), else an `id`-prop match against `domByIdMap`.
3. **`newKeyMap` build** (L208–239): computes a **filtered** index base for `newChildren`
   (`newFilteredIndices`) so a raw index (which counts `null`/`false` conditional children) can't
   silently disagree with `oldKeyMap`'s filtered index base — this is the D2 fix. The comment
   documents the concrete bug it replaced: old `{div_0, button_1}` vs new `{div_1, button_2}` for
   the same two elements when a leading conditional flips, zero keys matching, both children
   falling through to the tag-fallback below and cross-binding to the wrong DOM node.
4. **First pass — match & update** (L245–459), per new child, in order of attempt:
   - exact key match against `oldKeyMap`;
   - else, for an **unkeyed component** vnode: linear scan of `oldKeyMap` for the first
     unprocessed entry with the same constructor (`type-based fallback for unkeyed components`,
     L266–282);
   - else, for an **unkeyed element** vnode: linear scan for the first unprocessed entry with the
     same tag name (`type-based fallback for unkeyed elements`, L294–310) — this is the fallback
     that fixed the original sibling-insertion focus-loss case, and the same mechanism the
     `.fails()` test in §1.4 proves is insufficient once two+ unkeyed siblings share a tag;
   - else, **"Aggressive ID Matching"** (L312–358): if the new element has a `props.id`, look for
     an old entry whose live DOM already has that id, and failing that, recursively search
     `oldChildren` for a vnode with a matching `props.id` and splice it into `oldKeyMap` on the
     spot.
   - If none of the above found a match: unmount the positionally-corresponding stale outgoing
     node *before* creating the new one (`FRAME-WA-004`, L430–450) — otherwise `dom-creation.ts`'s
     own aggressive same-type instance search (§1.3) can silently re-adopt the about-to-be-orphaned
     instance and skip `initialize()`/`mounted()`.
5. **Second pass — reorder** (L462–471): walks `newDoms` in final order and `insertBefore`s any
   node not already at its target position.
6. **Cleanup** (L473–498): any old DOM node never claimed by `processedNodes` is removed, via
   `removeWithTransition` if a `transition` prop is registered, else synchronously.

The fallback stack is **strictly larger and more layered** than either prior document describes —
not because the root cause moved, but because each new bug in this family has so far been closed
by adding another heuristic tier on top of the same index-derived key space, exactly matching
FABLE-FRAME-006 §2's read of D2 ("a correct fix... created another").

### 1.3 DOM-scan recovery — `runtime/src/component/update-strategies.ts` (278 lines)

- `refreshChildDomNode()` (L29–64): walks live DOM depth-first from a component's known/inferred
  parent looking for the element registered to that instance in `componentInstances`/
  `domToHostComponent`; if that fails, falls back to `document.querySelector("#app")` and searches
  under its first child.
- `updateChildComponent()` (L83–122) and `handleNoUpdatePath()` (L124–191) both special-case
  `parent.children.length === 1`, `parent.id === "app"`, and `parent.classList.contains("app-root")`
  to "recover" an inferred mount container when a component's own container reference was lost —
  `handleNoUpdatePath` additionally falls back to `document.querySelector("#app") ||
  document.querySelector("[data-app-root]")` as a last resort before giving up and logging.
- `dom-creation.ts` (not previously named at this granularity) separately performs an "aggressive
  same-type instance search" walking the live DOM upward from the nearest component root
  (referenced directly by the `FRAME-WA-004` comment in reconciliation.ts as the mechanism that
  can wrongly re-adopt a stale, about-to-be-orphaned instance).

### 1.4 The single `.dom` pointer — `runtime/src/vdom/types/index.ts` (39 lines)

`VNodeBase` (L14–31) still carries exactly one `dom?: HTMLElement | Text | Node`. This is
unchanged from the original finding and remains the structural reason a vnode cannot represent a
fragment (multiple top-level nodes) or a null render (zero nodes) as anything other than "the
position collapsed, indices shifted." Notably, the interface has otherwise grown SSR-oriented
fields since the finding was written — `ssrId`, `ssrState`, `hydrationId` (L20, L22-23) — i.e. the
data model already anticipates server/client reconciliation but has not yet been given the
identity or multi-node representation that hydration-by-identity requires. `__normalizedChildren`
/ `__normalized` (L27–30) are renderer-internal caches of flattened fragment output, not an
identity mechanism — fragments are flattened into their parent's child list before reconciliation
runs, which is *why* a fragment's own children currently reorder as ordinary siblings of whatever
follows the fragment (the "fragment child reorder" bug class) rather than being tracked as a unit.

### 1.5 The ~51 heuristic recovery sites — recount

The original finding's grep pattern is `refreshChildDomNode|querySelector("#app")|app-root|
domToHostComponent|componentInstances`. Re-run against current `runtime/src` (excluding
`__tests__`):

```
$ grep -rn '...' runtime/src --include="*.ts" | grep -v __tests__ | wc -l
55
```

By file:

| File | Hits |
|---|---|
| `runtime/src/component/update-strategies.ts` | 10 |
| `runtime/src/renderer/dom-updates.ts` | 9 |
| `runtime/src/renderer/dom-creation.ts` | 7 |
| `runtime/src/renderer/renderer.ts` | 6 |
| `runtime/src/renderer/reconciliation.ts` | 5 |
| `runtime/src/renderer/dom-update-refs.ts` | 5 |
| `runtime/src/renderer/hydration.ts` | 5 |
| `runtime/src/renderer/types.ts` | 3 |
| `runtime/src/component/update-manager.ts` | 2 |
| `runtime/src/renderer/storage.ts` | 2 |
| `runtime/src/transitions/transition-registry.ts` | 1 |
| **Total** | **55** |

The real count is **55, not ~51** — the family has grown by roughly 4 sites since the finding was
written, consistent with §1.2's observation that new bugs in this class have been closed by adding
fallback tiers rather than removing the root cause. Of the 55, 2 (`storage.ts`) are the bare
`WeakMap` *declarations* of `componentInstances`/`domToHostComponent` themselves — legitimate
identity-tracking infrastructure, not heuristic recovery — so the count of sites that actually
*consume* those maps for fallback/recovery purposes is **53**. `hydration.ts` (5 hits) is new
territory the original finding didn't examine at all: SSR hydration already leans on the same
`componentInstances`/`domToHostComponent` maps for matching, meaning hydration today inherits this
exact instability rather than being independent of it — direct confirmation of FABLE-FRAME-006
§2's claim that SSR structurally depends on this fix.

### 1.6 Reconciliation test harness — current state (required assessment)

Files (actual current location — moved from `runtime/src/__tests__/` as referenced in some prior
material to `runtime/__tests__/regression/`):

- `runtime/__tests__/regression/input-focus.test.ts` — exists, 9 tests (per its own header),
  covers the sibling-insertion/focus-loss case fixed 2026-06-30.
- `runtime/__tests__/regression/null-child-and-list-reorder.test.ts` — exists, 6 tests, covers
  null-child slot collapse, keyed list reorder, fragment child reorder, and one deliberately-red
  case.
- `runtime/__tests__/regression/ternary-text-to-subtree.test.ts` and two siblings
  (`-root.test.ts`, `-signal.test.ts`) — exist, not named in the original finding; cover a related
  but distinct defect family (`FRAME-WA-005`, ternary text-to-subtree transitions), evidence the
  regression suite has kept growing organically alongside each new fix.
- **The `.fails()` red case is confirmed still present, unchanged, at line 151**:
  `it.fails('preserves a focused input inside a reordered UNKEYED list item (no explicit key)', ...)`
  — three statically-written (not looped) sibling `<div>`s, the middle one wrapping a focused
  `<input>`, reordered by rotation. Verified by direct read, not by trusting a prior claim that
  this line number was still accurate.

**Exhaustiveness — still not met, confirmed by direct inspection, same gap the finding named:**
`runtime/__tests__/regression/` has 40 `.test.ts` files total under `runtime/`, and every one
inspected constructs its vnode tree by hand via `h()` (`createElement`) calls — **zero** tests
anywhere under `compiler/` exercise a `.uix`/`.ui` source string through the real compile pipeline
and assert on the *emitted* `createElement(...)` call shape for identity purposes. `compiler/`'s
own test suite (`jsx-integration.test.ts` is the only JSX-named file) tests that JSX source
compiles to *valid* JS, not that its emitted output carries any particular identity. This is a
real, load-bearing gap for §2 below: the `.fails()` test's own scenario (three static sibling
`<div>`s) is exactly the case pure source-position identity would resolve, but because the test
bypasses the compiler entirely, **flipping it to pass proves the runtime's fallback logic can
consume a stable key — it does not prove the compiler actually emits one for real `.uix` source.**
A genuine "solution #1 landed" signal needs a second, compiler-level companion test (real `.uix`
source → compiled `createElement` calls → assert the emitted keys are stable across the same
reorder), which does not exist today. This gap should be closed as the first step of any eventual
implementation task, matching both the original finding's and the decision memo's own sequencing
recommendation — this document does not change that recommendation, only reconfirms it against
current code.

---

## 2. Proposed compile-time identity

### 2.1 What the compiler pipeline actually does today (grounding, not aspiration)

`compiler/src/compiler.ts:52-107` (`compileAsync`) is the real production path — confirmed by its
own comment and by `swissSyntaxTransformer`/`transformSwissSyntax` (the file's documented "Phase
2" AST transform) being exported from `compiler/src/index.ts` but **never called** from
`compileAsync`. The actual pipeline for `.uix` (and JSX-bearing `.ui`) is:

1. **Phase 1, text-level preprocessing** (`preprocessSwissSyntax`, string/regex-based — converts
   `component Foo {}`, `state {}` blocks, etc. to plain TS *before* any parser sees the file).
2. `processImports` (import-statement text processing).
3. **`esbuild.transform()`** (`compiler.ts:185-193`) — JSX → `createElement(...)` calls, via
   esbuild's own internal (Go, not TS-AST-visible) JSX lowering, configured for the **classic**
   pragma (`jsxFactory: "createElement"`, `jsxFragment: "Fragment"`).

Two consequences that directly shape what's feasible:

- **esbuild's single-string `transform()` API has no plugin/visitor hook** the way esbuild's
  `build()` API does. SwissJS's compiler cannot reach inside esbuild's JSX lowering to annotate
  individual JSX children as they're compiled — this has to happen either *before* esbuild sees
  the source (rewrite JSX attributes in the source/AST first) or *after* (post-process the emitted
  `createElement(...)` calls).
- The Phase-2 AST transformer machinery (`swissSyntaxTransformer`, `compiler/src/transformers/
  swiss-syntax.ts:681-783`) already exists and already knows how to run a `ts.TransformerFactory`
  over a parsed `SourceFile` — but it currently only touches `props = {}` class fields and import
  injection, and critically **is not wired into the path that actually runs before esbuild.** It
  would need to be (a) invoked, and (b) extended to walk JSX nodes, neither of which happens today.

`sourceHasJsx()` (`compiler.ts:120-146`) already demonstrates the exact mechanism a pre-esbuild
pass would use: parse the source as TSX via `ts.createSourceFile(..., ts.ScriptKind.TSX)` and walk
for `ts.isJsxElement` / `ts.isJsxSelfClosingElement` / `ts.isJsxFragment`. A key-injection pass is
the same walk, with a write instead of a boolean check.

### 2.2 What gets emitted

**Mechanism: a new AST pre-pass, inserted between `processImports` and `transformJsxWithEsbuild`
in `compileAsync`**, that:

1. Parses the already-preprocessed source as TSX (same `ts.createSourceFile` call `sourceHasJsx`
   already makes — this pass can share that parse rather than re-parsing).
2. Walks every `JsxElement` / `JsxSelfClosingElement` / `JsxFragment` node. For each, if it has no
   explicit `key={...}` attribute already, synthesize one from:
   - **A static source-position component**: `${relativeFilePath}:${line}:${column}` of the JSX
     node's own opening tag, taken from `sourceFile.getLineAndCharacterOfPosition(node.pos)`. This
     is stable under sibling insertion/removal/conditional toggling by construction — a literal
     JSX element written at a fixed place in the source keeps that source position regardless of
     what renders around it at runtime. This alone is what would flip the `.fails()` case in §1.6
     (three static sibling `<div>`s, no loop involved).
   - **A loop-scoping component, only when the JSX node is lexically inside an arrow function
     passed to `.map`/`.forEach`-shaped call** (detected the same way: walk enclosing nodes for a
     `CallExpression` whose callee is a `PropertyAccessExpression` named `map`/`forEach`/`flatMap`
     and whose argument is the enclosing function). In that case the static position alone is
     insufficient — the same JSX literal executes once per array item, so N siblings would all
     synthesize the *same* position-derived id. The pass instead emits a call to a small runtime
     helper, e.g. `__swissKey(pos, loopDiscriminant)`, where `loopDiscriminant` is, in priority
     order: (a) the callback's first parameter's own `.key`/`.id` field access if the JSX node (or
     an ancestor within the same callback) is later given an explicit author key — always prefer
     it and never override it; (b) otherwise the callback's index parameter if present in the
     source (`.map((item, i) => ...)`); (c) otherwise a compiler-injected index parameter (the
     transform can add one to the arrow function's parameter list if the author only destructured
     the item). This composed key (`pos#i`) is a strict improvement over today's `type_index` — it
     no longer collides with siblings *outside* the loop, and within the loop it behaves exactly
     as today's index-based key does for pure reordering (still ambiguous without an author-
     supplied per-item key, which is an inherent limitation of *any* keying scheme, not one this
     proposal claims to remove — see §2.4).
3. Injects the computed value as a `key` JSX attribute (or, for elements that already destructure
   `props` in a spread, as an additional attribute after the spread so it isn't overwritten) on
   the node, then hands the mutated AST's printed source (via `ts.createPrinter`) to
   `transformJsxWithEsbuild` exactly as today.

This keeps `key` as the single channel identity already flows through today (§1.1) — no new vnode
field, no change to `getKey`'s signature, no change to the reconciler's key-matching logic at all.
`getKey` already prefers `props.key` over every fallback; a compiler-emitted key simply means real
`.uix` output populates that branch instead of author-supplied keys being the only way to reach it.
The **type-based fallback tiers in reconciliation.ts (§1.2, steps 4b/4c/4d) become dead code for
any subtree compiled under the new key emission** — they'd only still fire for hand-constructed
`h()` calls (tests, or code that builds vnodes without going through the compiler), which is
exactly the right degradation: compiler output gets real identity, non-compiler-constructed trees
keep today's best-effort behavior unchanged.

### 2.3 Survival under conditionals, fragments, and lists

- **Conditionals** (`{cond && <X/>}`, `{cond ? <A/> : <B/>}`): each JSX literal (`<X/>`, `<A/>`,
  `<B/>`) has its own fixed source position regardless of whether the branch is taken this render
  — a conditional toggling on/off never changes any *other* sibling's position-derived key, closing
  the exact class of bug D2 and the original finding's "conditional sibling" case both describe.
  Note this is a property of *position*, independent of §1.2's separate index-base-filtering fix
  (D2) — the two are complementary: D2 fixed a bug in how the *current* index-derived scheme
  computes its filtered index; source-position keys remove the dependency on any index at all.
- **Fragments**: a `<>...</>`'s own position is stable the same way; its *children*, once
  flattened into the parent's list by `__normalizedChildren` (§1.4), each carry their own
  independent source-position key (they're separate JSX literals), so their relative order among
  themselves is preserved by ordinary keyed reconciliation even after flattening — this closes the
  "fragment child reorder" bug class without requiring the fragment itself to become a first-class
  multi-node identity yet (that's §3 Stage 2, the node-range model, which is about *representing*
  a fragment as a unit for things like portal boundaries and hydration-by-range, not about
  reordering).
- **Lists** (`.map`): per §2.2 step 2, position alone is insufficient inside a loop body (one
  literal executing N times), which is why the loop-discriminant composition exists. This is the
  one case where the proposal does not claim a fully automatic, always-correct answer — see §2.4.

### 2.4 Explicit limitation, stated honestly

Compile-time position closes the **sibling insertion / conditional toggle / fragment reorder**
class completely, because those all involve a JSX literal's identity relative to *other, distinct*
literals, and position is naturally distinct per literal. It does **not** remove the need for an
explicit `key` on **list items that are themselves reordered without any accompanying stable data**
— a `.map` over an array with no id-like field, reordered by the app, is fundamentally ambiguous
about which old DOM node should become which new one without some author-supplied signal. Every
reconciled-list scheme has this limitation; this proposal's loop-discriminant fallback (§2.2, step
2c) behaves identically to today's index-based scheme for *that specific* sub-case, no worse, while
strictly fixing every case outside a loop body. This should be stated plainly in whatever review
follows this document, rather than oversold as "solves list reordering" — it solves identity
*outside* loops unconditionally, and *inside* loops exactly as well as an author-supplied index key
would, which today's scheme does not consistently achieve even for that case (the type-based
fallback can still cross-match wrong same-type siblings within a loop, per the `.fails()` test).

---

## 3. Migration strategy

Staged per the original finding's own sequencing (keys → node-range model → retire heuristics),
made concrete against the actual current code:

### Stage 0 — Harness completion (prerequisite, not yet done)
Add the compiler-level companion test named in §1.6 (real `.uix` source compiled, asserted for key
stability across the reorder the `.fails()` test already exercises at the runtime level), plus a
nested-fragment case and a component-VNode equivalent of the failing unkeyed-reorder case. **No
compiler change happens in this stage.** Independently shippable: yes, trivially — it's pure
test-writing against the existing compiler and runtime, zero behavior change, zero risk.

### Stage 1 — Compile-time key emission (§2), consumed by existing `getKey`
Add the AST pre-pass described in §2.2. `getKey` and the reconciler's key-matching (`oldKeyMap`/
`newKeyMap` lookup) require **zero changes** — they already prefer `props.key` over every
fallback; this stage only changes what populates that value for compiled output. The type-based
fallback tiers (§1.2 steps 4b–4d) and the aggressive-ID-matching tier stay **exactly as they are**,
now serving only as a safety net for hand-built (`h()`) vnode trees and any `.uix` file compiled
by a stale cached build. **Independently shippable:** yes — this is additive to the compiler and
inert to the runtime's public behavior for any vnode that doesn't carry the new key (i.e., it
cannot regress anything the fallback stack already handles; it can only add a better-than-fallback
path). **Fallback behavior mid-migration:** any code compiled with the old compiler, or any vnode
constructed by hand, continues through today's full fallback stack unchanged. Proof of done: the
`.fails()` runtime test plus its new Stage 0 compiler-level companion both flip to passing; full
suite (131+ tests per the most recent recorded run) stays green.

### Stage 2 — Node-range model for fragments/null (§1.4's structural gap)
Replace or extend `VNodeBase.dom` (currently a single `Node`) with a representation that can
express zero nodes (a stable comment/anchor marker for `null`/`false`) or multiple nodes (a
start/end anchor pair, or an ordered array, for a fragment's flattened children as a unit) without
losing the single-node fast path for the overwhelmingly common case (one element, one DOM node).
Concretely, this likely means widening `dom?: HTMLElement | Text | Node` to
`dom?: HTMLElement | Text | Node | NodeRange`, where `NodeRange` is a new, additive type — every
existing call site that reads `vnode.dom` expecting a single `Node` keeps compiling and keeps
working for every non-fragment, non-null vnode; only fragment/null-render vnodes take the new
shape. **Independently shippable:** yes, *given Stage 1 is live* — Stage 1 having already made
identity stable removes the index-shift pressure that made null/fragment slots dangerous in the
first place; Stage 2 is then purely a representation upgrade, testable in isolation against the
Stage 0 harness's fragment/null cases. **Fallback behavior mid-migration:** any vnode not
carrying a `NodeRange` (i.e., everything compiled before this stage, or authored via the ordinary
single-element path) is untouched — this is why it must follow, not precede, Stage 1: attempting
the range model first, on top of still-unstable identity, would mean debugging two moving variables
in the same failure at once, exactly the risk profile FABLE-FRAME-006 §2 warns against.

### Stage 3 — Retire the heuristic recovery stack (§1.5's 53 consuming sites)
Only once Stage 1 and Stage 2 have run in production long enough to trust removing the
compensating heuristics (this document does not set that bar — that's an operational/monitoring
decision for whoever scopes the implementation task, not an architectural one). Delete, in order
of confidence: the aggressive-ID-matching tier first (narrowest, most clearly superseded by real
keys), then the type-based fallback tiers in `reconciliation.ts`, then the DOM-scanning recovery in
`update-strategies.ts` (`refreshChildDomNode`, the `#app`/`.app-root` special-casing). **Not**
independently shippable in the same sense as 1/2 — each deletion needs its own regression pass
against the full harness, because removing a fallback tier is the one change in this whole
migration that can regress previously-masked behavior if Stage 1/2 turn out to have a gap the
fallback was quietly covering. This is exactly why the original finding scoped it as cleanup
*dependent on* A/B, not an independent option, and this document does not change that.

---

## 4. Compatibility layer

**Is this a breaking change, and for whom?**

- **Already-compiled output (apps built against the current `@swissjs/compiler`)**: not broken.
  Stage 1 only changes what the *compiler* emits going forward; a `.js` file already compiled by
  today's compiler contains `createElement(...)` calls with no synthesized key, and continues to
  reconcile via the exact fallback stack it does today (§1.2 steps 4b–4d), because that stack is
  explicitly kept in place through Stage 3. Nothing in Stage 1 or Stage 2 requires a recompile to
  keep working — it requires a recompile to get the *improvement*.
- **Components relying on today's index-derived behavior**: the risk case is a component that
  (knowingly or not) depends on the *current* fallback's specific behavior — e.g., code that
  relies on `updateChildComponent`'s `parent.id === "app"` recovery, or on the aggressive-ID-
  matching tier silently re-binding to a DOM node by `id` even when that wasn't the author's
  intent. Stage 1 does not remove any of these paths, so no such component breaks at Stage 1. Only
  Stage 3 (heuristic retirement) can break such a component, and only if it was relying on
  behavior that was itself a workaround for the underlying defect — Stage 3's own review gate
  (§3) is where that gets caught, not this document.
- **App-layer conventions built around the defect** (mandatory `id`+`name` on inputs, no
  fragments, never `return null`): these remain valid, working patterns through every stage of
  this migration — none of them is invalidated by Stage 1 or Stage 2 shipping. They become
  *unnecessary* once the compiler emits stable keys for the specific case they were each working
  around (§5), but "unnecessary" is not "broken" — existing code using them keeps working
  identically.
- **Net assessment**: this is designed as a strictly additive, opt-in-by-recompilation change
  through Stage 2. The only stage with real breaking-change surface is Stage 3, and that surface
  is bounded to code that depends on today's *heuristic* behavior specifically (as opposed to
  ordinary reconciliation behavior), which by definition is code already exhibiting the bug class
  this whole proposal exists to close.

---

## 5. Expected simplifications

### 5.1 Heuristic sites that die under the new model

Of the 53 consuming call sites counted in §1.5 (55 total minus the 2 bare `WeakMap` declarations):

- **Dies at Stage 1** (compiler-emitted keys make the fallback unreachable for compiled output):
  the type-based fallback for unkeyed components (`reconciliation.ts:266-282`), the type-based
  fallback for unkeyed elements (`reconciliation.ts:294-310`), and the aggressive-ID-matching tier
  (`reconciliation.ts:312-358`) — 3 of `reconciliation.ts`'s 5 counted hits. These don't get
  *deleted* at Stage 1 (§3 — they stay live as a safety net through Stage 3), but they become
  provably dead for any compiler-output subtree, which is what makes Stage 3's eventual deletion
  low-risk rather than speculative.
- **Dies at Stage 3, contingent on Stage 2 also being live**: `refreshChildDomNode` and the
  `#app`/`.app-root` recovery branches in `update-strategies.ts` (10 hits) — these exist because a
  component can lose track of its own DOM position when identity is unstable; once identity is
  compiler-stable and fragments/null have a real representation, the specific failure mode that
  necessitates DOM-tree scanning to "re-find yourself" should no longer arise. This is the largest
  single file in the count and the best-leverage deletion.
- **Does not die, ever, under this proposal**: the `componentInstances`/`domToHostComponent`
  `WeakMap`s themselves (`storage.ts`, 2 hits) — these are legitimate DOM-node-to-instance
  registries needed for lifecycle management regardless of how identity is computed; they are
  infrastructure, not heuristic recovery, and should not be conflated with the 53 in any eventual
  Stage 3 deletion accounting.
- **Uncertain, needs Stage 3's own investigation**: `hydration.ts` (5 hits) — SSR hydration's use
  of these maps for matching is new territory (§1.5) not covered by either prior document; whether
  it simplifies under this model or needs its own hydration-specific identity work is a question
  for the SSR carve-out's own track, not resolved here.

### 5.2 App-layer workaround rules that can be retired

Sourced from the original finding's own catalog (`FABLE-FRAME-001` "Evidence" and "Recommended
direction" §4) plus the concrete `RENDER-001` D2/D3 record:

- **Mandatory `id`+`name` on every form input** (so aggressive-ID-matching can re-find it across a
  reconciliation pass): becomes an accessibility nicety rather than a correctness requirement once
  Stage 1 gives inputs a stable key independent of DOM `id`. Retire as a *mandate*; keep as an a11y
  recommendation.
- **No fragments / wrap multi-child conditionals in a `<div>`**: becomes unnecessary once fragment
  children carry their own stable position-derived keys (§2.3) — a conditional fragment sibling no
  longer reorders relative to its neighbors.
- **Never `return null` from render**: becomes unconditionally safe once Stage 2's node-range
  model gives a null render a stable empty-anchor representation instead of collapsing the slot
  and shifting every subsequent sibling's index — this directly retires the D3/`RENDER-001-E`
  defect class at its structural root, not just the one instance already patched in
  `reconciliation.ts` (§1.2's `CLICK-NO-RESPONSE FIX`, which fixed the guard's *counting*, not the
  underlying single-`.dom`-pointer limitation that makes null-collapse possible at all).
- **The explicit-`key`-as-workaround pattern recorded against `OnboardingShell.uix:192-200`**
  (`FABLE-RENDER-001`'s recommended app-layer fix for the D2 insertion-shift residual case): once
  Stage 1 ships, this specific hand-added key becomes redundant (the compiler emits an equivalent
  position-derived key automatically) — but it is harmless to leave in place, since an explicit
  author key always wins over a compiler-synthesized one (§2.2, priority order 2a).
- **Not found evidence for retiring**: `scheduleUpdate()` calls added for render-triggered async
  timing (named in the original finding as a candidate for review). Nothing in this document's
  code reading connects that pattern to index-derived identity specifically — it looks related to
  the two-commit-pipeline staleness guard (§1.2 step 1) rather than to keying. Leaving this
  candidate unresolved rather than asserting a retirement this document's evidence doesn't
  support.

---

## 6. Benchmark/performance impact (estimated — no implementation exists to measure)

No code changes were made under this task, so nothing here is measured; this section reasons from
the actual data structures and algorithms in §1–§3, not from vibes, and is explicitly labeled
estimated per this task's own scope boundary.

### 6.1 More expensive

- **Compile time**: Stage 1 adds one additional full AST parse-and-walk pass per `.uix`/JSX-bearing
  `.ui` file (§2.2) — `sourceHasJsx` already pays for one TSX parse per `.ui` file today just to
  *check* for JSX; the new pass would either share that parse (cheap — bounded by file size, not
  vnode count) or add a comparable second one for `.uix` files (which don't currently run
  `sourceHasJsx` at all, per `compiler.ts:71-79`). This cost is **compile-time only, one-time per
  build**, not per-render — the right place to pay it if it removes runtime cost (below).
- **Emitted bundle size**: each JSX literal gains a synthesized `key` prop/attribute in the
  compiled output — a string literal for the static-position case (cheap, a few bytes per node),
  or a small runtime helper call for the loop case (§2.2 step 2). Proportional to JSX-node count
  in the app, not to runtime list size — a fixed, small, one-time per-build cost, not a
  per-reconciliation one.
- **Per-node vnode metadata**: `VNodeBase` gains no new *required* field under Stage 1 (key
  continues to live in `props.key`, §2.2's final step) — no widening of the hot-path object shape.
  Stage 2's `NodeRange` type is additive-only to the `dom` field's union (§3 Stage 2) — a
  fragment/null vnode's `dom` becomes a slightly larger tagged value; a normal element/text
  vnode's `dom` is unaffected in shape or size.

### 6.2 Cheaper

- **`oldKeyMap`/`newKeyMap` construction** (`reconciliation.ts:130-239`) is already O(n) in child
  count regardless of keying scheme — this doesn't change algorithmically. What changes is the
  **first-pass match** (`reconciliation.ts:245-459`): today, any child that misses the initial
  `Map.get(key)` falls through to a **linear scan of `oldKeyMap.values()`** (§1.2 steps 4b, 4c),
  which is O(n) *per missed child*, making the worst case (many unkeyed same-type siblings, the
  exact `.fails()` scenario) O(n²) for that subtree. A compiler-emitted key that reliably lands in
  `oldKeyMap` on the first `Map.get` removes this fallback scan entirely for compiled output,
  turning that subtree's reconciliation back to O(n) — the algorithmic improvement is real and
  should show up in exactly the pathological case (many unkeyed siblings) the current heuristic
  stack handles worst.
- **Aggressive-ID-matching's recursive `findVNodeById`** (`reconciliation.ts:328-340`) walks
  `oldChildren` recursively per unmatched id-bearing element — this disappears entirely for
  compiled output once Stage 1 lands (§5.1), removing a scan whose cost is proportional to subtree
  size, not just direct-child count.
- **`refreshChildDomNode`'s live-DOM walk** (`update-strategies.ts:39-56`) is a full DOM subtree
  traversal (`for` over `root.children` with recursive `findIn`) — this is the single most
  expensive per-occurrence heuristic in the current stack (proportional to live DOM subtree size,
  not vnode count, and re-walks on every call rather than being memoized). Its removal at Stage 3
  (§5.1) is the largest single per-occurrence win in this whole migration, though it fires only in
  the "component lost track of its container" case rather than on every render, so its *aggregate*
  impact depends on how often that path is actually exercised in production — a number this
  document cannot supply without instrumentation that doesn't exist yet (a legitimate Stage-0-
  adjacent measurement gap, not filled here since it requires running code this task is not
  authorized to add).

### 6.3 Net framing

The trade is compile-time, fixed, proportional-to-source-size cost for runtime, variable,
proportional-to-pathological-input cost. Given SwissJS already recompiles once per build (not per
render), and the runtime costs being removed are specifically the ones that scale worst (O(n²)
fallback scans, full-subtree DOM walks), the estimated direction is a net runtime win purchased
with a bounded, one-time compile-time cost — but this is a reasoned estimate from the code's own
algorithmic shape, not a measurement, and should not be cited as one.

---

## 7. Summary table

| Stage | What ships | Shippable alone? | Breaking for whom |
|---|---|---|---|
| 0 — Harness completion | Compiler-level identity tests | Yes, zero behavior change | No one |
| 1 — Compile-time keys | AST pre-pass emitting `key` from source position (+loop discriminant) | Yes | No one (additive; old fallback stays live) |
| 2 — Node-range model | `NodeRange` union on `VNodeBase.dom` for fragments/null | Yes, given Stage 1 | No one (additive) |
| 3 — Retire heuristics | Delete the now-provably-dead fallback tiers | No — needs its own regression pass per deletion | Only code relying on today's heuristic-specific behavior |

**What this document does not do:** propose starting Stage 1. Per this task's own scope and the
2026-07-29 carve-out, implementation — any of it, including Stage 0's test-writing — remains a
separate task gated on this document being reviewed and accepted.
