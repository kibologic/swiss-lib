import { describe, it, expect } from "vitest";
import { UiCompiler } from "../src/compiler.js";

describe("JSDoc Stripping - Esbuild Integration", () => {
  const compiler = new UiCompiler();

  it("should strip JSDoc before esbuild processes .ui files", async () => {
    // This is the EXACT structure from ai-agents/src/index.ui
    const input = `/**
 * Swiss Enterprise AI Agents Library
 * AI agent integration for Swiss Enterprise
 * 
 * Migrated to Swiss format
 */

// Context Provider
export { AIAgentsProvider } from './context/AIAgentsContext.uix'`;

    const result = await compiler.compileAsync(
      input,
      "packages/ai-agents/src/index.ui",
    );

    console.log("\n=== AI-AGENTS INDEX.UI TEST ===");
    console.log("Input length:", input.length);
    console.log("Output length:", result.length);
    console.log("Input contains /**?", input.includes("/**"));
    console.log("Output contains /**?", result.includes("/**"));
    console.log("\nFirst 200 chars of output:");
    console.log(result.substring(0, 200));

    // CRITICAL: Must not contain JSDoc
    expect(result).not.toContain("/**");
    expect(result).not.toContain("Swiss Enterprise AI Agents Library");
    expect(result).not.toContain("*/");

    // Should contain the actual code
    expect(result).toContain("export");
    expect(result).toContain("AIAgentsProvider");
  });

  it("should handle JSDoc at the very beginning of file (line 1)", async () => {
    const input = `/**
 * Line 1 JSDoc
 */
export class Test {}`;

    const result = await compiler.compileAsync(input, "test.ui");

    console.log("\n=== LINE 1 JSDOC TEST ===");
    console.log("Output:", result);
    console.log("Has /**?", result.includes("/**"));

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Line 1 JSDoc");
    expect(result).toContain("export");
  });

  it('should strip JSDoc that causes "Unexpected token /" error', async () => {
    // Simulating the exact error scenario
    const input = `/**
 * Test comment
 */
import { something } from './other'`;

    const result = await compiler.compileAsync(input, "test.ui");

    // The output should be valid JavaScript that can be executed
    expect(result).not.toContain("/**");
    expect(result).not.toContain("*/");

    // Should be parseable as JavaScript
    expect(() => {
      // Try to parse as JavaScript to ensure no syntax errors
      new Function(result);
    }).not.toThrow();
  });
});
