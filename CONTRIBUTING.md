# Contributing

## Development setup

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # run all tests
pnpm dev          # watch mode
```

---

## Branch model

```
main         production — protected, no direct commits
staging      pre-release
development  integration branch — all feature work merges here first
feature/*    short-lived; cut from development, merged back via PR
```

Every change follows this sequence:

```bash
git checkout development && git pull origin development
git checkout -b feature/<task-name>
# ... work ...
git add <specific files>
git commit -m "type(scope): description"
git push origin feature/<task-name>

# After PR approval:
git checkout development && git merge feature/<task-name> && git push origin development
git checkout staging    && git merge development          && git push origin staging
git checkout main       && git merge staging              && git push origin main
git checkout development
```

---

## Commit format

```
type(scope): short description
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`

Scope matches the package directory: `runtime`, `compiler`, `router`, `security`, `cli`, `components`, `css`

---

## Package structure

Each package is under its own directory with a `package.json` and `tsconfig.json`. Build outputs go to `dist/`.

Changes to the compiler (`compiler/`) require updating the language spec in `language/` if grammar or AST contracts change.

---

## Testing

Tests live in `<package>/tests/` or `<package>/src/**/*.test.ts`. Run with `pnpm test` at repo root.

All compiler changes require test coverage for the new syntax path.
