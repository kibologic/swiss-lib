# @swissjs/compiler

Swiss syntax compiler. Transforms `.ui` and `.uix` source files through a two-phase pipeline: lexical preprocessing followed by TypeScript AST transformation.

---

## Compilation Pipeline

```
source.ui / source.uix
        │
        ▼
Phase 1: preprocessSwissSyntax()          (lexical / regex-based)
  - component Name {} → export class Name extends SwissComponent {}
  - state { let x: T = v } → Signal<T> getter/setter pair
  - reactive let x: T → private reactive property
  - computed get x() → private getter
  - mount {} → mounted() lifecycle method
  - unmount {} → unmounted() lifecycle method
  - effect {} → private effect() method
  - props = {} → static propTypes = {}
  - @requires('cap') → capability decorator
        │
        ▼
Phase 2: swissSyntaxTransformer()         (TypeScript AST)
  - Moves props = {} off instance → static propTypes
  - Sanitizes TS type keyword values in propTypes (CG-05)
  - Injects @swissjs/core imports when SwissComponent is used
        │
        ▼  (for .uix files only)
JSX Transform: transformWithJsx()
  - Transforms JSX using @babel/plugin-transform-react-jsx
  - jsxImportSource: @swissjs/core
        │
        ▼
  dist/index.js (ESM)
```

---

## Public API

```typescript
import { UiCompiler } from '@swissjs/compiler';
import { preprocessSwissSyntax, transformSwissSyntax, swissSyntaxTransformer } from '@swissjs/compiler';
import type { CompileOptions } from '@swissjs/compiler';
```

### `UiCompiler`

Main compiler class. Handles file I/O, source dispatch, and full pipeline execution.

```typescript
const compiler = new UiCompiler({
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  sourceMap: true,
  jsxImportSource: '@swissjs/core', // default
});

// Compile a file and optionally write output
const js = await compiler.compileFile('src/Counter.ui', 'dist/Counter.js');

// Compile source string
const js = await compiler.compile(source, 'Counter.ui');

// Full async pipeline (includes JSX + TS emit)
const js = await compiler.compileAsync(source, 'Counter.uix');
```

### `preprocessSwissSyntax(source, filePath, jsxImportSource?)`

Phase 1 only — lexical string transformation. Returns valid TypeScript with Swiss keywords expanded. Called internally by `UiCompiler` but also available standalone.

### `transformSwissSyntax(source, fileName?, options?)`

Runs Phase 1 then Phase 2. Returns the printer output of the transformed TypeScript AST. Use when you need the fully normalized TypeScript (e.g., for language tooling or tests).

### `swissSyntaxTransformer()`

TypeScript `TransformerFactory` for Phase 2 AST work. Pass to `ts.transform()` alongside other transformers.

---

## Swiss Keyword Transformations

### `component Name {}`

```typescript
// Input (.ui)
component Counter {
  render() { ... }
}

// Output (TypeScript)
export class Counter extends SwissComponent {
  render() { ... }
}
```

### `state { let x: T = v }`

Generates a `Signal<T>`-backed getter/setter pair. Nested object literals in initializers are handled via brace-depth counting (not regex) to avoid CG-04.

```typescript
// Input
state {
  let count: number = 0;
}

// Output
private _count$: Signal<number> = new Signal<number>(0);
private get count(): number { return this._count$.value; }
private set count(v: number) { this._count$.value = v; }
```

### `computed get x()`

```typescript
// Input
computed get doubled() {
  return this.count * 2;
}

// Output
private get doubled() {
  return this.count * 2;
}
```

### `mount {}` / `unmount {}` / `effect {}`

```typescript
// Input        →  Output
mount {}        →  private mounted() {}
unmount {}      →  private unmounted() {}
effect {}       →  private effect() {}
```

Async variants (`async mount {}`) are preserved.

### `props = {}`

Moved off instance to `static propTypes = {}` by Phase 2 AST transformer. TS type keyword values (`string`, `number`, `object`, etc.) in propTypes are sanitized to their JS runtime equivalents (CG-05).

---

## `CompileOptions`

```typescript
interface CompileOptions {
  target?: ts.ScriptTarget;           // default: ES2020
  module?: ts.ModuleKind;             // default: ESNext
  sourceMap?: boolean;                // default: true
  jsxImportSource?: string;           // default: '@swissjs/core'
  outDir?: string;
}
```

---

## Transformer Modules

| File | Phase | Responsibility |
|---|---|---|
| `transformers/swiss-syntax.ts` | 1 + 2 | All Swiss keyword transformations |
| `transformers/import-processor.ts` | 1 | Import path rewriting |
| `transformers/jsx-transformer.ts` | JSX | Babel JSX transform for `.uix` |
| `transformers/type-syntax-stripper.ts` | 1 | Strip type annotations for runtime |
| `transformers/capability-annot.ts` | 1 | `@requires` → capability decorator |
| `transformers/diagnostics.ts` | — | Diagnostic error codes |

---

## Usage in the Build Pipeline

`@swissjs/swite` (the dev server and build tool) calls `UiCompiler` internally for every `.ui` and `.uix` file it serves or bundles. You do not typically call the compiler directly in application code.

For CLI-level compilation use `swiss compile`.
