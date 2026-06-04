/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import * as ts from "typescript";
import { fixDtsExtensions as sharedFixDtsExtensions } from "@swissjs/shared";
export { sharedFixDtsExtensions as fixDtsExtensions };

export async function compileUiFilesToJavaScript(
  srcDir: string,
  outDir: string,
  debug = false,
): Promise<void> {
  if (debug)
    console.log(
      chalk.yellow(
        `[compileUiFilesToJavaScript] Scanning for .ui/.uix files in ${srcDir}`,
      ),
    );
  const oneUiFiles = await findFiles(srcDir, ".ui");
  const uixFiles = await findFiles(srcDir, ".uix");
  const allSourceFiles = [...oneUiFiles, ...uixFiles];

  if (allSourceFiles.length === 0) {
    if (debug)
      console.log(
        chalk.yellow("⚠️  No .ui/.uix files found - pure TypeScript project"),
      );
    return;
  }

  if (debug)
    console.log(
      chalk.yellow(
        `[compileUiFilesToJavaScript] Emitting ${allSourceFiles.length} source file(s) as JavaScript (.js)...`,
      ),
    );
  console.log(
    chalk.blue(
      `🔨 Processing ${allSourceFiles.length} .ui/.uix file(s) as JavaScript (.js)...`,
    ),
  );
  console.log(
    chalk.gray("  Direct .ui/.uix → .js compilation for browser-ready code"),
  );

  try {
    const { UiCompiler } = await import("@swissjs/compiler");
    const compiler = new UiCompiler({
      outputFormat: "javascript",
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    });

    for (const file of allSourceFiles) {
      const relPath = path.relative(srcDir, file);
      const outputExtension = ".js";
      const outputPath = path.join(
        outDir,
        relPath.replace(/\.uix?$/, outputExtension),
      );
      await fs.ensureDir(path.dirname(outputPath));
      if (debug)
        console.log(
          chalk.yellow(
            `[compileUiFilesToJavaScript] Writing ${relPath} → ${path.relative(outDir, outputPath)}`,
          ),
        );
      let jsCode = await compiler.compileFile(file);
      // Remove any import of createElement or Fragment from @swissjs/core (legacy guard)
      jsCode = jsCode.replace(
        /import\s*\{[^}]*createElement[^}]*\}[^;]*;?\n?/g,
        "",
      );
      jsCode = jsCode.replace(/import\s*\{[^}]*Fragment[^}]*\}[^;]*;?\n?/g, "");
      // Rewrite relative .ui, .uix, and compiler-normalized .tsx imports to .js.
      // The UiCompiler's processImports converts .ui/.uix → .tsx internally,
      // so we must also catch .tsx here to produce valid browser JS.
      jsCode = jsCode.replace(
        /from ['"](\.\/?[\w/-]+)\.(uix?|tsx)['"]/g,
        (match, importPath) => {
          return `from '${importPath}${outputExtension}'`;
        },
      );
      // Transpile TypeScript to JavaScript
      const result = ts.transpileModule(jsCode, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.React,
          jsxFactory: "createElement",
          jsxFragmentFactory: "Fragment",
        },
      });
      jsCode = result.outputText;
      if (debug) {
        console.log(
          chalk.yellow(
            `[compileUiFilesToJavaScript] Output for ${relPath}:\n---\n${jsCode}\n---`,
          ),
        );
      }
      await fs.writeFile(outputPath, jsCode, "utf8");
      console.log(
        chalk.green(`  ✅ ${relPath} → ${path.relative(outDir, outputPath)}`),
      );
    }
    console.log(
      chalk.green(
        `🎉 All .ui/.uix files processed! Your codebase is now browser-ready JavaScript (.js).`,
      ),
    );

    // Write .swiss-temp/tsconfig.json for dev server and tsc
    const tempTsConfigPath = path.join(outDir, "tsconfig.json");
    const tempTsConfig = {
      extends: path.relative(outDir, path.join(process.cwd(), "tsconfig.json")),
      compilerOptions: {
        types: ["@swissjs/core"],
      },
      include: ["**/*"],
    };
    await fs.writeJson(tempTsConfigPath, tempTsConfig, { spaces: 2 });
  } catch (error) {
    console.error(chalk.red("❌ Failed to compile .ui files:"), error);
    process.exit(1);
  }
}

async function findFiles(dir: string, extension: string): Promise<string[]> {
  const files: string[] = [];
  async function scan(currentDir: string) {
    const items = await fs.readdir(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = await fs.stat(fullPath);
      if (
        stat.isDirectory() &&
        !item.startsWith(".") &&
        item !== "node_modules"
      ) {
        await scan(fullPath);
      } else if (item.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }
  await scan(dir);
  return files;
}
