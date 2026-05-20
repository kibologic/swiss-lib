# Compiler overview

The SwissJS compiler (`@swissjs/compiler`) transforms `.ui` and `.uix` source files into standard JavaScript modules. It is a two-phase pipeline: a lexical preprocessing pass followed by a TypeScript AST pass.

---

## Why a compiler?

SwissJS uses custom syntax keywords (`component`, `state`, `mount`, `effect`, etc.) that TypeScript does not understand. These keywords are sugar — the compiler expands them into valid TypeScript class patterns before TypeScript sees the file. The compiler is intentionally **not** a full parser: Phase 1 is string-based, which keeps it fast and avoids a full grammar dependency.

---

## Phase 1 — Lexical preprocessing

`preprocessSwissSyntax(source, filePath)` transforms Swiss keywords into TypeScript using regex replacements and brace-depth counting.

| Swiss input | TypeScript output |
|---|---|
| `component Name {}` | `export class Name extends SwissComponent {}` |
| `state { let x: T = v }` | `private _x$: Signal<T> = new Signal<T>(v);` + getter/setter |
| `reactive let x: T` | `private x: T` (reactive via Proxy) |
| `computed get x()` | `private get x()` |
| `mount {}` | `private mounted() {}` |
| `unmount {}` | `private unmounted() {}` |
| `effect {}` | `private effect() {}` |
| `props = {}` | `static propTypes = {}` (off instance, sanitized) |
| `@requires('cap')` | Capability decorator annotation |

`state {}` blocks use character-level brace-depth counting instead of regex to correctly handle nested object literals in initializers (fix for CG-04).

---

## Phase 2 — TypeScript AST transformation

`swissSyntaxTransformer()` is a TypeScript `TransformerFactory` that runs on the Phase 1 output:

- **Props field relocation**: Any `props = { ... }` instance field on a `SwissComponent` subclass is moved to `static propTypes = { ... }`. This prevents the class field initializer from overwriting `this.props` set by `BaseComponent`'s constructor.
- **PropTypes sanitization**: TypeScript type keyword values in `propTypes` literals (`string`, `number`, `object`) are replaced with safe JS runtime equivalents (CG-05).
- **Import injection**: If the source uses `extends SwissComponent` and has no `@swissjs/core` import, Phase 2 adds one.

---

## Phase 3 — JSX transformation (`.uix` only)

`.uix` files receive an additional JSX transform via `@babel/plugin-transform-react-jsx` with `jsxImportSource: '@swissjs/core'`. This converts JSX syntax to `jsx()` and `jsxs()` calls from `@swissjs/core/jsx-runtime`.

`.ui` files do not receive this transform — they use `html\`\`` tagged templates for markup.

---

## Import processing

After Swiss keyword expansion, `processImports()` rewrites import paths:

- Ensures `.js` extensions for local TypeScript imports (ESM compatibility)
- Resolves workspace package aliases

---

## File extension dispatch

| Extension | Phase 1 | Phase 2 | JSX |
|---|---|---|---|
| `.ui` | ✓ | ✓ | ✗ |
| `.uix` | ✓ | ✓ | ✓ |
| `.ts` | ✗ | ✗ | ✗ |

---

## Integration

The compiler runs at two points in the toolchain:

1. **Development** — `@swissjs/swite` intercepts `.ui`/`.uix` requests and pipes them through `UiCompiler.compileAsync()` before serving
2. **Production** — `swiss build` uses Swite's build engine which runs the same compiler pipeline ahead of the esbuild bundle step

You do not call the compiler directly from application code.

---

## See also

- [Transformers reference](./transformers.md) — per-module detail
- [`compiler/README.md`](../../compiler/README.md) — package-level API documentation
- [Reactivity model](../concepts/reactivity-model.md) — what `state {}` generates and how Signals work
