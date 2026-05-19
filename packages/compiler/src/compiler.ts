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

const DEFAULT_JSX_IMPORT_SOURCE = "@kibologic/core";

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

  // Compile method with support for both sync and async operations
  // For backward compatibility, it's marked as async but can be used synchronously for simple cases
  async compile(source: string, filePath: string): Promise<string> {
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

    // Process imports
    let result = processImports(processedSource, filePath);

    // Check if this is a .uix file (JSX support)
    const isUixFile = filePath.endsWith(".uix");

    if (isUixFile) {
      // Transform JSX in .uix files
      try {
        const { transformWithJsx } = await import(
          "./transformers/jsx-transformer.js"
        );
        result = transformWithJsx(result, filePath, this._jsxImportSource);
      } catch (error) {
        console.error("Error transforming JSX:", error);
        throw error;
      }
    }

    // For JSX and TypeScript, we need async processing
    // This method is kept synchronous for backward compatibility with tests
    // For full async processing, use compileAsync
    return result;
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

    // For .uix files, we've already handled JSX in the compile method if called synchronously,
    // but here we ensure it goes through the async pipeline if needed.
    // Ideally compileAsync matches the logic of compile but purely async.

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
      // .ui files contain JSX in render() methods — must use JSX transform pipeline
      // (same as .uix) so output is createElement() calls, not raw JSX syntax.
      // Using jsx:"preserve" here caused es-module-lexer to fail (CG-02).
      const result = processImports(processedSource, filePath);
      return this.transformJsxWithEsbuild(result, filePath);
    }

    // Handle .tsx files (standard TypeScript + JSX)
    if (filePath.endsWith(".tsx")) {
      return this.transformJsxWithEsbuild(source, filePath);
    }

    return source;
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

  // Strip JSDoc comments from source code
  // This prevents parsing issues in .ui/.uix files where JSDoc syntax might not be handled correctly
  private stripJSDocComments(source: string): string {
    return source.replace(/\/\*\*[\s\S]*?\*\//g, "");
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
