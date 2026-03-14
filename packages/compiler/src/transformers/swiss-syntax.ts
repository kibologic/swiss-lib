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
 * - `state { let prop: type = val; }` → Signal<type>-backed getter/setter pair
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
 * Parses the content of a `state { }` block and generates a Signal-backed
 * getter/setter pair. Uses a character-by-character depth counter so that
 * initializers containing nested braces (e.g. `{}`, `{ key: true }`) are
 * captured correctly. Fixes CG-04.
 */
function parseAndReplaceStateBlock(blockContent: string): string {
  const letMatch = /^\s*let\s+(\w+)\s*:\s*/.exec(blockContent);
  if (!letMatch) return `{${blockContent}}`;

  const name = letMatch[1];
  let i = letMatch[0].length;

  // Read type: everything until `=` or `;` at brace-depth 0
  let typeStart = i;
  let depth = 0;
  while (i < blockContent.length) {
    const ch = blockContent[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (depth === 0 && (ch === "=" || ch === ";")) break;
    i++;
  }
  const type = blockContent.slice(typeStart, i).trim();

  if (blockContent[i] !== "=") {
    // No initializer
    return (
      `private _${name}$: Signal<${type}> = new Signal<${type}>(undefined as unknown as ${type});\n` +
      `  private get ${name}(): ${type} { return this._${name}$.value; }\n` +
      `  private set ${name}(v: ${type}) { this._${name}$.value = v; }`
    );
  }

  // Skip '=' and leading whitespace
  i++;
  while (i < blockContent.length && /\s/.test(blockContent[i])) i++;

  // Read initializer: everything until `;` at depth 0
  const initStart = i;
  depth = 0;
  while (i < blockContent.length) {
    const ch = blockContent[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (depth === 0 && ch === ";") break;
    i++;
  }
  const initializer = blockContent.slice(initStart, i).trim();

  return (
    `private _${name}$: Signal<${type}> = new Signal<${type}>(${initializer});\n` +
    `  private get ${name}(): ${type} { return this._${name}$.value; }\n` +
    `  private set ${name}(v: ${type}) { this._${name}$.value = v; }`
  );
}

/**
 * Iterates through `source` replacing every `state { ... }` block using
 * brace-depth counting so the outer closing brace is always found correctly,
 * even when the initializer contains nested object literals. Fixes CG-04.
 */
function transformStateBlocks(source: string): string {
  let result = "";
  let pos = 0;
  const statePattern = /\bstate\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = statePattern.exec(source)) !== null) {
    result += source.slice(pos, match.index);

    // Last char of the match is `{`
    const braceOpen = match.index + match[0].length - 1;
    let depth = 0;
    let braceClose = -1;
    for (let i = braceOpen; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          braceClose = i;
          break;
        }
      }
    }

    if (braceClose === -1) {
      // Malformed block — leave remainder unchanged
      result += source.slice(match.index);
      pos = source.length;
      break;
    }

    const blockContent = source.slice(braceOpen + 1, braceClose);
    result += parseAndReplaceStateBlock(blockContent);
    pos = braceClose + 1;
    statePattern.lastIndex = pos;
  }

  result += source.slice(pos);
  return result;
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

  // Transform state blocks using brace-depth parsing (CG-04)
  // Handles object literal initializers like `{}` and `{ key: true }` that
  // the previous `[^;}]+?` regex could not capture correctly.
  result = transformStateBlocks(result);

  // Inject Signal import when Signal-backed state was generated
  if (result.includes("new Signal<")) {
    const coreImportRegex =
      /import\s*\{([^}]+)\}\s*from\s*['"]@swissjs\/core['"]/;
    const importMatch = result.match(coreImportRegex);
    if (importMatch && !importMatch[1].includes("Signal")) {
      result = result.replace(
        coreImportRegex,
        `import { ${importMatch[1].trim()}, Signal } from '@swissjs/core'`,
      );
    } else if (!importMatch) {
      result = `import { Signal } from '@swissjs/core';\n` + result;
    }
  }

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
  // CG-06: also handle async mount() / mount() with explicit parens, which bypass the brace-only pattern
  // async mount() { ... } → async mounted() { ... }
  result = result.replace(/\basync\s+mount\s*\(\s*\)\s*\{/g, "async mounted() {");
  // mount() { ... } → private mounted() { ... }
  result = result.replace(/\bmount\s*\(\s*\)\s*\{/g, "private mounted() {");
  // mount { ... } → private mounted() { ... }
  result = result.replace(/\bmount\s*\{/g, "private mounted() {");

  // Transform lifecycle hooks - unmount
  // unmount { ... } → private unmount() { ... }
  result = result.replace(/\bunmount\s*\{/g, "private unmount() {");

  // Transform lifecycle hooks - effect
  // effect { ... } → private effect() { ... }
  result = result.replace(/\beffect\s*\{/g, "private effect() {");

  // Transform props declarations (class field) → static propTypes
  // `props = { ... }` at class-body level is a declarative type annotation, not a
  // real instance field. JS class fields run AFTER super(), so leaving it as an
  // instance field would overwrite whatever BaseComponent.constructor set in
  // this.props. Moving it to static removes it from instance initialisation while
  // preserving the type metadata for tooling (SG-05 fix).
  // Match: line that starts with whitespace then `props = {` (no const/let/var).
  result = result.replace(/^(\s+)props(\s*=\s*\{)/gm, "$1static propTypes$2");

  // CG-05: Sanitize TS type keyword values inside static propTypes blocks.
  // `compileAsync` never invokes the AST transformer, so this regex pass handles it.
  // Matches the whole `static propTypes = { ... }` block and replaces any
  // property value that is a bare TS type keyword with its JS runtime equivalent.
  result = result.replace(
    /(\bstatic propTypes\s*=\s*\{)([\s\S]*?)(\})/g,
    (_match, open: string, body: string, close: string) => {
      const sanitized = body.replace(
        /:\s*(object|string|number|boolean|any|unknown|never|void)\b/g,
        (_: string, kw: string): string => {
          const kwMap: Record<string, string> = {
            string: "String",
            number: "Number",
            boolean: "Boolean",
            object: "Object",
            any: "null",
            unknown: "null",
            never: "null",
            void: "null",
          };
          return `: ${kwMap[kw]}`;
        },
      );
      return open + sanitized + close;
    },
  );

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
 * Returns true when a class directly extends SwissComponent.
 */
function extendsSwissComponent(
  node: ts.ClassDeclaration | ts.ClassExpression,
): boolean {
  if (!node.heritageClauses) return false;
  return node.heritageClauses.some(
    (clause) =>
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      clause.types.some((type) => {
        const expr = type.expression;
        return ts.isIdentifier(expr) && expr.text === "SwissComponent";
      }),
  );
}

/**
 * Maps TypeScript type keyword identifiers to safe JS runtime values.
 * Used when emitting propTypes to avoid ReferenceError for lowercase TS keywords
 * like `object`, `string`, `number`, `boolean` which are not valid JS expressions.
 */
const TS_TYPE_KEYWORD_MAP: Record<string, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  object: "Object",
  any: "null",
  unknown: "null",
  never: "null",
  void: "null",
  null: "null",
  undefined: "undefined",
};

/**
 * Given an ObjectLiteralExpression from a `props = { }` block, returns a new
 * ObjectLiteralExpression where any property value that is a TypeScript type
 * keyword identifier (e.g. `object`, `string`) is replaced with its safe JS
 * runtime equivalent (e.g. `Object`, `String`, `null`).
 */
function sanitizePropTypesInitializer(
  initializer: ts.Expression,
  factory: ts.NodeFactory,
): ts.Expression {
  if (!ts.isObjectLiteralExpression(initializer)) return initializer;

  const newProps = initializer.properties.map((prop) => {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.initializer)
    ) {
      const mapped = TS_TYPE_KEYWORD_MAP[prop.initializer.text];
      if (mapped !== undefined) {
        const newValue =
          mapped === "null"
            ? factory.createNull()
            : mapped === "undefined"
            ? factory.createIdentifier("undefined")
            : factory.createIdentifier(mapped);
        return factory.updatePropertyAssignment(prop, prop.name, newValue);
      }
    }
    return prop;
  });

  return factory.updateObjectLiteralExpression(initializer, newProps);
}

/**
 * Transforms `props = { ... }` instance property on a SwissComponent subclass
 * into `static propTypes = { ... }` so it no longer overwrites `this.props`
 * that was set by BaseComponent's constructor.
 *
 * Background: JS class field initializers run after `super()` returns, which
 * means `props = { ... }` would silently clobber whatever BaseComponent wrote
 * into `this.props`. Moving it to a static field preserves the metadata for
 * tooling while keeping instance props exclusively framework-owned.
 *
 * CG-05: TypeScript type keyword values (object, string, etc.) in the props
 * object literal are sanitized to their JS runtime equivalents to prevent
 * ReferenceError at module load time.
 */
function transformPropsField(
  node: ts.ClassDeclaration | ts.ClassExpression,
  factory: ts.NodeFactory,
): ts.ClassDeclaration | ts.ClassExpression {
  if (!extendsSwissComponent(node)) return node;

  const newMembers = node.members.map((member) => {
    if (
      ts.isPropertyDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.initializer !== undefined
    ) {
      const isPropsField =
        member.name.text === "props" &&
        !member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      const isPropTypesField =
        member.name.text === "propTypes" &&
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);

      if (isPropsField) {
        // props = { ... }  →  static propTypes = { ... }
        // Sanitize TS type keyword values → safe JS runtime values (CG-05)
        const safeInitializer = sanitizePropTypesInitializer(member.initializer, factory);
        return factory.updatePropertyDeclaration(
          member,
          [factory.createModifier(ts.SyntaxKind.StaticKeyword)],
          factory.createIdentifier("propTypes"),
          member.questionToken,
          member.type,
          safeInitializer,
        );
      }

      if (isPropTypesField) {
        // Already converted to static propTypes by the regex phase —
        // still needs TS type keyword sanitization (CG-05)
        const safeInitializer = sanitizePropTypesInitializer(member.initializer, factory);
        return factory.updatePropertyDeclaration(
          member,
          member.modifiers,
          member.name,
          member.questionToken,
          member.type,
          safeInitializer,
        );
      }
    }
    return member;
  });

  if (ts.isClassDeclaration(node)) {
    return factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      newMembers,
    );
  } else {
    return factory.updateClassExpression(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      newMembers,
    );
  }
}

/**
 * Phase 2: AST transformation
 * - Moves `props = { ... }` off instance (→ `static propTypes`) on all SwissComponent subclasses
 * - Adds necessary @swissjs/core imports when not already present
 */
export function swissSyntaxTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    const factory = context.factory;

    function visitor(node: ts.Node): ts.VisitResult<ts.Node> {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const transformed = transformPropsField(node, factory);
        return ts.visitEachChild(transformed, visitor, context);
      }
      return ts.visitEachChild(node, visitor, context);
    }

    return (sourceFile: ts.SourceFile) => {
      const sourceText = sourceFile.getFullText();
      const needsSwissImports = sourceText.includes("extends SwissComponent");

      // Always run the props-field transformation pass
      const transformed = ts.visitNode(sourceFile, visitor) as ts.SourceFile;

      if (!needsSwissImports) {
        return transformed;
      }

      // Check if imports already exist
      const hasSwissImports =
        sourceText.includes('from "@swissjs/core"') ||
        sourceText.includes("from '@swissjs/core'");

      if (hasSwissImports) {
        return transformed;
      }

      // Add Swiss imports at the top
      const swissImport = createSwissImports(factory);
      const newStatements = [swissImport, ...transformed.statements];

      return factory.updateSourceFile(transformed, newStatements);
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
