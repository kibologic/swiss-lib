# @swissjs/cli

The `swiss` command-line tool. Wraps `@swissjs/swite` for dev and build, and provides scaffolding, compilation, and workspace commands.

---

## Installation

Installed as part of a SwissJS project:

```bash
npm create swissjs@latest my-app
# swiss is available in the project
```

Or globally:

```bash
npm install -g @swissjs/cli
```

---

## Commands

### `swiss dev`

Start the development server (delegates to `@swissjs/swite`).

```bash
swiss dev
swiss dev --port 4000
swiss dev --host 0.0.0.0
swiss dev --no-open          # don't open browser
swiss dev --hmr-port 24678   # explicit HMR WebSocket port
```

### `swiss build`

Build the project for production.

```bash
swiss build
swiss build --out-dir build
swiss build --mode production
swiss build --sourcemap
swiss build --analyze          # bundle size analysis
swiss build --no-clean         # skip dist/ cleanup
swiss build --debug            # verbose build logging
```

Reads `swissjs.config.ts` (or `package.json` `swissjs` key) for build configuration.

### `swiss create`

Scaffold a new SwissJS project interactively.

```bash
swiss create
swiss create my-app
```

Prompts for project name, template type (component / library / plugin), and configuration options.

### `swiss compile`

Run the Swiss compiler standalone on a file or directory.

```bash
swiss compile src/Counter.ui --out-dir dist
swiss compile src/ --out-dir dist --watch
```

### `swiss serve`

Preview the production build locally.

```bash
swiss serve
swiss serve --port 4173
```

Serves `dist/` with a static file server.

### `swiss forge`

Scaffold a new plugin project.

```bash
swiss forge my-plugin
```

### `swiss create-plugin`

Interactive plugin creation wizard.

```bash
swiss create-plugin
```

### `swiss workspace`

Workspace management utilities for monorepos.

```bash
swiss workspace list           # list all packages
swiss workspace link           # link local packages
```

---

## Configuration

`swissjs.config.ts` at the project root:

```typescript
import type { SwissJSConfig } from '@swissjs/cli';

export default {
  type: 'component',        // 'component' | 'library' | 'plugin'
  build: {
    entry: 'src/main.ui',
    outDir: 'dist',
    publicDir: 'public',
    minify: true,
    sourcemap: false,
    external: ['react'],
    assets: true,
    html: true,
  },
} satisfies SwissJSConfig;
```

---

## Binary

```json
{ "bin": { "swiss": "tsx src/index.ts" } }
```

The CLI uses `tsx` for runtime TypeScript execution. Commands are defined with `commander`.

---

## Internal structure

```
cli/src/
├── index.ts         # CLI entry — registers all commands with commander
├── main.ts          # process setup
├── commands/
│   ├── dev.ts       # swiss dev → SwiteServer
│   ├── build.ts     # swiss build → Swite build pipeline
│   ├── create.ts    # swiss create → project scaffold
│   ├── compile.ts   # swiss compile → UiCompiler
│   ├── serve.ts     # swiss serve → static file server
│   ├── forge.ts     # swiss forge → plugin scaffold
│   ├── create-plugin.ts
│   └── workspace.ts
├── forge/           # forge templates
├── server/          # dev server helpers (express + proxy)
├── types/           # CLI-specific types
├── utils/           # path, fs helpers
└── workspace/       # workspace resolution utilities
```
