/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export { SwissFramework } from './framework.js';
export { SWISS_VERSION } from './version.js';
export { SwissApp } from './app.js';
export { ExpressionEvaluator, type ExpressionContext, type ExpressionOptions } from './expression-evaluator.js';

// Legacy exports
import { SwissFramework as SF } from './framework.js';
import { SWISS_VERSION as VER } from './version.js';
import { SwissApp as SA } from './app.js';
import { ExpressionEvaluator as EE } from './expression-evaluator.js';

export const framework = { 
  SwissFramework: SF, 
  SwissApp: SA, 
  ExpressionEvaluator: EE, 
  SWISS_VERSION: VER 
};
