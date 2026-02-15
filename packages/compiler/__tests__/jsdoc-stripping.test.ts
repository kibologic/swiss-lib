import { describe, it, expect } from "vitest";
import { UiCompiler } from "../src/compiler.js";

describe("JSDoc Comment Stripping", () => {
  const compiler = new UiCompiler();

  it("should strip single-line JSDoc comments", async () => {
    const input = `/** Single line JSDoc */
export class Test {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("*/");
    expect(result).toContain("export class Test");
  });

  it("should strip multi-line JSDoc comments", async () => {
    const input = `/**
 * Multi-line JSDoc comment
 * With multiple lines
 * @param foo - some param
 */
export function test() {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Multi-line JSDoc");
    expect(result).not.toContain("@param");
    expect(result).toContain("export function test");
  });

  it("should strip multiple JSDoc comments in same file", async () => {
    const input = `/**
 * First JSDoc comment
 */
export class First {}

/**
 * Second JSDoc comment
 */
export class Second {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("First JSDoc");
    expect(result).not.toContain("Second JSDoc");
    expect(result).toContain("export class First");
    expect(result).toContain("export class Second");
  });

  it("should preserve regular block comments", async () => {
    const input = `/* Regular block comment */
export class Test {}`;

    const result = await compiler.compile(input, "test.ui");

    // Regular block comments should be preserved (only /** */ should be stripped)
    expect(result).toContain("/* Regular block comment */");
    expect(result).toContain("export class Test");
  });

  it("should preserve single-line comments", async () => {
    const input = `// Single line comment
export class Test {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).toContain("// Single line comment");
    expect(result).toContain("export class Test");
  });

  it("should handle JSDoc in the middle of code", async () => {
    const input = `export class Test {
  /**
   * Method JSDoc
   */
  method() {
    return true;
  }
}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Method JSDoc");
    expect(result).toContain("method()");
  });

  it("should handle nested asterisks in JSDoc", async () => {
    const input = `/**
 * This has ** double asterisks **
 * And * single ones *
 */
export class Test {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("double asterisks");
    expect(result).toContain("export class Test");
  });

  it("should handle JSDoc at line 3 (the error location)", async () => {
    const input = `// Line 1
// Line 2
/**
 * Line 3 - This is where the error occurs
 */
export class Test {}`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Line 3 - This is where the error occurs");
    expect(result).toContain("// Line 1");
    expect(result).toContain("// Line 2");
    expect(result).toContain("export class Test");
  });

  it("should strip JSDoc from actual cart index.ui file structure", async () => {
    const input = `/**
 * Swiss Enterprise Cart Library
 * Main export barrel for cart components and functionality
 */

// Context Providers
export { PosProvider as CartProvider } from './context/PosContext.uix'`;

    const result = await compiler.compile(input, "test.ui");

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Swiss Enterprise Cart Library");
    expect(result).toContain("// Context Providers");
    expect(result).toContain("export { PosProvider as CartProvider }");
  });
});
