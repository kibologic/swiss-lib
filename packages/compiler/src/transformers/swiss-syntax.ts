/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import * as ts from "typescript";

/**
 * Transformer for Swiss keyword syntax:
 * - `component ComponentName { }` → `export class ComponentName extends SwissComponent { }`
 * - `@capability('cap1', 'cap2')` → proper decorator syntax
 * - `state { let prop: type; }` → `private prop: type;`
 * - `export let prop: type;` → `private prop: type;` (as component props)
 * - `reactive let prop: type;` → `private prop: type;` with reactivity
 * - `computed get prop() { }` → `private get prop() { }`
 * - `effect { }` → `private effect() { }`
 * - `mount { }` → `private mounted() { }` (lifecycle hook; does not override public mount(container))
 * - `unmount { }` → `private unmount() { }`
 */

export interface SwissSyntaxOptions {
  enableReactivity?: boolean;
  enableCapabilities?: boolean;
  enableLifecycle?: boolean;
  enableComputed?: boolean;
}

/**
 * Phase 1: Lexical transformation (string-based preprocessing)
 * Converts Swiss syntax to valid TypeScript before AST parsing
 */
export function preprocessSwissSyntax(
  source: string,
  filePath?: string,
): string {
  // Validate: Block <style> tags in .ui and .uix files
  const styleTagRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const styleTagMatches = source.match(styleTagRegex);

  if (styleTagMatches && styleTagMatches.length > 0) {
    const fileName = filePath ? ` in ${filePath}` : "";
    const errorMessage =
      `[SWISS] ❌ Style tags are not allowed in .ui/.uix files${fileName}.\n\n` +
      `Found ${styleTagMatches.length} style tag(s). Please:\n` +
      `1. Extract styles to a CSS file in the project's css/ directory\n` +
      `2. Link the CSS file in your setup file (index.html/index.ui/app.ui/main.ui)\n` +
      `3. Use CSS custom properties (--variable-name) for design tokens\n\n` +
      `Example:\n` +
      `  ❌ <style>{...}</style>\n` +
      `  ✅ <link rel="stylesheet" href="/css/components.css" />\n\n` +
      `Style attributes on HTML elements (like Tailwind classes) are allowed.\n` +
      `Only <style> tags are blocked.\n`;

    throw new Error(errorMessage);
  }

  let result = source;

  // Transform component declarations
  // component ComponentName { } → export class ComponentName extends SwissComponent { }
  result = result.replace(
    /\bcomponent\s+(\w+)\s*\{/g,
    "export class $1 extends SwissComponent {",
  );

  // Transform state blocks
  // state { let prop: type; } → private prop: type;
  result = result.replace(
    /\bstate\s*\{\s*let\s+(\w+)\s*:\s*([^;]+);?\s*\}/g,
    "private $1: $2;",
  );

  // Transform state blocks with initialization
  // state { let prop: type = value; } → private prop: type = value;
  result = result.replace(
    /\bstate\s*\{\s*let\s+(\w+)\s*:\s*([^=]+)\s*=\s*([^;]+);?\s*\}/g,
    "private $1: $2 = $3;",
  );

  // Transform reactive variables
  // reactive let prop: type; → private prop: type;
  result = result.replace(
    /\breactive\s+let\s+(\w+)\s*:\s*([^;=]+);/g,
    "private $1: $2;",
  );

  // Transform reactive variables with initialization
  // reactive let prop: type = value; → private prop: type = value;
  result = result.replace(
    /\breactive\s+let\s+(\w+)\s*:\s*([^=]+)\s*=\s*([^;]+);/g,
    "private $1: $2 = $3;",
  );

  // Transform computed properties
  // computed get prop() { } → private get prop() { }
  result = result.replace(/\bcomputed\s+get\s+(\w+)\s*\(/g, "private get $1(");

  // Transform lifecycle hooks - mount (emit "mounted" to avoid clashing with base mount(container))
  // mount { ... } → private mounted() { ... }
  result = result.replace(/\bmount\s*\{/g, "private mounted() {");

  // Transform lifecycle hooks - unmount
  // unmount { ... } → private unmount() { ... }
  result = result.replace(/\bunmount\s*\{/g, "private unmount() {");

  // Transform lifecycle hooks - effect
  // effect { ... } → private effect() { ... }
  result = result.replace(/\beffect\s*\{/g, "private effect() {");

  // Transform component props (export let inside component)
  // This is a bit tricky - we need to handle export let as component props
  // For now, transform to private (proper prop handling needs runtime support)
  result = result.replace(
    /\bexport\s+let\s+(\w+)\s*:\s*([^;=]+);/g,
    "private $1: $2; // component prop",
  );

  result = result.replace(
    /\bexport\s+let\s+(\w+)\s*:\s*([^=]+)\s*=\s*([^;]+);/g,
    "private $1: $2 = $3; // component prop",
  );

  return result;
}

/**
 * Phase 2: AST transformation
 * Adds necessary imports and performs additional transformations
 */
export function swissSyntaxTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    const factory = context.factory;

    return (sourceFile: ts.SourceFile) => {
      // Check if file needs Swiss imports (has SwissComponent reference)
      const sourceText = sourceFile.getFullText();
      const needsSwissImports = sourceText.includes("extends SwissComponent");

      if (!needsSwissImports) {
        return sourceFile;
      }

      // Check if imports already exist
      const hasSwissImports =
        sourceText.includes('from "@swissjs/core"') ||
        sourceText.includes("from '@swissjs/core'");

      if (hasSwissImports) {
        return sourceFile;
      }

      // Add Swiss imports at the top
      const swissImport = createSwissImports(factory);
      const newStatements = [swissImport, ...sourceFile.statements];

      return factory.updateSourceFile(sourceFile, newStatements);
    };
  };
}

/**
 * Utility function to create Swiss component imports
 */
export function createSwissImports(
  factory: ts.NodeFactory,
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("SwissComponent"),
        ),
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("createSignal"),
        ),
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier("createEffect"),
        ),
      ]),
    ),
    factory.createStringLiteral("@swissjs/core"),
  );
}

/**
 * Main transformer function that processes Swiss syntax files
 * Combines Phase 1 (lexical) and Phase 2 (AST) transformations
 */
export function transformSwissSyntax(
  source: string,
  fileName: string = "source.ui",
  _options: SwissSyntaxOptions = {},
): string {
  // Phase 1: Lexical transformation
  const preprocessed = preprocessSwissSyntax(source, fileName);

  // Phase 2: AST transformation
  const sourceFile = ts.createSourceFile(
    fileName,
    preprocessed,
    ts.ScriptTarget.Latest,
    true,
  );

  const result = ts.transform(sourceFile, [swissSyntaxTransformer()]);
  const printer = ts.createPrinter();
  const output = printer.printFile(result.transformed[0] as ts.SourceFile);
  result.dispose();

  return output;
}
