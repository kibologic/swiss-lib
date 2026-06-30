/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export { UiCompiler } from "./compiler.js";
export {
    preprocessSwissSyntax,
    transformSwissSyntax,
    swissSyntaxTransformer,
} from "./transformers/swiss-syntax.js";
export type { CompileOptions } from "./types.js";
export { parseTemplate } from "./template-parser.js";
export type {
    TemplateAST,
    TemplateNode,
    TemplateNodeKind,
    TemplateParseError,
    TemplatePropValue,
    Position,
} from "./template-parser.js";
