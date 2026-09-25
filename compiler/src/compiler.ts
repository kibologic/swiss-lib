import * as path from "node:path";
import * as ts from "typescript";
import * as fsp from "node:fs/promises";
import { transform } from "esbuild";
import type { CompileOptions } from "./types.js";
import { processImports } from "./transformers/import-processor.js";
import { findFiles, ensureDirectoryExists } from "./utils/file-utils.js";
import {
  findTypeScriptFiles,
  compileTypeScriptToJavaScript as transpileTs,
} from "./utils/typescript-utils.js";

const DEFAULT_JSX_IMPORT_SOURCE = "@swissjs/core";

export class UiCompiler {
  private _options: CompileOptions;
  private _jsxImportSource: string;

  constructor(options: CompileOptions = {}) {
    this._options = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      ...options,
    };
    this._jsxImportSource = options.jsxImportSource ?? DEFAULT_JSX_IMPORT_SOURCE;
  }

  async compileFile(filePath: string, outputPath?: string): Promise<string> {
    const source = await this.readFile(filePath);
    const compiled = await this.compile(source, filePath);

    if (outputPath) {
      await this.writeFile(outputPath, compiled);
    }

    return compiled;
  }

  // compile() and compileAsync() used to be two separate implementations
  // that were expected to be kept in sync by hand ("Ideally compileAsync
  // matches the logic of compile" -- an aspiration that had already drifted
  // false: compile() only ran JSX transform for .uix, never .ui, so any .ui
  // file compiled through compile()/compileFile() came out with raw,
  // untransformed JSX syntax). compileAsync() is the one real production
  // code paths actually use -- swite's dev server (base-handler.ts) and its
  // build engine (builder.ts) both call compileAsync() exclusively, never
  // compile() -- so it's the version that's actually been exercised and
  // hardened. compile() now just delegates to it; nothing needs two
  // divergent implementations to maintain.
  async compile(source: string, filePath: string): Promise<string> {
    return this.compileAsync(source, filePath);
  }

  // Async compile method for complex cases (JSX, TypeScript)
  async compileAsync(source: string, filePath: string): Promise<string> {
    // Apply Swiss syntax transformation for .ui and .uix files
    let processedSource = source;
    if (filePath.endsWith(".ui") || filePath.endsWith(".uix")) {
      const { preprocessSwissSyntax } = await import(
        "./transformers/swiss-syntax.js"
      );
      processedSource = preprocessSwissSyntax(source, filePath, this._jsxImportSource);
      // Strip JSDoc comments (/** ... */) to prevent parsing issues
      processedSource = this.stripJSDocComments(processedSource);
    }

    if (filePath.endsWith(".uix")) {
      // Treat as TSX (TypeScript + JSX)
      // 1. Transform JSX -> JS (h calls)
      // 2. Transform TS -> JS
      const result = processImports(processedSource, filePath);
      const jsxTransformed = await this.transformJsxWithEsbuild(
        result,
        filePath,
      );
      // The JSX transform outputs JS, but we might still have some TS syntax if not fully stripped?
      // Actually esbuild 'tsx' loader handles both.
      return jsxTransformed;
    }

    if (filePath.endsWith(".ui")) {
      // .ui files MAY contain JSX in render() methods -- when they do, must
      // use the JSX transform pipeline (same as .uix) so output is
      // createElement() calls, not raw JSX syntax. Using jsx:"preserve" here
      // caused es-module-lexer to fail (CG-02).
      //
      // But unlike .uix (which is JSX/layout-composition by convention --
      // every real .uix file has JSX in it), .ui is documented as "component
      // files -- everything SwissJS UI + logic", and plenty of real .ui
      // files are pure logic/config with no JSX at all (e.g. an html``
      // tagged-template component, or a non-visual service class). Running
      // esbuild's tsx-loader transform unconditionally on those re-serializes
      // the whole file as a side effect of the JSX pass -- stripping/
      // reformatting comments the file never asked to have touched -- even
      // though there was no JSX to transform. Only pay that cost when the
      // file actually has JSX in it.
      const result = processImports(processedSource, filePath);
      if (!this.sourceHasJsx(result)) {
        return result;
      }
      return this.transformJsxWithEsbuild(result, filePath);
    }

    // Handle .tsx files (standard TypeScript + JSX)
    if (filePath.endsWith(".tsx")) {
      return this.transformJsxWithEsbuild(source, filePath);
    }

    // Every other extension (.ts, .js, ...) still needs import processing --
    // this is also where invalid-import diagnostics live (e.g. the '1ui'
    // pseudo-import check), which previously ran unconditionally for every
    // file compile() touched, before compile() was consolidated to delegate
    // here. Skipping it for "plain" files silently dropped that validation.
    return processImports(source, filePath);
  }

  // Parses `source` as TSX and walks the AST for an actual JSX node, rather
  // than a regex heuristic -- `<Foo` shows up in plenty of non-JSX TS too
  // (generics, comparisons), and TypeScript's own parser is already a
  // dependency here. A parse error means the source isn't valid TSX as-is
  // (e.g. it still has un-transformed html`` tagged templates the caller
  // hasn't processed yet), which just means "no JSX", not a hard failure --
  // the caller falls back to leaving the source untouched either way.
  private sourceHasJsx(source: string): boolean {
    const sourceFile = ts.createSourceFile(
      "check.tsx",
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      ts.ScriptKind.TSX,
    );
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }

  private async transformJsxWithEsbuild(
    source: string,
    filePath: string,
  ): Promise<string> {
    try {
      // Add createElement import if JSX is present and import doesn't exist
      let modifiedSource = source;
      // Detect if createElement is already imported from any package
      const hasCreateElementImport =
        /\bimport\s+\{[^}]*\bcreateElement\b[^}]*\}\s+from\s+['"][^'"]+['"]/i.test(source);

      if (!hasCreateElementImport) {
        const importStatement =
          `import { createElement, Fragment } from '${this._jsxImportSource}';\n`;

        // Find the last import statement
        const importRegex = /^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm;
        const imports = source.match(importRegex);

        if (imports && imports.length > 0) {
          // Insert after the last import
          const lastImport = imports[imports.length - 1];
          const lastImportIndex = source.lastIndexOf(lastImport);
          const insertIndex = lastImportIndex + lastImport.length;
          modifiedSource =
            source.slice(0, insertIndex) +
            "\n" +
            importStatement +
            source.slice(insertIndex);
        } else {
          // No imports found, add at the beginning
          modifiedSource = importStatement + "\n" + source;
        }
      }

      // Use esbuild to transform JSX - much more reliable than TypeScript
      const result = await transform(modifiedSource, {
        loader: "tsx",
        jsx: "transform",
        jsxFactory: "createElement",
        jsxFragment: "Fragment",
        target: "es2020",
        format: "esm",
      });

      return result.code;
    } catch (error) {
      console.error(`[JSX Transform] esbuild ERROR in ${filePath}:`, error);
      // Return original source on error
      return source;
    }
  }

  // Strip JSDoc comments (/** ... */) from source code.
  // This prevents parsing issues in .ui/.uix files where JSDoc syntax might
  // not be handled correctly.
  //
  // DISC-2026-08-24-001: this used to be a single regex
  // (/\/\*\*[\s\S]*?\*\//g) applied to the raw source. Because it had no
  // notion of // line comments or string/template/regex literals, a "/**"
  // appearing inside any of those (e.g. a glob like `queue/**/*.yaml` inside
  // a // comment) opened a false JSDoc block that consumed everything up to
  // the next literal "*/" anywhere later in the file, silently deleting real
  // code. This scans token-by-token instead, so only a genuine `/**...*/`
  // block comment -- one that actually starts a comment at that position --
  // is ever removed.
  private stripJSDocComments(source: string): string {
    const n = source.length;
    let result = "";
    let i = 0;
    // Last significant (non-whitespace, non-comment) token text, used for
    // the standard regex-vs-division heuristic: a `/` starts a regex
    // literal unless the previous token was something a value could follow
    // a binary/division operator (an identifier/number/`)`/`]`), in which
    // case `/` is division.
    let lastToken = "";

    while (i < n) {
      const c = source[i];
      const c2 = i + 1 < n ? source[i + 1] : "";

      // Line comment: copy through end of line untouched.
      if (c === "/" && c2 === "/") {
        const end = source.indexOf("\n", i);
        const stop = end === -1 ? n : end;
        result += source.slice(i, stop);
        i = stop;
        continue;
      }

      // Block comment: either a JSDoc block (/** ... */) to strip, or a
      // regular block comment (/* ... */) to preserve verbatim.
      if (c === "/" && c2 === "*") {
        const isJSDoc = i + 2 < n && source[i + 2] === "*";
        // Mirrors the original regex's lazy match: search for the closing
        // "*/" starting right after the opening delimiter (3 chars for
        // "/**", 2 chars for "/*").
        const searchFrom = i + (isJSDoc ? 3 : 2);
        const end = source.indexOf("*/", searchFrom);
        if (end === -1) {
          // Unterminated block comment: never delete to EOF. Leave the
          // remainder of the source exactly as-is.
          result += source.slice(i);
          i = n;
          break;
        }
        if (isJSDoc) {
          // Strip: emit nothing for this block.
          i = end + 2;
        } else {
          result += source.slice(i, end + 2);
          i = end + 2;
        }
        continue;
      }

      // String literals.
      if (c === "'" || c === '"') {
        const quote = c;
        let j = i + 1;
        while (j < n) {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (source[j] === quote) {
            j++;
            break;
          }
          j++;
        }
        result += source.slice(i, j);
        i = j;
        lastToken = quote;
        continue;
      }

      // Template literals, including nested `${ ... }` expressions (which
      // may themselves contain strings, comments, regexes, and further
      // nested templates). Preserved verbatim: we don't attempt to strip
      // JSDoc-shaped comments that live inside a template expression, since
      // walking back out of the template correctly matters far more than
      // that cosmetic case.
      if (c === "`") {
        const end = this.scanTemplateLiteral(source, i);
        result += source.slice(i, end);
        i = end;
        lastToken = "`";
        continue;
      }

      // Regex literal vs division: only scan `/` as a regex when the
      // previous token means a value is expected here (i.e. NOT after an
      // identifier/number/`)`/`]`, which would make `/` division instead).
      if (c === "/" && this.isRegexContext(lastToken)) {
        const end = this.scanRegexLiteral(source, i);
        if (end !== -1) {
          result += source.slice(i, end);
          i = end;
          lastToken = "/";
          continue;
        }
        // Not actually a valid regex literal (no unescaped closing `/`
        // before EOF/newline) -- fall through and treat `/` as an ordinary
        // character.
      }

      // Default: copy the character through, tracking the last significant
      // token for the regex-vs-division heuristic.
      if (/\s/.test(c)) {
        result += c;
        i++;
        continue;
      }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j++;
        const word = source.slice(i, j);
        result += word;
        lastToken = word;
        i = j;
        continue;
      }
      result += c;
      lastToken = c;
      i++;
    }

    return result;
  }

  // Keywords after which a following `/` must be a regex literal (they
  // never leave a value on the "stack" for `/` to divide).
  private static readonly REGEX_CONTEXT_KEYWORDS = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "throw", "case", "do", "else", "yield", "await",
  ]);

  private isRegexContext(lastToken: string): boolean {
    if (lastToken === "") return true; // start of source
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lastToken)) {
      // Ends in an identifier/keyword: regex only after a keyword that
      // expects an expression next; otherwise it's division (e.g. `a / b`).
      return UiCompiler.REGEX_CONTEXT_KEYWORDS.has(lastToken);
    }
    if (/^[0-9]/.test(lastToken)) return false; // number literal -> division
    if (lastToken === ")" || lastToken === "]") return false; // division
    return true; // operators, `(`, `{`, `,`, `;`, `=`, etc. -> regex
  }

  // Scans a regex literal starting at `source[start]` (`/`). Returns the
  // index just past the closing `/` and its flags, or -1 if this isn't a
  // valid (single-line) regex literal.
  private scanRegexLiteral(source: string, start: number): number {
    const n = source.length;
    let i = start + 1;
    let inClass = false;
    while (i < n) {
      const c = source[i];
      if (c === "\n") return -1; // unterminated on this line -> not a regex
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "[") {
        inClass = true;
        i++;
        continue;
      }
      if (c === "]") {
        inClass = false;
        i++;
        continue;
      }
      if (c === "/" && !inClass) {
        i++;
        break;
      }
      i++;
    }
    if (i >= n || source[i - 1] !== "/") return -1;
    // Consume flags.
    while (i < n && /[A-Za-z]/.test(source[i])) i++;
    return i;
  }

  // Scans a template literal starting at `source[start]` (the opening `` ` ``),
  // including nested `${ ... }` expressions which may contain strings,
  // further template literals, comments, and braces. Returns the index just
  // past the closing `` ` ``, or the source length if unterminated.
  private scanTemplateLiteral(source: string, start: number): number {
    const n = source.length;
    let i = start + 1;
    while (i < n) {
      const c = source[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        return i + 1;
      }
      if (c === "$" && source[i + 1] === "{") {
        i = this.scanTemplateExpression(source, i + 2);
        continue;
      }
      i++;
    }
    return n; // unterminated -> consume to end
  }

  // Scans the body of a `${ ... }` template expression starting just after
  // the `{`, tracking nested braces, strings, nested templates, and
  // comments so an embedded `}` (e.g. inside a string) doesn't end the
  // expression early. Returns the index just past the matching `}`.
  private scanTemplateExpression(source: string, start: number): number {
    const n = source.length;
    let i = start;
    let depth = 1;
    while (i < n && depth > 0) {
      const c = source[i];
      if (c === "{") {
        depth++;
        i++;
        continue;
      }
      if (c === "}") {
        depth--;
        i++;
        continue;
      }
      if (c === "`") {
        i = this.scanTemplateLiteral(source, i);
        continue;
      }
      if (c === "'" || c === '"') {
        const quote = c;
        let j = i + 1;
        while (j < n) {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (source[j] === quote) {
            j++;
            break;
          }
          j++;
        }
        i = j;
        continue;
      }
      if (c === "/" && source[i + 1] === "/") {
        const end = source.indexOf("\n", i);
        i = end === -1 ? n : end;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      i++;
    }
    return i;
  }

  async compileDirectory(inputDir: string, outputDir: string): Promise<void> {
    const files = await findFiles(inputDir, ".ui");
    for (const file of files) {
      const relativePath = path.relative(inputDir, file);
      const outputPath = path.join(
        outputDir,
        relativePath.replace(/\.ui$/, ".js"),
      );
      await this.compileFile(file, outputPath);
    }
  }

  /**
   * Transpile all TypeScript files under inputDir to JavaScript into outputDir.
   * Used by the CLI build to finalize the .swiss-temp output.
   */
  async compileTypeScriptToJavaScript(
    inputDir: string,
    outputDir: string,
  ): Promise<boolean> {
    try {
      const tsFiles = await findTypeScriptFiles(inputDir);
      for (const tsFile of tsFiles) {
        const rel = path.relative(inputDir, tsFile);
        const outFile = path.join(outputDir, rel).replace(/\.ts$/, ".js");
        const source = await this.readFile(tsFile);
        const js = await transpileTs(source, tsFile, {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
        });
        await ensureDirectoryExists(path.dirname(outFile));
        await fsp.writeFile(outFile, js, "utf-8");
      }
      return true;
    } catch (error) {
      console.error("TypeScript transpile failed:", error);
      return false;
    }
  }

  async watch(inputPath: string, outputPath?: string): Promise<void> {
    const chokidar = await import("chokidar");
    const watcher = chokidar.watch(inputPath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("change", async (file: string) => {
      if (file.endsWith(".ui")) {
        try {
          console.log(`Recompiling ${path.relative(process.cwd(), file)}`);
          await this.compileFile(
            file,
            outputPath || file.replace(/\.ui$/, ".js"),
          );
        } catch (error) {
          console.error("Compilation error:", error);
        }
      }
    });
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const content = await fsp.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}\n${error}`);
    }
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await ensureDirectoryExists(path.dirname(filePath));
      await fsp.writeFile(filePath, content, "utf-8");
    } catch (error) {
      throw new Error(`Failed to write file: ${filePath}\n${error}`);
    }
  }
}
