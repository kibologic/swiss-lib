# DOCTRINE — standing law for every agent working in this repository

> 🧭 **Article 18 — SwissJS evolves from its own architecture, never by imitation.** Design
> decisions originate from the SwissJS architecture and concrete Alpine requirements. **Never
> introduce an API, abstraction or capability because another framework has it. Feature parity with
> any external ecosystem is explicitly not a goal**, and resemblance to one is not evidence of
> correctness. Reason from this ecosystem's own primitives — the compiler, `.ui`/`.uix` files, the
> integrated runtime, the Alpine-first architecture. Those are the differentiator; imitation would
> discard the reason SwissJS exists. If a capability is required, we build it; if not, we don't.


> This file is the **tracked** home of the law, because `CLAUDE.md` is gitignored in this repo and
> therefore never reaches a fresh clone. Agents: read this before diagnosing or fixing anything.
> Canonical text and the full attribution procedure live in the registry at
> `registry/fable/FABLE-DOCTRINE-001-fix-attribution-and-test-mandate.md`.

## ⚖️ STANDING LAW — read before diagnosing or fixing anything

**Constitution Articles 16 & 17.** Full text:
`registry/fable/FABLE-DOCTRINE-001-fix-attribution-and-test-mandate.md`
(the registry repo, `development` branch). These bind every agent in every Kibologic repo. They are
not advice and they are not optional.

### Article 16 — every fix is attributed before it is written

Establish **by evidence** which codebase owns the defect — **framework** (`swiss-lib`/`swite`) or
**application** (this repo) — and record that evidence in the task or finding, *before* writing a
fix. "It reproduces in the app" is NOT evidence of an app bug.

Attribution procedure (stop at the first step that answers it):
1. **Can you reproduce it with framework primitives alone?** If yes → framework defect. Cheapest
   and most decisive step; do this first.
2. **Does the app violate a documented framework contract?** (required `key`s, `id`+`name` on
   inputs, `scheduleUpdate()` after async state, no `return null` in `render()`, no module-level
   function declarations.) If yes → application defect — *and* file a framework finding asking why
   the framework allows it silently.
3. **Does the same symptom appear in a second, unrelated product repo?** Two products failing
   identically points at the framework or the shell, not at two apps making the same mistake.
4. **Does the mystery value exist verbatim elsewhere in the codebase?** Then it's a *leak*, not
   something generated. Grep before theorising.
5. Still unresolved → instrument the boundary: does the framework receive correct input? Yes +
   wrong output = framework. No = walk upstream into the app.

**Hard rules:**
- **Never patch a framework defect in application code.** Adding a `key`, an `id`, a defensive
  `style`, or an extra `scheduleUpdate()` to route around a framework bug is a **workaround** —
  label it as such in the code and file the framework finding in the same change. It is never
  "the fix".
- **Never modify the framework to accommodate one application's mistake.**
- **Never claim a root cause you have not reproduced.** Say "hypothesis" and label it.
- If attribution cannot be established: the verdict is **"undetermined"** — record what you ruled
  out, and write no fix.

### Article 17 — a feature without a test is a bug

Any feature, in either codebase, with no test is **defective by definition** regardless of whether
it currently works, and is logged with the same weight as a functional defect. "It works when I
click it" is not a test.

- Framework features are tested in the framework; application features in their product repo —
  **frontend included**.
- A feature spanning both needs a test on **both** sides. That pairing is what makes Article 16's
  attribution mechanical instead of speculative.

A robust test is **all four** of: (1) **use-case shaped**, not implementation shaped; (2)
**demonstrated failing before the fix** — actually revert the fix and watch it go red, a test that
passes both ways proves nothing; (3) **covers absent/null/error/transition cases**, not just the
happy path; (4) **deterministic** — a flaky test is worse than none.

**Every test is logged and cited.** "Tested" is a claim that must name something. State what you
deliberately did NOT cover.

### Before you write a line of code, answer these three

1. **Which codebase owns this?** State it, with evidence. If you can't — say "undetermined", stop.
2. **What test proves it?** In which repo? Have you watched it fail without your fix?
3. **What did I not test?** Write that down too — an honest gap beats an implied guarantee.

If the honest answer to any of these is uncomfortable, that discomfort **is** the finding. Report
it faithfully rather than routing around it.
