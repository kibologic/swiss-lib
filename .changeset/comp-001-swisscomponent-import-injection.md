---
"@swissjs/compiler": patch
---

Fix `component X {}` syntax never getting its `SwissComponent` import
injected. The compiler's import-injection guard only fired when the
transformed output had no class wrapper (`!hasClassWrapper`) -- but
`component X {}` is rewritten to `class X extends SwissComponent {}`
*earlier* in the same pipeline, so `hasClassWrapper` is already true by the
time the guard runs and it's skipped unconditionally. Every `.uix` file
using `component X {}` emitted a module that referenced `SwissComponent` as
a free identifier and crashed at runtime with `ReferenceError:
SwissComponent is not defined` in a real browser -- invisible to CI because
nothing in the test suite evaluates emitted modules the way a browser does.
136 files across Alpine carried a hand-written `import { SwissComponent }`
as a compensating workaround; this closes the gap in the compiler instead.
