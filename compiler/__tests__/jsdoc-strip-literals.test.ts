import { describe, it, expect } from "vitest";
import { UiCompiler } from "../src/compiler.js";

// Regression coverage for DISC-2026-08-24-001: stripJSDocComments() used to
// scan raw source with /\/\*\*[\s\S]*?\*\//g, with no awareness of // line
// comments, string/template/regex literals. A "/**" appearing inside any of
// those (e.g. a glob like `queue/**/*.yaml` inside a // comment) opened a
// false "JSDoc" block that ate everything up to the NEXT literal "*/"
// anywhere later in the file (e.g. a genuine trailing JSDoc block's closer),
// silently deleting all the real code in between. This is exactly what
// happened to office's RegistryPage.uix in August 2026: the false opener and
// a later real "*/" bracketed ~120 lines of real code that got deleted.
//
// Every case below therefore includes a genuine JSDoc block *after* the
// suspect construct, so the buggy non-literal-aware regex has a real "*/" to
// pair with and actually deletes the code in between -- reproducing the bug
// rather than accidentally no-op'ing because there's nothing to close on.
describe("JSDoc Comment Stripping - literal awareness (DISC-2026-08-24-001)", () => {
  const compiler = new UiCompiler();

  it("does not delete code across a /** inside a // line comment", async () => {
    const input = `// see queue/**/*.yaml for the task schema
export class Test {
  value = 42;
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain("// see queue/**/*.yaml for the task schema");
    expect(result).toContain("export class Test");
    expect(result).toContain("value = 42");
    expect(result).toContain("export class After");
  });

  it("does not delete code across a /** inside a single-quoted string", async () => {
    const input = `const glob = '/**';
export class Test {
  value = 1;
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain("const glob = '/**'");
    expect(result).toContain("export class Test");
    expect(result).toContain("value = 1");
    expect(result).toContain("export class After");
  });

  it("does not delete code across a /** inside a double-quoted string", async () => {
    const input = `const glob = "/**";
export class Test {
  value = 2;
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain('const glob = "/**"');
    expect(result).toContain("export class Test");
    expect(result).toContain("value = 2");
    expect(result).toContain("export class After");
  });

  it("does not delete code across a /** inside a template literal, and preserves interpolation", async () => {
    const input = `const name = "world";
const msg = \`glob is /** and name is \${name}\`;
export class Test {
  value = 3;
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain("glob is /**");
    expect(result).toContain("${name}");
    expect(result).toContain("export class Test");
    expect(result).toContain("value = 3");
    expect(result).toContain("export class After");
  });

  it("does not delete code across a /** inside a regex literal character class", async () => {
    // `/[/**]/` is a valid regex literal (a character class containing the
    // literal chars '/', '*', '*'), whose raw source text contains the
    // 3-char run "/**" without any backslash escaping.
    const input = `const re = /[/**]/;
export class Test {
  value = 4;
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain("export class Test");
    expect(result).toContain("value = 4");
    expect(result).toContain("export class After");
  });

  it("still strips a real JSDoc block", async () => {
    const input = `/**
 * Real JSDoc comment.
 */
export class Test {
  value = 5;
}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Real JSDoc comment");
    expect(result).toContain("export class Test");
    expect(result).toContain("value = 5");
  });

  it("leaves the source unchanged when a /** block is unterminated (never deletes to EOF)", async () => {
    const input = `export class Test {
  value = 6;
}
/** unterminated comment with no closing
export class NeverDeleted {
  value = 7;
}`;

    const result = await compiler.compile(input, "test.ui");

    // Nothing after the unterminated /** may be silently deleted.
    expect(result).toContain("export class NeverDeleted");
    expect(result).toContain("value = 7");
  });

  it("does not delete real code after a false JSDoc opener, through compileAsync, for .ui files", async () => {
    const input = `// glob pattern: queue/**/*.yaml
export class RegistryPage {
  render() {
    return true;
  }
}
/**
 * trailing real doc
 */
export class After {}`;

    const result = await compiler.compileAsync(input, "RegistryPage.ui");

    expect(result).toContain("export class RegistryPage");
    expect(result).toContain("render()");
    expect(result).toContain("return true");
  });

  it("does not delete real code after a false JSDoc opener, through compileAsync, for .uix files", async () => {
    const input = `// glob pattern: queue/**/*.yaml
import { createElement } from '@swissjs/core';
export function RegistryPage() {
  return <div>hello-marker-42</div>;
}
/**
 * trailing real doc
 */
export function After() {
  return <div>after</div>;
}`;

    const result = await compiler.compileAsync(input, "RegistryPage.uix");

    expect(result).toContain("RegistryPage");
    expect(result).toContain("hello-marker-42");
  });
});
