/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from "vitest";
import { preprocessSwissSyntax } from "../src/transformers/swiss-syntax";

describe("Signal-backed state transforms (Problem B)", () => {
  it("transforms state with initializer into Signal getter/setter", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component Counter {
  state { let count: number = 0; }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    // Signal field
    expect(result).toContain("private _count$: Signal<number> = new Signal<number>(0)");
    // Getter
    expect(result).toContain("private get count(): number { return this._count$.value; }");
    // Setter
    expect(result).toContain("private set count(v: number) { this._count$.value = v; }");
    // No plain private field
    expect(result).not.toMatch(/private count: number/);
  });

  it("transforms state with string initializer", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component App {
  state { let view: string = 'checking'; }
}
`;
    const result = preprocessSwissSyntax(source, "App.uix");

    expect(result).toContain("Signal<string>('checking')");
    expect(result).toContain("private get view(): string");
    expect(result).toContain("private set view(v: string)");
  });

  it("transforms state with array initializer", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
import type { AlpineModule } from '@alpine/core';
component Shell {
  state { let modules: AlpineModule[] = []; }
}
`;
    const result = preprocessSwissSyntax(source, "Shell.uix");

    expect(result).toContain("Signal<AlpineModule[]>([])");
    expect(result).toContain("private get modules(): AlpineModule[]");
    expect(result).toContain("private set modules(v: AlpineModule[])");
  });

  it("transforms state without initializer", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component Foo {
  state { let name: string; }
}
`;
    const result = preprocessSwissSyntax(source, "Foo.uix");

    expect(result).toContain("Signal<string>(undefined as unknown as string)");
    expect(result).toContain("private get name(): string");
    expect(result).toContain("private set name(v: string)");
  });

  it("injects Signal into existing @swissjs/core import", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component Counter {
  state { let count: number = 0; }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    expect(result).toContain("Signal } from '@swissjs/core'");
    expect(result).not.toMatch(/import \{ Signal \} from '@swissjs\/core'.*import \{ Signal \}/s);
  });

  it("does not double-inject Signal if already imported", () => {
    const source = `
import { SwissComponent, Signal } from '@swissjs/core';
component Counter {
  state { let count: number = 0; }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    const signalImportCount = (result.match(/\bSignal\b/g) || []).filter(
      (_, i, arr) => i === arr.indexOf("Signal"),
    ).length;
    // Signal should appear in the import and in the generated code — not duplicated in import
    const importLine = result.split("\n").find((l) => l.includes("from '@swissjs/core'")) ?? "";
    const importSignalCount = (importLine.match(/\bSignal\b/g) || []).length;
    expect(importSignalCount).toBe(1);
  });

  it("transforms multiple state blocks in one component", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component App {
  state { let view: string = 'checking'; }
  state { let loading: boolean = false; }
}
`;
    const result = preprocessSwissSyntax(source, "App.uix");

    expect(result).toContain("Signal<string>('checking')");
    expect(result).toContain("Signal<boolean>(false)");
    expect(result).toContain("private get view(): string");
    expect(result).toContain("private get loading(): boolean");
  });

  it("does not affect state-less components", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component Pure {
  render() { return null; }
}
`;
    const result = preprocessSwissSyntax(source, "Pure.uix");

    expect(result).not.toContain("Signal");
    expect(result).not.toContain("new Signal");
  });
});
