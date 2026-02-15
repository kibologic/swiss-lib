import { describe, it, expect } from "vitest";
import { UiCompiler } from "../src/compiler.js";
import fs from "fs/promises";
import path from "path";

describe("JSDoc Stripping - Real World Test", () => {
  const compiler = new UiCompiler();

  it("should strip JSDoc from actual modules/index.ui structure", async () => {
    const input = `/**
 * Alpine Enterprise Business Modules
 * Registers all business/domain modules for the Alpine POS application
 * 
 * Each module bundles one or more packages under a unified context
 * Modules appear in the Shell sidebar and can be switched between
 */

import { ModuleRegistry } from '@alpine/skltn'
import { posModule } from './pos.uix'
import { accountingModule } from './accounting.uix'

/**
 * Register all business modules for Alpine app
 * This is called during app initialization (before mounting)
 * 
 * Alpine POS app currently has:
 * - POS module (bundles: cart + inventory + payments)
 * - Accounting module (financial management, invoicing, expenses, reports)
 * 
 * Future modules:
 * - Settings module (bundles: identity + security + i18n)
 * - etc.
 */
export function registerBusinessModules() {
  console.log('[Alpine] Registering business modules...')
}`;

    const result = await compiler.compileAsync(input, "modules/index.ui");

    console.log("=== INPUT ===");
    console.log(input.substring(0, 200));
    console.log("\n=== OUTPUT ===");
    console.log(result.substring(0, 200));
    console.log("\n=== CONTAINS /** ? ===", result.includes("/**"));
    console.log(
      '=== CONTAINS "Alpine Enterprise" ? ===',
      result.includes("Alpine Enterprise"),
    );

    expect(result).not.toContain("/**");
    expect(result).not.toContain("Alpine Enterprise Business Modules");
    expect(result).toContain("import { ModuleRegistry }");
    expect(result).toContain("export function registerBusinessModules");
  });

  it("should output clean code without JSDoc for debugging", async () => {
    const simpleInput = `/**
 * Test
 */
export class Test {}`;

    const result = await compiler.compileAsync(simpleInput, "test.ui");

    console.log("\n=== SIMPLE TEST ===");
    console.log("Input:", simpleInput);
    console.log("Output:", result);
    console.log("Has JSDoc?", result.includes("/**"));

    expect(result).not.toContain("/**");
  });
});
