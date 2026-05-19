import * as ts from 'typescript';

export interface CompileOptions {
  target?: ts.ScriptTarget;
  module?: ts.ModuleKind;
  sourceMap?: boolean;
  outputFormat?: 'typescript' | 'javascript';
  /**
   * Package that exports createElement, Fragment, and Signal.
   * Defaults to the framework's own core package but can be set to any
   * package that satisfies the same interface (e.g. a fork or re-export).
   */
  jsxImportSource?: string;
}
