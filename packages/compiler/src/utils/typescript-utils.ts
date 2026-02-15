import * as ts from "typescript";
import fs from "fs-extra";
import * as path from "path";

/**
 * Removes interface declarations with proper brace counting
 */
function removeInterfaceDeclarations(code: string): string {
  const interfaceRegex = /(export\s+)?interface\s+\w+\s*(\{)/g;
  let result = code;
  let match;
  let removedCount = 0;

  while ((match = interfaceRegex.exec(result)) !== null) {
    const startIndex = match.index;
    const openBraceIndex = match.index + match[0].length - 1;
    
    // Count braces to find the matching closing brace
    let braceCount = 1;
    let endIndex = openBraceIndex + 1;
    
    while (braceCount > 0 && endIndex < result.length) {
      if (result[endIndex] === '{') braceCount++;
      else if (result[endIndex] === '}') braceCount--;
      endIndex++;
    }
    
    // Remove the interface declaration
    result = result.slice(0, startIndex) + result.slice(endIndex);
    removedCount++;
    
    // Reset regex to search from the beginning (since we modified the string)
    interfaceRegex.lastIndex = 0;
  }
  
  if (removedCount > 0) {
    console.log(`[TS Utils] Removed ${removedCount} interface declarations before TS compilation`);
  }
  
  return result;
}

/**
 * Compiles TypeScript code to JavaScript
 */
export async function compileTypeScriptToJavaScript(
  source: string,
  filePath: string,
  options: {
    target?: ts.ScriptTarget;
    module?: ts.ModuleKind;
    sourceMap?: boolean;
  } = {},
): Promise<string> {
  const compilerOptions: ts.CompilerOptions = {
    target: options.target || ts.ScriptTarget.ES2020,
    module: options.module || ts.ModuleKind.ESNext,
    strict: false,
    skipLibCheck: true,
    removeComments: false,
    preserveConstEnums: true,
    declaration: false,
    sourceMap: options.sourceMap !== false,
    isolatedModules: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: ts.JsxEmit.Preserve,
  };

  // Pre-process to handle 'import type' statements
  let processedSource = source
    // Remove 'import type' statements (they're only for TypeScript)
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g, "")
    // Convert regular type-only imports to comments
    .replace(/\/\/\s+import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g, "");

  // Remove interface declarations before TS compilation (with proper brace counting)
  processedSource = removeInterfaceDeclarations(processedSource);
  
  // Remove type alias declarations
  processedSource = processedSource.replace(/export\s+type\s+\w+\s*=\s*[^;]+;/gs, "");
  processedSource = processedSource.replace(/(?<!export\s)type\s+\w+\s*=\s*[^;]+;/gs, "");

  // Transpile TypeScript to JavaScript
  // Ensure we use a .ts extension so the compiler recognizes it as TypeScript
  const result = ts.transpileModule(processedSource, {
    compilerOptions,
    fileName: filePath.endsWith(".ui") ? filePath + ".ts" : filePath,
    reportDiagnostics: true,
  });

  if (result.diagnostics && result.diagnostics.length > 0) {
    console.warn(`[TS Utils] Warnings/Errors during transpilation of ${filePath}:`);
    result.diagnostics.forEach((diag) => {
      console.warn(
        `  - ${ts.flattenDiagnosticMessageText(diag.messageText, "\n")}`,
      );
    });
  }

  return result.outputText;
}

/**
 * Finds all TypeScript files in a directory recursively
 */
export async function findTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTypeScriptFiles(fullPath)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
