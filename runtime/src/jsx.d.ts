/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * JSX namespace for SwissJS.
 * Consumed by TypeScript when compilerOptions.jsxImportSource = "@swissjs/core".
 */
declare namespace JSX {
  type Element = import("./vdom/vdom.js").VNode;

  interface ElementClass {
    render(): import("./vdom/vdom.js").VNode | null;
  }

  interface ElementAttributesProperty {
    props: {};
  }

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}
