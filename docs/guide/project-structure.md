# Project structure

Conventions for SwissJS application and monorepo layout.

---

## Application layout

A standard SwissJS application:

```
my-app/
├── src/
│   ├── main.ui               # entry point — calls SwissApp.mount()
│   ├── App.ui                # root component
│   ├── components/           # reusable UI components (.ui / .uix)
│   ├── routes/               # file-based routes (if using plugin-file-router)
│   │   ├── index.ui          # → /
│   │   ├── about.ui          # → /about
│   │   └── user/
│   │       └── [id].ui       # → /user/:id
│   ├── context/              # SwissContext definitions
│   ├── types/                # shared TypeScript types
│   └── utils/                # non-component utilities
├── public/                   # static assets (copied verbatim to dist/)
├── dist/                     # production build output (gitignored)
├── package.json
├── tsconfig.json
└── swissjs.config.ts         # optional
```

---

## File extension conventions

| Extension | Use for |
|---|---|
| `.ui` | Components using `html\`\`` template literals, utilities, types, context |
| `.uix` | Components using JSX syntax (requires `jsxImportSource: '@swissjs/core'`) |
| `.ts` | Plain TypeScript that does not import SwissJS syntax |

`.ui` files that contain a `component Name {}` declaration are compiled by the Swiss syntax transformer. `.ui` files without a component declaration are treated as plain TypeScript modules.

---

## Component file conventions

One component per file. File name matches the component name in PascalCase.

```
Counter.ui      → component Counter {}
UserCard.ui     → component UserCard {}
```

State and helpers that are only used by one component stay in the same file. Shared helpers go to `utils/` as plain `.ts` or `.ui` modules.

---

## swiss-lib monorepo layout

The swiss-lib repo uses a flat workspace topology:

```
swiss-lib/
├── runtime/           # @swissjs/core
├── compiler/          # @swissjs/compiler
├── shared/            # @swissjs/shared
├── router/            # @swissjs/router
├── css/               # @swissjs/css
├── components/        # @swissjs/components
├── security/          # @swissjs/security
├── cli/               # @swissjs/cli
├── plugins/
│   ├── file-router/   # @swissjs/plugin-file-router
│   └── web-storage/   # @swissjs/plugin-web-storage
├── language/          # language spec scaffold (no package yet)
├── internal/          # internal build tooling scaffold
├── devtools/          # devtools apps (capability-explorer, runtime inspector, etc.)
├── docs/              # documentation source
├── apps/              # internal demo/test apps
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── turbo.json
```

Each package has its own `tsconfig.json` extending `../tsconfig.base.json`.

---

## Import discipline

- Import from package barrels only: `import { X } from '@swissjs/core'`
- No deep imports: `@swissjs/core/src/component/base-component` is not allowed
- Local ESM imports must use explicit `.js` extensions: `import { foo } from './utils.js'`
- Cross-package imports must go through `workspace:*` dependencies declared in `package.json`
