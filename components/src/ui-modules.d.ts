/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Wildcard ambient declaration for .ui and .uix files
declare module '*.ui' {
  const content: unknown;
  export = content;
}

declare module '*.uix' {
  const content: unknown;
  export = content;
}
