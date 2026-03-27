import * as ts from 'typescript';

export interface CompileOptions {
  target?: ts.ScriptTarget;
  module?: ts.ModuleKind;
  sourceMap?: boolean;
  outputFormat?: 'typescript' | 'javascript';
}
