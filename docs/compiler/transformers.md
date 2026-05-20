# Transformer reference

Per-module breakdown of every transformer in `@swissjs/compiler/src/transformers/`.

---

## swiss-syntax.ts

The primary transformer. Exports three functions:

### `preprocessSwissSyntax(source, filePath, jsxImportSource?)` — Phase 1

String-based lexical transformation. Runs first. Returns a string of valid TypeScript.

Transformations in order:

1. **Component declaration** — `component Name {}` → `export class Name extends SwissComponent {}`
2. **State blocks** — each `state { let x: T = v }` block is replaced by a Signal-backed getter/setter triple via `transformStateBlocks()`. Uses character-level brace-depth counting so nested `{}` in initializers (e.g. `{ key: true }`) are handled correctly.
3. **Reactive variables** — `reactive let x: T = v` → `private x: T = v`
4. **Computed getters** — `computed get x()` → `private get x()`
5. **Lifecycle hooks** — `mount {}` → `private mounted() {}`, `unmount {}` → `private unmounted() {}`, `effect {}` → `private effect() {}`
6. **Props field** — `props = { ... }` → `static propTypes = { ... }` (preliminary regex pass; Phase 2 AST finalizes this)
7. **Export let** (props) — `export let x: T` → `private x: T` inside component body
8. **Implicit class wrap** — `.ui` files without an explicit `component` declaration have their non-import body wrapped in `export default class extends SwissComponent { ... }`

### `swissSyntaxTransformer()` — Phase 2

TypeScript `TransformerFactory<SourceFile>`. Runs on the Phase 1 output via `ts.transform()`.

- Walks all `ClassDeclaration` and `ClassExpression` nodes
- On any `SwissComponent` subclass: calls `transformPropsField()` which converts `props = { ... }` instance fields to `static propTypes = { ... }` with `sanitizePropTypesInitializer()`
- Injects `import { SwissComponent, createSignal, createEffect } from '@swissjs/core'` when `extends SwissComponent` is present and no core import exists

### `transformSwissSyntax(source, fileName?, options?)` — Combined

Runs Phase 1 then Phase 2 and prints the result using `ts.createPrinter()`. Used in tests and language tooling.

---

## import-processor.ts

### `processImports(source, filePath)`

Rewrites import specifiers in the Phase 1 output:

- Adds `.js` extension to relative local imports that lack an extension (ESM requirement)
- Leaves bare specifiers (npm packages) untouched
- Handles both `import ... from` and `export ... from` forms

---

## jsx-transformer.ts

### `transformWithJsx(source, filePath, jsxImportSource)`

Runs only for `.uix` files. Uses `@babel/core` with `@babel/plugin-transform-react-jsx` to convert JSX syntax:

```tsx
// Input
<button onClick={handler}>{label}</button>

// Output
jsx("button", { onClick: handler }, label)
```

`jsxImportSource` defaults to `@swissjs/core`. The transform imports `jsx`/`jsxs`/`Fragment` from `@swissjs/core/jsx-runtime`.

---

## type-syntax-stripper.ts

Strips TypeScript type annotations from certain patterns that survive Phase 1 and would confuse the JSX transform. This is a targeted pass — full TS emit happens via `compileAsync()` using `ts.transpileModule()`.

---

## capability-annot.ts

Handles `@requires('capability')` annotations. Normalizes the decorator into the form the runtime capability system expects during component registration.

---

## diagnostics.ts

Diagnostic error codes emitted by the compiler. Used when invalid Swiss syntax is detected during Phase 1.

| Code | Description |
|---|---|
| SWISS_001 | Component declaration missing name |
| SWISS_002 | `state {}` block with invalid `let` declaration |
| SWISS_003 | `computed get` without a valid getter body |
| SWISS_004 | `@requires` with non-string argument |

---

## utils/

### `file-utils.ts`
- `findFiles(dir, extensions)` — recursive file scan
- `ensureDirectoryExists(dir)` — mkdir -p wrapper

### `typescript-utils.ts`
- `findTypeScriptFiles(dir)` — finds `.ts`, `.ui`, `.uix`
- `compileTypeScriptToJavaScript(source, options)` — `ts.transpileModule()` wrapper used in `compileAsync()`
