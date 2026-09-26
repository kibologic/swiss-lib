// ROUTER-LAZY-SSR-TYPING: vitest never type-checks (it transpiles each file in isolation
// and runs it), so a break like #141's (Route.component widened to `ComponentLike |
// LazyComponent`, but server-renderer.ts kept passing it straight into createElement,
// which only accepts `ComponentLike`) can merge with every vitest suite green while
// `tsc -b router` fails with TS2769. This test closes that gap by making `tsc --noEmit`
// itself part of "did the tests pass" for anyone running `vitest` directly (CI or a
// developer), not only for whoever remembers to separately run the root `type-check`
// script (`turbo run type-check`, wired from each package's own `type-check` npm script --
// router did not even have one before this task) or `prepush:checks`.
//
// Scope: router AND runtime. Runtime is where `ComponentType`/`createElement`/
// `isComponentVNode` live -- the other half of exactly this kind of break (a router-side
// type widened, or a runtime-side signature narrowed, without updating the other side).
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

// `-b` (build/project-reference mode), not `--noEmit -p`: router's tsconfig declares a
// project `reference` to `../runtime` (composite), and plain `--noEmit -p router` reports
// spurious TS6305 "Output file ... has not been built from source file ..." errors
// whenever runtime's dist/*.d.ts happens to be stale or absent -- which is the normal state
// on a fresh clone/worktree before anything has been built. `-b` builds referenced
// projects first (as `tsc -b` always does), so this reports only REAL type errors
// regardless of what dist/ happens to contain when the test runs. Emitting dist output as
// a side effect of a type-check is what `tsc -b` does everywhere else in this repo (the
// router/runtime `build` scripts are `tsc -b` too); it is harmless here since tests only
// ever run inside a disposable worktree, never the shared main clone.
function typeCheck(projectDir: string): void {
  try {
    execFileSync(process.execPath, [tscBin, "-b", projectDir], {
      cwd: projectDir,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(
      `tsc -b reported type errors in ${projectDir}:\n${stdout}${stderr}`,
    );
  }
}

describe("TS type-check gate (vitest does not type-check on its own)", () => {
  // Building router (`tsc -b`) also builds/type-checks its `../runtime` project reference
  // first, so this one call covers BOTH halves of the router<->runtime type contract that
  // #141 broke (Route.component widened in router without server-renderer.ts's
  // createElement call site being updated to match) -- a single, lightest-weight gate
  // rather than two separate builds.
  it(
    "router (and its runtime project reference) type-checks cleanly via tsc -b",
    () => {
      expect(() => typeCheck(path.resolve(repoRoot, "router"))).not.toThrow();
    },
    120_000,
  );
});
